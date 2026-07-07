import crypto from 'node:crypto';
import panoptoClient from './client.js';
import { getUserManagementClient, buildAuthInfo } from './soapClient.js';
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

export async function userExists(linkId) {
  if (await getUserByKey(linkId)) return true;
  const found = await searchUsers(linkId);
  return found.some((u) => u.userKey === linkId);
}

export function resolveUserKey(linkId) {
  return linkId;
}

function splitName(fullName) {
  const name = String(fullName || '').trim();
  if (!name) return { FirstName: '', LastName: '' };
  const parts = name.split(/\s+/);
  if (parts.length === 1) return { FirstName: name, LastName: '' };
  return { FirstName: parts.slice(0, -1).join(' '), LastName: parts[parts.length - 1] };
}

export async function ensureUser({ linkId, name, email, initialPassword }) {
  const existing = await getUserByKey(linkId);
  if (existing) {
    logger.info('Panopto user already exists, skipping creation', { userKey: linkId });
    return linkId;
  }

  logger.info('Creating Panopto external user', { userKey: linkId, name, email });
  const client = await getUserManagementClient();
  const { FirstName, LastName } = splitName(name);
  const user = {
    Email: email || '',
    EmailSessionNotifications: 'true',
    FirstName,
    LastName,
    SystemRole: 'None',
    UserBio: '',
    UserId: crypto.randomUUID(),
    UserKey: linkId,
    UserSettingsUrl: '',
  };
  const args = {
    auth: buildAuthInfo(),
    user,
    initialPassword: initialPassword || crypto.randomBytes(12).toString('base64'),
  };
  try {
    const [result] = await client.CreateUserAsync(args);
    logger.info('Panopto user created', { userKey: linkId, userId: user.UserId });
    return linkId;
  } catch (err) {
    const msg = err.root?.Envelope?.Body?.Fault?.faultstring || err.message;
    throw new Error(`CreateUser SOAP failed for ${linkId}: ${msg}`);
  }
}
