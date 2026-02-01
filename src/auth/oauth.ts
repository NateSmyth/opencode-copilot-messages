/**
 * Device Code OAuth flow for Copilot Messages API.
 *
 * Uses client ID: Iv1.b507a08c87ecfe98 (different from standard Copilot)
 *
 * Flow:
 * 1. POST https://github.com/login/device/code
 *    body: { client_id, scope: "user:email" }
 *    returns: { device_code, user_code, verification_uri, expires_in, interval }
 *
 * 2. Poll POST https://github.com/login/oauth/access_token
 *    body: { client_id, device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }
 *    until: access_token returned or expired
 */

export const CLIENT_ID = "Iv1.b507a08c87ecfe98";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

// TODO: Implement authorizeDeviceCode()
// TODO: Implement pollForToken()
