import { openDB } from "idb";

const DATABASE_NAME = "univault";
const DATABASE_VERSION = 1;

const STORES = {
  FILES: "files",
  SELECTION: "selection",
  QUEUE: "queue",
  FOLDER_MAP: "folderMap",
};

let dbPromise = null;

/**
 * Initializes the IndexedDB database, handling version upgrades and migrations.
 * @returns {Promise<import('idb').IDBPDatabase>}
 */
export async function initDB() {
  if (dbPromise) return dbPromise;

  dbPromise = openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      console.log(
        `[IndexedDB] Upgrading database from v${oldVersion} to v${newVersion}`,
      );

      // Build stores dynamically if they do not exist
      if (!db.objectStoreNames.contains(STORES.FILES)) {
        db.createObjectStore(STORES.FILES, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORES.SELECTION)) {
        db.createObjectStore(STORES.SELECTION, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORES.QUEUE)) {
        db.createObjectStore(STORES.QUEUE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORES.FOLDER_MAP)) {
        db.createObjectStore(STORES.FOLDER_MAP, { keyPath: "id" });
      }
    },
  });

  return dbPromise;
}

// ----------------------------------------------------
// Publisher / Subscriber Broker setup
// ----------------------------------------------------
const selectionListeners = new Set();
const queueListeners = new Set();

function notifySelectionChange(selectionSet) {
  selectionListeners.forEach((cb) => {
    try {
      cb(selectionSet);
    } catch (e) {
      console.error("[PubSub] Selection listener failure:", e);
    }
  });
}

function notifyQueueChange(queueArray) {
  queueListeners.forEach((cb) => {
    try {
      cb(queueArray);
    } catch (e) {
      console.error("[PubSub] Queue listener failure:", e);
    }
  });
}

// ----------------------------------------------------
// Files Store API
// ----------------------------------------------------
export const FileStore = {
  async putFiles(filesArray) {
    const db = await initDB();
    const tx = db.transaction(STORES.FILES, "readwrite");
    const store = tx.objectStore(STORES.FILES);
    for (const file of filesArray) {
      await store.put(file);
    }
    await tx.done;
  },

  async getAllFiles() {
    const db = await initDB();
    return db.getAll(STORES.FILES);
  },

  async clear() {
    const db = await initDB();
    const tx = db.transaction(STORES.FILES, "readwrite");
    await tx.objectStore(STORES.FILES).clear();
    await tx.done;
  },
};

// ----------------------------------------------------
// Selection Store API
// ----------------------------------------------------
export const SelectionStore = {
  async addSelection(id) {
    const db = await initDB();
    const tx = db.transaction(STORES.SELECTION, "readwrite");
    await tx.objectStore(STORES.SELECTION).put({ id });
    await tx.done;

    const selection = await this.getSelection();
    notifySelectionChange(selection);
  },

  async removeSelection(id) {
    const db = await initDB();
    const tx = db.transaction(STORES.SELECTION, "readwrite");
    await tx.objectStore(STORES.SELECTION).delete(id);
    await tx.done;

    const selection = await this.getSelection();
    notifySelectionChange(selection);
  },

  async setSelection(idsSet) {
    const db = await initDB();
    const tx = db.transaction(STORES.SELECTION, "readwrite");
    const store = tx.objectStore(STORES.SELECTION);
    await store.clear();
    for (const id of idsSet) {
      await store.put({ id });
    }
    await tx.done;

    const selection = new Set(idsSet);
    notifySelectionChange(selection);
  },

  async getSelection() {
    const db = await initDB();
    const all = await db.getAll(STORES.SELECTION);
    return new Set(all.map((item) => item.id));
  },

  subscribe(callback) {
    selectionListeners.add(callback);
    // Initial emission support for reactive sync on mount
    this.getSelection().then((selection) => {
      if (selectionListeners.has(callback)) {
        callback(selection);
      }
    });
    return () => {
      selectionListeners.delete(callback);
    };
  },

  async clear() {
    const db = await initDB();
    const tx = db.transaction(STORES.SELECTION, "readwrite");
    await tx.objectStore(STORES.SELECTION).clear();
    await tx.done;
    notifySelectionChange(new Set());
  },
};

// ----------------------------------------------------
// Queue Store API (Enforces PERS-03: persist-before-mutate)
// ----------------------------------------------------
export const QueueStore = {
  /**
   * Updates or inserts a task.
   * Awaits transaction.done explicitly to enforce atomic disk write.
   * @param {string} id - Google File ID
   * @param {Object} updates - Task state updates
   */
  async updateTask(id, updates) {
    const db = await initDB();
    const tx = db.transaction(STORES.QUEUE, "readwrite");
    const store = tx.objectStore(STORES.QUEUE);

    const existing = await store.get(id);
    const updatedTask = {
      id,
      status: "pending",
      bytesCopied: 0,
      errorMsg: null,
      destFileId: null,
      ...existing,
      ...updates,
    };

    await store.put(updatedTask);

    // MANDATORY PERS-03: Explicitly await native hardware commit
    await tx.done;

    const queue = await this.getTasks();
    notifyQueueChange(queue);
  },

  async getTasks() {
    const db = await initDB();
    return db.getAll(STORES.QUEUE);
  },

  subscribe(callback) {
    queueListeners.add(callback);
    this.getTasks().then((tasks) => {
      if (queueListeners.has(callback)) {
        callback(tasks);
      }
    });
    return () => {
      queueListeners.delete(callback);
    };
  },

  async clear() {
    const db = await initDB();
    const tx = db.transaction(STORES.QUEUE, "readwrite");
    await tx.objectStore(STORES.QUEUE).clear();
    await tx.done;
    notifyQueueChange([]);
  },
};

// ----------------------------------------------------
// Folder Map Store API
// ----------------------------------------------------
export const FolderMapStore = {
  async putFolderMapping(id, destFolderId, name) {
    const db = await initDB();
    const tx = db.transaction(STORES.FOLDER_MAP, "readwrite");
    await tx.objectStore(STORES.FOLDER_MAP).put({ id, destFolderId, name });
    await tx.done;
  },

  async getFolderMapping(id) {
    const db = await initDB();
    return db.get(STORES.FOLDER_MAP, id);
  },

  async clear() {
    const db = await initDB();
    const tx = db.transaction(STORES.FOLDER_MAP, "readwrite");
    await tx.objectStore(STORES.FOLDER_MAP).clear();
    await tx.done;
  },
};

// ----------------------------------------------------
// Master Cleanup Utility
// ----------------------------------------------------
export async function clearAllData() {
  const db = await initDB();
  const tx = db.transaction(Object.values(STORES), "readwrite");
  await tx.objectStore(STORES.FILES).clear();
  await tx.objectStore(STORES.SELECTION).clear();
  await tx.objectStore(STORES.QUEUE).clear();
  await tx.objectStore(STORES.FOLDER_MAP).clear();
  await tx.done;

  notifySelectionChange(new Set());
  notifyQueueChange([]);
}
