import axios from 'axios';
import config from '../config/index.js';
import logger from '../utils/logger.js';

let token = null;
let expiresAt = 0;
let refreshPromise = null;

export async function getToken() {
  const now = Date.now();
  if (token && expiresAt - now > 60_000) {
    return token;
  }
  await refreshToken();
  return token;
}

export function refreshToken() {
  if (!refreshPromise) {
    refreshPromise = doRefresh()
      .catch((err) => {
        refreshPromise = null;
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function doRefresh() {
  logger.debug('Requesting Panopto OAuth2 token (client_credentials)...');
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('scope', 'api');
  const resp = await axios.post(config.panopto.oauthTokenUrl, params, {
    auth: {
      username: config.panopto.clientId,
      password: config.panopto.clientSecret,
    },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000,
  });
  token = resp.data.access_token;
  const expiresIn = resp.data.expires_in || 3600;
  expiresAt = Date.now() + expiresIn * 1000;
  logger.info('Panopto OAuth2 token refreshed.', { expiresInSec: expiresIn });
}

export function clearToken() {
  token = null;
  expiresAt = 0;
}
