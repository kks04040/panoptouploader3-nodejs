import panoptoClient from './client.js';
import logger from '../utils/logger.js';

async function getUserByKey(userKey) {
  try {
    const resp = await panoptoClient.get(`/users/${encodeURIComponent(userKey)}`);
    return resp.data;
  } catch (err) {
    if (err.response && err.response.status === 404) return null;
    throw err;
  }
}

async function searchUsers(term) {
  const resp = await panoptoClient.get('/users', {
    params: { search: term, pageSize: 50 },
  });
  return resp.data?.results || resp.data || [];
}

export async function resolveUserKey(linkId, empNo) {
  const user = await getUserByKey(linkId);
  if (user && user.userKey) {
    logger.debug('Resolved Panopto user by linkId', { userKey: user.userKey });
    return user.userKey;
  }

  const found = await searchUsers(linkId);
  const match = found.find((u) => u.userKey === linkId);
  if (match) return match.userKey;
  if (found.length === 1) return found[0].userKey;

  throw new Error(`Cannot resolve Panopto userKey for linkId=${linkId}, empNo=${empNo}`);
}
