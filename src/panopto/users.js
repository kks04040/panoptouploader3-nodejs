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
  if (parts.length === 1) {
    return { FirstName: name, LastName: '' };
  }
  return { FirstName: parts.slice(0, -1).join(' '), LastName: parts[parts.length - 1] };
}

export async function ensureUser({ linkId, name, email, initialPassword }) {
  if (await userExists(linkId)) {
    logger.info('Panopto user already exists, skipping creation', { userKey: linkId });
    return linkId;
  }

  if (!email) {
    throw new Error(`Cannot create Panopto user for linkId=${linkId}: email is required`);
  }

  logger.info('Creating Panopto external user', { userKey: linkId, name, email });
  const client = await getUserManagementClient();
  const { FirstName, LastName } = splitName(name);
  const user = {
    Email: email,
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
    initialPassword: initialPassword || crypto.randomBytes(18).toString('base64url'),
  };
  try {
    const [result] = await client.CreateUserAsync(args);
    const publicId = result?.CreateUserResult || result?.CreateUserResponse || null;
    logger.info('Panopto user created', { userKey: linkId, userId: user.UserId, publicId });
    return linkId;
  } catch (err) {
    const fault = err.root?.Envelope?.Body?.Fault;
    const faultString = fault?.faultstring || err.message || '';
    if (isAlreadyExistsFault(fault, faultString)) {
      logger.warn('CreateUser reported user already exists, treating as success', { userKey: linkId });
      return linkId;
    }
    throw new Error(`CreateUser SOAP failed for ${linkId}: ${faultString}`);
  }
}

function isAlreadyExistsFault(fault, faultString) {
  const text = String(faultString || '').toLowerCase();
  if (text.includes('already exists') || text.includes('duplicate')) return true;
  const code = String(fault?.faultcode || '').toLowerCase();
  return code.includes('already') || code.includes('duplicate');
}
