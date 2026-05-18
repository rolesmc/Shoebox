/**
 * TokenStorage Helper Utility
 * Restricts browser state persistence exclusively to transient security tokens,
 * profile identities, and small operational cursor pointers.
 * Enforces a strict 2 KB maximum payload limit on all write operations.
 */

const MAX_PAYLOAD_BYTES = 2048; // 2 KB strict limit

const STORAGE_KEYS = {
  SOURCE_TOKEN: 'univault_source_token',
  SOURCE_EMAIL: 'univault_source_email',
  DEST_TOKEN: 'univault_dest_token',
  DEST_EMAIL: 'univault_dest_email',
  TOKEN_EXPIRES_AT: 'univault_token_expires_at',
  RESUME_CURSOR: 'univault_resume_cursor'
};

/**
 * Validates payload string size before writing to localStorage
 * @param {string} value - String value to write
 * @throws {Error} If the string exceeds the 2 KB limit
 */
function validateSize(value) {
  if (value === null || value === undefined) return;
  const str = String(value);
  if (str.length > MAX_PAYLOAD_BYTES) {
    throw new Error(`Security Exception: Storage payload of size ${str.length} bytes exceeds strict budget of 2 KB (${MAX_PAYLOAD_BYTES} bytes).`);
  }
}

export const TokenStorage = {
  /**
   * Saves source credentials
   * @param {string} token 
   * @param {string} email 
   * @param {number|string} expiresAt - Timestamp when the source token expires
   */
  saveSourceCredentials(token, email, expiresAt) {
    validateSize(token);
    validateSize(email);
    validateSize(expiresAt);

    if (token) localStorage.setItem(STORAGE_KEYS.SOURCE_TOKEN, token);
    if (email) localStorage.setItem(STORAGE_KEYS.SOURCE_EMAIL, email);
    if (expiresAt) localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRES_AT, String(expiresAt));
  },

  /**
   * Saves destination credentials
   * @param {string} token 
   * @param {string} email 
   */
  saveDestCredentials(token, email) {
    validateSize(token);
    validateSize(email);

    if (token) localStorage.setItem(STORAGE_KEYS.DEST_TOKEN, token);
    if (email) localStorage.setItem(STORAGE_KEYS.DEST_EMAIL, email);
  },

  /**
   * Retrieves all authenticated credentials and expirations
   * @returns {Object} Credentials collection
   */
  getCredentials() {
    return {
      sourceToken: localStorage.getItem(STORAGE_KEYS.SOURCE_TOKEN),
      sourceEmail: localStorage.getItem(STORAGE_KEYS.SOURCE_EMAIL),
      destToken: localStorage.getItem(STORAGE_KEYS.DEST_TOKEN),
      destEmail: localStorage.getItem(STORAGE_KEYS.DEST_EMAIL),
      tokenExpiresAt: localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES_AT) 
        ? Number(localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES_AT)) 
        : null
    };
  },

  /**
   * Saves scanning cursor for transfer resumption
   * @param {string} cursor 
   */
  saveResumeCursor(cursor) {
    validateSize(cursor);
    if (cursor) {
      localStorage.setItem(STORAGE_KEYS.RESUME_CURSOR, cursor);
    } else {
      localStorage.removeItem(STORAGE_KEYS.RESUME_CURSOR);
    }
  },

  /**
   * Retrieves scanning resume cursor
   * @returns {string|null} Cursor string or null
   */
  getResumeCursor() {
    return localStorage.getItem(STORAGE_KEYS.RESUME_CURSOR);
  },

  /**
   * Wipes all credentials and cached cursors
   */
  clearAll() {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  }
};
