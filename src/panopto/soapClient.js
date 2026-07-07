import crypto from 'node:crypto';
import config from '../config/index.js';
import logger from '../utils/logger.js';

let Soap = null;
let clientPromise = null;

async function loadSoap() {
  if (Soap) return Soap;
  const mod = await import('soap');
  Soap = mod.default || mod;
  return Soap;
}

function serverHost() {
  const url = new URL(config.panopto.siteUrl);
  return url.host.toLowerCase();
}

export function buildAuthCode(userKey) {
  const appKey = config.panopto.idpApplicationKey;
  if (!appKey) return null;
  const payload = `${userKey}@${serverHost()}|${appKey.toLowerCase()}`;
  return crypto.createHash('sha1').update(payload, 'ascii').digest('hex').toUpperCase();
}

export function buildAuthInfo() {
  const userKey = config.panopto.serviceAccountUser;
  const authInfo = { UserKey: userKey };
  if (config.panopto.idpApplicationKey) {
    const authCode = buildAuthCode(userKey);
    if (authCode) authInfo.AuthCode = authCode;
  }
  authInfo.Password = config.panopto.serviceAccountPassword || '';
  return authInfo;
}

export async function getUserManagementClient() {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const Soap = await loadSoap();
    logger.debug('Creating Panopto SOAP UserManagement client', { wsdl: config.panopto.soapUserManagementWsdl });
    const client = await Soap.createClientAsync(config.panopto.soapUserManagementWsdl, {
      endpoint: config.panopto.soapUserManagementEndpoint,
      forceSoap12Headers: false,
    });
    logger.debug('Panopto SOAP client ready');
    return client;
  })().catch((err) => {
    clientPromise = null;
    throw err;
  });
  return clientPromise;
}
