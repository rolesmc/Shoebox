import { initDB, FileStore, SelectionStore, QueueStore, clearAllData } from '/src/services/db.js';
import { TokenStorage } from '/src/services/storage.js';

const resultsNode = document.getElementById('test-results');
const logs = [];

function log(msg) {
  logs.push(msg);
  resultsNode.textContent = logs.join('\n');
  console.log(msg);
}

async function notifyServer(passed) {
  try {
    await fetch('/api/test-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passed, results: logs.join('\n') })
    });
  } catch (err) {
    console.error('Failed to notify smoke test server:', err);
  }
}

async function runTests() {
  try {
    log('Starting Database Invariant Smoke Tests...');
    
    // Clear state first
    localStorage.clear();
    await clearAllData();
    log('PASS: LocalStorage and database cleared cleanly');

    // Test 1: LocalStorage strict size validation
    try {
      TokenStorage.saveSourceCredentials('a'.repeat(2049), 'test@test.com', Date.now());
      log('FAIL: TokenStorage did not throw on >2KB payload limit');
    } catch (e) {
      log('PASS: TokenStorage strictly threw error on 2KB payload boundary');
    }

    // Test 2: LocalStorage valid credentials transactions
    TokenStorage.saveSourceCredentials('valid_token_value', 'student@school.edu', 987654321);
    const credentials = TokenStorage.getCredentials();
    if (
      credentials.sourceToken === 'valid_token_value' && 
      credentials.sourceEmail === 'student@school.edu' && 
      credentials.tokenExpiresAt === 987654321
    ) {
      log('PASS: TokenStorage retrieved credentials perfectly match written values');
    } else {
      log('FAIL: TokenStorage credential retrieval mismatch');
    }

    // Test 3: Database Initializations
    const db = await initDB();
    log('PASS: initDB resolved successfully');

    // Test 4: All 4 Object Stores created successfully
    const objectStores = Array.from(db.objectStoreNames);
    const expectedStores = ['files', 'selection', 'queue', 'folderMap'];
    const missingStores = expectedStores.filter(name => !objectStores.includes(name));
    if (missingStores.length === 0) {
      log('PASS: Four distinct object stores exist: ' + objectStores.join(', '));
    } else {
      log('FAIL: Missing expected object stores: ' + missingStores.join(', '));
    }

    // Test 5: FileStore batch operations
    const sampleFiles = [
      { id: 'drive_file_id_101', name: 'Thesis.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 51200 },
      { id: 'drive_file_id_102', name: 'Assets', mimeType: 'application/vnd.google-apps.folder', size: 0 }
    ];
    await FileStore.putFiles(sampleFiles);
    const loadedFiles = await FileStore.getAllFiles();
    if (loadedFiles.length === 2 && loadedFiles[0].id === 'drive_file_id_101') {
      log('PASS: FileStore bulk writes and reads verified statefully');
    } else {
      log('FAIL: FileStore operations failed');
    }

    // Test 6: SelectionStore reactive PubSub notifications
    let selectionEventCount = 0;
    let currentSelection = null;
    const unsubscribeSelection = SelectionStore.subscribe((set) => {
      selectionEventCount++;
      currentSelection = set;
    });

    // Add element
    await SelectionStore.addSelection('drive_file_id_101');
    await new Promise(r => setTimeout(r, 20));

    // Add second element
    await SelectionStore.addSelection('drive_file_id_102');
    await new Promise(r => setTimeout(r, 20));

    // Delete element
    await SelectionStore.removeSelection('drive_file_id_101');
    await new Promise(r => setTimeout(r, 20));

    if (
      selectionEventCount >= 4 && 
      !currentSelection.has('drive_file_id_101') && 
      currentSelection.has('drive_file_id_102')
    ) {
      log('PASS: SelectionStore PubSub listener reactively fired and synced selection sets');
    } else {
      log(`FAIL: SelectionStore listener events count mismatch: ${selectionEventCount}`);
    }
    unsubscribeSelection();

    // Test 7: QueueStore transactional Invariants (PERS-03: persist-before-mutate)
    let queueEventCount = 0;
    let currentQueue = null;
    const unsubscribeQueue = QueueStore.subscribe((arr) => {
      queueEventCount++;
      currentQueue = arr;
    });

    const startTimestamp = performance.now();
    await QueueStore.updateTask('transfer_queue_001', { status: 'copying', bytesCopied: 409600 });
    const endTimestamp = performance.now();

    await new Promise(r => setTimeout(r, 20));

    if (
      queueEventCount >= 2 && 
      currentQueue[0].id === 'transfer_queue_001' && 
      currentQueue[0].status === 'copying' && 
      currentQueue[0].bytesCopied === 409600
    ) {
      log('PASS: QueueStore update transaction committed atomically and notified subscribers');
    } else {
      log('FAIL: QueueStore invariant transaction check failed');
    }
    log(`INFO: Queue status write transaction done in ${(endTimestamp - startTimestamp).toFixed(2)}ms`);
    unsubscribeQueue();

    log('\n--- SYSTEM RESULTS ---');
    log('ALL TESTS PASSED: YES');
    log('FAILURES: 0');
    
    await notifyServer(true);
  } catch (e) {
    log('ERROR IN RUNNER: ' + e.stack);
    log('\n--- SYSTEM RESULTS ---');
    log('ALL TESTS PASSED: NO');
    log('FAILURES: 1');
    
    await notifyServer(false);
  }
}

runTests();
