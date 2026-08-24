import { AppError } from "./app-error.js";

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
    script.addEventListener("error", () => reject(new AppError("network_error", { retryable: true })), { once: true });
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
    this.initialization = null;
  }

  async initialize() {
    if (!this.clientId) throw new AppError("configuration_error");
    if (!this.initialization) {
      this.initialization = loadScript(GIS_SRC, "google-identity-services")
        .then(() => {
          if (!window.google?.accounts?.oauth2) {
            throw new AppError("configuration_error");
          }
        })
        .catch((error) => {
          this.initialization = null;
          throw error;
        });
    }
    return this.initialization;
  }

  async requestAccessToken() {
    await this.initialize();

    return new Promise((resolve, reject) => {
      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: this.scope,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new AppError("permission_denied"));
            return;
          }
          this.accessToken = response.access_token;
          this.expiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;
          resolve(this.accessToken);
        },
        error_callback: (error) => {
          if (error.type === "popup_closed") reject(new DOMException("Authorization was cancelled.", "AbortError"));
          else reject(new AppError("google_api_error"));
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
