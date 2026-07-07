import panoptoClient from './client.js';
import logger from '../utils/logger.js';

export async function createUploadSession(folderId, sessionName) {
  logger.info('Creating Panopto upload session', { folderId, sessionName });
  const body = { folderId, name: sessionName };
  const resp = await panoptoClient.post('/sessionUpload', body);
  const data = resp.data;
  const sessionId = data.id || data.Id || data.ID;
  const uploadTarget = data.uploadTarget || data.UploadTarget;
  if (!sessionId || !uploadTarget) {
    throw new Error(`Unexpected sessionUpload response: ${JSON.stringify(data).slice(0, 500)}`);
  }
  logger.info('Upload session created', { sessionId, uploadTarget });
  return { sessionId, uploadTarget };
}

export async function finishUploadSession(uploadSessionId) {
  logger.info('Finishing Panopto upload session', { uploadSessionId });
  await panoptoClient.put(`/sessionUpload/${uploadSessionId}`, {
    uploadStatus: 'UploadComplete',
  });
}

export async function getSessionStatus(sessionId) {
  const resp = await panoptoClient.get(`/sessions/${sessionId}`);
  return resp.data;
}

export async function getUploadSession(uploadSessionId) {
  try {
    const resp = await panoptoClient.get(`/sessionUpload/${uploadSessionId}`);
    return resp.data;
  } catch (err) {
    if (err.response && err.response.status === 404) return null;
    throw err;
  }
}

export function isSessionComplete(session) {
  const state = session?.state || session?.Status || session?.status;
  const normalized = String(state || '').toLowerCase();
  return normalized === 'complete' || normalized === 'completed';
}

const normalizedFailedStates = new Set(['failed', 'error', 'invalid']);

export function isSessionFailed(session) {
  const state = String(session?.state || session?.Status || session?.status || '').toLowerCase();
  return normalizedFailedStates.has(state);
}
