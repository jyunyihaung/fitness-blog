import { GoogleOAuthClient } from "./oauth.js";

class GoogleAuthService {
  configure(clientId) {
    const normalized = String(clientId ?? "").trim();
    if (!normalized) throw new Error("Google OAuth client ID is not configured.");
    if (!this.client) this.client = new GoogleOAuthClient(normalized);
    if (this.client.clientId !== normalized) throw new Error("Google OAuth client ID changed during this session.");
    return this;
  }

  initialize() {
    if (!this.client) throw new Error("Google OAuth service is not configured.");
    return this.client.initialize();
  }

  requestAccessToken() {
    if (!this.client) throw new Error("Google OAuth service is not configured.");
    return this.client.requestAccessToken();
  }

  getValidAccessToken() {
    return this.client?.getValidAccessToken() ?? null;
  }

  async getAccessToken() {
    return this.getValidAccessToken() ?? this.requestAccessToken();
  }

  clear() {
    this.client?.clear();
  }
}

export const googleAuth = new GoogleAuthService();
