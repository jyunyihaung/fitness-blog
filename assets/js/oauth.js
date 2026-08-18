const GIS_SRC = "https://accounts.google.com/gsi/client";

function loadScript(src, id) {
  const existing = document.getElementById(id);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (existing.dataset.loaded === "true") resolve();
      else {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
      }
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Unable to load Google Identity Services.")), { once: true });
    document.head.append(script);
  });
}

export class GoogleOAuthClient {
  constructor(clientId, scope = "https://www.googleapis.com/auth/drive.file") {
    this.clientId = clientId;
    this.scope = scope;
    this.tokenClient = null;
    this.accessToken = null;
    this.expiresAt = 0;
  }

  async initialize() {
    if (!this.clientId) throw new Error("Google OAuth client ID is not configured.");
    await loadScript(GIS_SRC, "google-identity-services");
    if (!window.google?.accounts?.oauth2) throw new Error("Google Identity Services is unavailable.");
  }

  async requestAccessToken() {
    await this.initialize();

    return new Promise((resolve, reject) => {
      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: this.scope,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error_description || response.error || "Google authorization failed."));
            return;
          }
          this.accessToken = response.access_token;
          this.expiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;
          resolve(this.accessToken);
        },
        error_callback: (error) => {
          if (error.type === "popup_closed") reject(new DOMException("Authorization was cancelled.", "AbortError"));
          else reject(new Error("Google authorization could not be opened."));
        },
      });
      this.tokenClient.requestAccessToken();
    });
  }

  getValidAccessToken() {
    return this.accessToken && Date.now() < this.expiresAt - 30_000 ? this.accessToken : null;
  }

  clear() {
    this.accessToken = null;
    this.expiresAt = 0;
  }
}
