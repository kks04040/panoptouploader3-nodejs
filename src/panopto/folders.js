import panoptoClient from './client.js';
import { pickField } from './util.js';
import logger from '../utils/logger.js';

export async function listChildFolders(parentId, searchName) {
  const params = { parentId, pageSize: 100 };
  if (searchName) params.search = searchName;
  const resp = await panoptoClient.get('/folders', { params });
  const results = resp.data?.results || resp.data || [];
  if (searchName) {
    return results.filter((f) => {
      const n = pickField(f, 'name', 'Name');
      return n === searchName || n?.toLowerCase() === searchName?.toLowerCase();
    });
  }
  return results;
}

export async function createFolder(name, parentId) {
  logger.info('Creating Panopto folder', { name, parentId });
  const resp = await panoptoClient.post('/folders', { name, parent: parentId });
  const folder = resp.data;
  const id = pickField(folder, 'id', 'Id', 'ID');
  if (!id) {
    throw new Error(`Unexpected createFolder response (no id): ${JSON.stringify(folder).slice(0, 500)}`);
  }
  logger.info('Panopto folder created', { name, id });
  return id;
}

export async function ensureFolder(name, parentId) {
  const existing = await listChildFolders(parentId, name);
  if (existing.length) {
    const id = pickField(existing[0], 'id', 'Id', 'ID');
    logger.debug('Folder already exists, reusing', { name, id });
    return id;
  }
  return createFolder(name, parentId);
}

export async function getFolder(id) {
  try {
    const resp = await panoptoClient.get(`/folders/${id}`);
    return resp.data;
  } catch (err) {
    if (err.response && err.response.status === 404) return null;
    throw err;
  }
}
