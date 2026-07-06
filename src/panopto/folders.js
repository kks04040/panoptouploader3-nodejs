import panoptoClient from './client.js';
import logger from '../utils/logger.js';

export async function listChildFolders(parentId, searchName) {
  const params = { parentId, pageSize: 100 };
  if (searchName) params.search = searchName;
  const resp = await panoptoClient.get('/folders', { params });
  const results = resp.data?.results || resp.data || [];
  if (searchName) {
    return results.filter(
      (f) => f.name === searchName || f.name?.toLowerCase() === searchName?.toLowerCase()
    );
  }
  return results;
}

export async function createFolder(name, parentId) {
  logger.info('Creating Panopto folder', { name, parentId });
  const resp = await panoptoClient.post('/folders', { name, parent: parentId });
  const folder = resp.data;
  logger.info('Panopto folder created', { name, id: folder.id || folder.Id });
  return folder.id || folder.Id || folder.ID;
}

export async function ensureFolder(name, parentId) {
  const existing = await listChildFolders(parentId, name);
  if (existing.length) {
    logger.debug('Folder already exists, reusing', { name, id: existing[0].id });
    return existing[0].id;
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
