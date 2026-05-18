// GoogleAuth Service — handles GIS oauth2 initTokenClient, popup handlers, and dev stubs.
// Preserves strict isolation between source (school) and dest (personal) clients (D1/D2/D5/A2).

const SOURCE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email"
].join(" ");

const DEST_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email"
].join(" ");

let sourceClient = null;
let destClient = null;
let registeredCallbacks = null;
let isRealOAuth = false;

// Keeps mock tokens mapped to selected emails
const mockTokenCache = new Map();

export const GoogleAuth = {
  /**
   * Initializes the OAuth clients or hooks into fallback callbacks.
   * @param {Object} callbacks { onSourceSuccess, onDestSuccess, onError, openMockModal }
   */
  initClients: (callbacks) => {
    registeredCallbacks = callbacks;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const hasGsi = typeof window !== "undefined" && window.google?.accounts?.oauth2;

    if (clientId && hasGsi) {
      isRealOAuth = true;
      try {
        // Initialize Source (School) Client
        sourceClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SOURCE_SCOPES,
          callback: (response) => {
            if (response.error) {
              callbacks.onError(response.error);
              return;
            }
            if (response.access_token) {
              const expiresAt = Date.now() + (parseInt(response.expires_in, 10) || 3600) * 1000;
              callbacks.onSourceSuccess({
                token: response.access_token,
                expiresAt,
              });
            }
          },
        });

        // Initialize Destination (Personal) Client
        destClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: DEST_SCOPES,
          callback: (response) => {
            if (response.error) {
              callbacks.onError(response.error);
              return;
            }
            if (response.access_token) {
              const expiresAt = Date.now() + (parseInt(response.expires_in, 10) || 3600) * 1000;
              callbacks.onDestSuccess({
                token: response.access_token,
                expiresAt,
              });
            }
          },
        });

        console.log("UniVault: Real Google Identity Services clients initialized successfully.");
      } catch (err) {
        console.error("UniVault: Failed to initialize GIS client. Falling back to mock.", err);
        isRealOAuth = false;
      }
    } else {
      isRealOAuth = false;
      console.log(
        `UniVault: Running in Offline/Mock auth mode. (Has GSI script: ${!!hasGsi}, Client ID defined: ${!!clientId})`
      );
    }
  },

  /**
   * Launches Source Account (School) login popup flow.
   */
  connectSource: () => {
    if (isRealOAuth && sourceClient) {
      sourceClient.requestAccessToken({ prompt: "consent" });
    } else if (registeredCallbacks?.openMockModal) {
      registeredCallbacks.openMockModal("source");
    } else {
      console.error("UniVault: GoogleAuth callbacks are not initialized.");
    }
  },

  /**
   * Launches Destination Account (Personal) login popup flow.
   */
  connectDest: () => {
    if (isRealOAuth && destClient) {
      destClient.requestAccessToken({ prompt: "consent" });
    } else if (registeredCallbacks?.openMockModal) {
      registeredCallbacks.openMockModal("dest");
    } else {
      console.error("UniVault: GoogleAuth callbacks are not initialized.");
    }
  },

  /**
   * Fetches authenticating user's email immediately after consent.
   * Runs raw GET request to Google userinfo API.
   * @param {string} token Access token
   * @returns {Promise<string>} User email address
   */
  fetchEmail: async (token) => {
    if (!token) return "";

    // Handle offline/mock tokens
    if (token.startsWith("mock_")) {
      return mockTokenCache.get(token) || "alex.student@school.edu";
    }

    try {
      const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Userinfo request failed with status: ${response.status}`);
      }

      const data = await response.json();
      return data.email || "";
    } catch (err) {
      console.error("UniVault: Failed to retrieve user email via OAuth Userinfo.", err);
      throw err;
    }
  },

  /**
   * Directly register a mock credentials pair during dev fallback modal completion.
   * @param {string} token Mock token generated
   * @param {string} email Mock email selected
   */
  registerMockCredentials: (token, email) => {
    mockTokenCache.set(token, email);
  },

  /**
   * Clean out session state reference.
   */
  clearSession: () => {
    mockTokenCache.clear();
    console.log("UniVault: Authentication session cache cleared.");
  },
};
