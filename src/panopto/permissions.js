import panoptoClient from './client.js';
import logger from '../utils/logger.js';

export async function grantCreatorAccess(folderId, userKey) {
  logger.info('Granting Creator access to user folder', { folderId, userKey });
  await panoptoClient.put(`/folders/${folderId}/access`, [
    { userKey, role: 'Creator' },
  ]);
}

export async function grantViewerAccess(folderId, userKey) {
  logger.info('Granting Viewer access', { folderId, userKey });
  await panoptoClient.put(`/folders/${folderId}/access`, [
    { userKey, role: 'Viewer' },
  ]);
}
