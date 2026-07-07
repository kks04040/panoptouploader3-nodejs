import dotenv from 'dotenv';

dotenv.config();

function required(key) {
  const v = process.env[key];
  if (v === undefined || v === '') {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}

function int(key, def) {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`Invalid integer for env var ${key}: ${raw}`);
  return n;
}

function str(key, def) {
  const v = process.env[key];
  return v === undefined || v === '' ? def : v;
}

const panoptoSiteUrl = required('PANOPTO_SITE_URL').replace(/\/$/, '');
const linkEntityId = required('PANOPTO_LINK_ENTITY_ID');
const delimiter = str('FOLDER_NAME_DELIMITER', '\\');
const soapApiVersion = str('PANOPTO_SOAP_API_VERSION', '4.6');

const config = {
  isOnce: process.argv.includes('--once'),
  db: {
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    connectString: `${required('DB_HOST')}:${int('DB_PORT', 1521)}/${required('DB_SERVICE_NAME')}`,
    poolMin: 2,
    poolMax: 10,
    poolIncrement: 1,
  },
  panopto: {
    siteUrl: panoptoSiteUrl,
    apiBase: `${panoptoSiteUrl}/Panopto/api/v1`,
    oauthTokenUrl: `${panoptoSiteUrl}/Panopto/oauth2/connect/token`,
    clientId: required('PANOPTO_CLIENT_ID'),
    clientSecret: required('PANOPTO_CLIENT_SECRET'),
    usersParentFolderId: required('PANOPTO_USERS_PARENT_FOLDER_ID'),
    linkEntityId,
    folderDelimiter: delimiter,
    serviceAccountUser: required('PANOPTO_SERVICE_ACCOUNT_USER'),
    serviceAccountPassword: required('PANOPTO_SERVICE_ACCOUNT_PASSWORD'),
    idpApplicationKey: str('PANOPTO_IDP_APPLICATION_KEY', ''),
    soapApiVersion,
    soapUserManagementWsdl: `${panoptoSiteUrl}/Panopto/PublicAPI/${soapApiVersion}/UserManagement.svc?wsdl`,
    soapUserManagementEndpoint: `${panoptoSiteUrl}/Panopto/PublicAPI/${soapApiVersion}/UserManagement.svc`,
  },
  linux: {
    accessMode: str('LINUX_FILE_ACCESS_MODE', 'LOCAL_MOUNT'),
    sourceRootPath: str('LINUX_SOURCE_ROOT_PATH', ''),
    sftp: {
      host: str('LINUX_SFTP_HOST', ''),
      port: int('LINUX_SFTP_PORT', 22),
      user: str('LINUX_SFTP_USER', ''),
      password: str('LINUX_SFTP_PASSWORD', ''),
      privateKeyPath: str('LINUX_SFTP_PRIVATE_KEY_PATH', ''),
    },
  },
  upload: {
    chunkSizeMb: int('UPLOAD_CHUNK_SIZE_MB', 10),
    pollingIntervalSec: int('POLLING_INTERVAL_SEC', 10),
    pollingTimeoutSec: int('POLLING_TIMEOUT_SEC', 3600),
    maxRetryCount: int('MAX_RETRY_COUNT', 3),
    batchSize: int('BATCH_SIZE', 50),
    loopIntervalSec: int('LOOP_INTERVAL_SEC', 30),
    stuckReclaimSeconds: int('STUCK_RECLAIM_SECONDS', 600),
  },
  log: {
    level: str('LOG_LEVEL', 'info'),
  },
};

export function buildUserFolderName(empNo) {
  return `${config.panopto.linkEntityId}${config.panopto.folderDelimiter}${empNo}`;
}

export default config;
