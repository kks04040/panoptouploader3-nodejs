import axios from 'axios';
import config from '../config/index.js';
import { getToken, clearToken } from './auth.js';
import logger from '../utils/logger.js';

export const panoptoClient = axios.create({
  baseURL: config.panopto.apiBase,
  timeout: 60000,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});

panoptoClient.interceptors.request.use(async (req) => {
  const token = await getToken();
  req.headers = req.headers || {};
  req.headers.Authorization = `Bearer ${token}`;
  return req;
});

panoptoClient.interceptors.response.use(
  (r) => {
    logger.debug('Panopto API response', {
      url: `${r.config?.method?.toUpperCase()} ${r.config?.baseURL}${r.config?.url}`,
      status: r.status,
    });
    return r;
  },
  async (error) => {
    const original = error.config;
    if (error.response && error.response.status === 401 && !original._retried) {
      clearToken();
      original._retried = true;
      const token = await getToken();
      original.headers.Authorization = `Bearer ${token}`;
      return panoptoClient(original);
    }
    const url = error.config ? `${error.config.method?.toUpperCase()} ${error.config.baseURL}${error.config.url}` : '';
    logger.error('Panopto API error', {
      url,
      status: error.response?.status,
      data: typeof error.response?.data === 'string' ? error.response.data.slice(0, 500) : error.response?.data,
    });
    return Promise.reject(error);
  }
);

export default panoptoClient;
