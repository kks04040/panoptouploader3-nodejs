import config from './config/index.js';
import { buildUserFolderName } from './config/index.js';
import logger from './utils/logger.js';
import { MigrationError, sleep } from './utils/index.js';
import * as repo from './db/migrationRepository.js';
import { resolveUserKey, ensureUser } from './panopto/users.js';
import { ensureFolder, getFolder } from './panopto/folders.js';
import { grantCreatorAccess } from './panopto/permissions.js';
import { createUploadSession, finishUploadSession, getSessionStatus, getUploadSession, isSessionComplete, isSessionFailed } from './panopto/sessions.js';
import { uploadMediaFile } from './panopto/upload.js';
import { openSource } from './linux/fileAccess.js';

export async function processMigration(row) {
  const log = logger.child({ migrationId: row.migration_id });
  log.info('Processing migration row', {
    empNo: row.professor_emp_no,
    course: row.course_name,
    file: row.source_file_name,
    session: row.panopto_session_name,
  });

  await repo.updateStatus(row.migration_id, 'FOLDER_CREATING');
  validateUserFields(row);
  await ensurePanoptoUser(row, log);
  const courseFolderId = await ensureCourseFolder(row, log);
  log.info('Course folder ready', { courseFolderId });

  await repo.updateStatus(row.migration_id, 'UPLOADING');

  try {
    const { sessionId, uploadTarget, skip } = await ensureUploadSession(row, courseFolderId, log);
    if (skip) {
      return;
    }

    const source = await openSource(row.source_file_path);
    try {
      await uploadMediaFile(uploadTarget, row.source_file_name, source.streamProvider, source.contentLength);
    } finally {
      await source.close();
    }

    await finishUploadSession(sessionId);
    await pollEncoding(row.migration_id, sessionId, log);

    await repo.markCompleted(row.migration_id);
    log.info('Migration completed', { sessionId });
  } catch (err) {
    log.error('Migration failed during upload', { err: err.message });
    throw err;
  }
}

async function ensureUploadSession(row, courseFolderId, log) {
  if (row.panopto_session_id) {
    const session = await safeGetUploadSession(row.panopto_session_id);
    if (session) {
      if (isSessionComplete(session)) {
        log.info('Session already complete, finalizing row', { sessionId: row.panopto_session_id });
        await repo.markCompleted(row.migration_id);
        return { sessionId: row.panopto_session_id, skip: true };
      }
      if (isSessionFailed(session)) {
        throw new MigrationError(`Existing session ${row.panopto_session_id} is in failed state`, { retryable: false });
      }
      log.info('Reusing existing upload session', { sessionId: row.panopto_session_id });
      const uploadTarget = session.uploadTarget || session.UploadTarget;
      if (!uploadTarget) {
        throw new MigrationError(`Existing session ${row.panopto_session_id} has no uploadTarget, cannot resume`, { retryable: false });
      }
      return { sessionId: row.panopto_session_id, uploadTarget };
    }
    log.warn('Stored session id not found in Panopto, creating new', { sessionId: row.panopto_session_id });
  }

  const { sessionId, uploadTarget } = await createUploadSession(courseFolderId, row.panopto_session_name);
  await repo.updateSessionId(row.migration_id, sessionId);
  return { sessionId, uploadTarget };
}

async function safeGetUploadSession(sessionId) {
  try {
    return await getUploadSession(sessionId);
  } catch (err) {
    logger.warn('Failed to fetch upload session, treating as missing', { sessionId, err: err.message });
    return null;
  }
}

async function ensureCourseFolder(row, log) {
  if (row.panopto_course_folder_id) {
    const existing = await safeGetFolder(row.panopto_course_folder_id);
    if (existing) {
      log.debug('Reusing course folder id from row', { id: row.panopto_course_folder_id });
      return row.panopto_course_folder_id;
    }
  }

  const shared = await repo.findExistingFolderIds(row.panopto_link_id, row.course_name);
  if (shared?.courseFolderId) {
    const existing = await safeGetFolder(shared.courseFolderId);
    if (existing) {
      log.info('Reusing course folder id from sibling row', { id: shared.courseFolderId });
      await repo.updateUserFolder(row.migration_id, shared.userFolderId);
      await repo.updateCourseFolder(row.migration_id, shared.courseFolderId);
      return shared.courseFolderId;
    }
  }

  const userFolderId = await ensureUserFolder(row, log);
  const courseFolderId = await ensureFolder(row.course_name, userFolderId);
  await repo.updateCourseFolder(row.migration_id, courseFolderId);

  await grantCourseAccess(courseFolderId, row, log);
  return courseFolderId;
}

function validateUserFields(row) {
  if (!row.panopto_link_id) {
    throw new MigrationError(`Missing panopto_link_id (migration_id=${row.migration_id})`, { retryable: false });
  }
  if (!row.professor_email) {
    throw new MigrationError(`Missing professor_email for linkId=${row.panopto_link_id} (migration_id=${row.migration_id})`, { retryable: false });
  }
}

async function ensurePanoptoUser(row, log) {
  await ensureUser({
    linkId: row.panopto_link_id,
    name: row.professor_name,
    email: row.professor_email,
  });
  log.info('Panopto user ensured', { userKey: row.panopto_link_id });
}

async function grantCourseAccess(courseFolderId, row, log) {
  try {
    const userKey = resolveUserKey(row.panopto_link_id, row.professor_emp_no);
    await grantCreatorAccess(courseFolderId, userKey);
    log.info('Granted Creator access on course folder', { courseFolderId, userKey });
  } catch (err) {
    log.warn('Course folder permission grant skipped/failed (non-fatal)', { err: err.message });
  }
}

async function ensureUserFolder(row, log) {
  if (row.panopto_user_folder_id) {
    const existing = await safeGetFolder(row.panopto_user_folder_id);
    if (existing) return row.panopto_user_folder_id;
  }
  const userFolderName = buildUserFolderName(row.professor_emp_no);
  const expectedName = row.panopto_user_folder_name || userFolderName;
  const userFolderId = await ensureFolder(expectedName, config.panopto.usersParentFolderId);
  await repo.updateUserFolder(row.migration_id, userFolderId);

  const userKey = resolveUserKey(row.panopto_link_id, row.professor_emp_no);
  await grantCreatorAccess(userFolderId, userKey);
  log.info('Granted Creator access on user folder', { userFolderId, userKey });
  return userFolderId;
}

async function safeGetFolder(id) {
  try {
    return await getFolder(id);
  } catch (err) {
    logger.debug('getFolder failed, treating as missing', { id, err: err.message });
    return null;
  }
}

async function pollEncoding(migrationId, sessionId, log) {
  const start = Date.now();
  const timeoutMs = config.upload.pollingTimeoutSec * 1000;
  const intervalMs = config.upload.pollingIntervalSec * 1000;
  while (true) {
    await sleep(intervalMs);
    let session;
    try {
      session = await getSessionStatus(sessionId);
    } catch (err) {
      log.warn('Failed to fetch session status, will retry', { err: err.message });
      if (Date.now() - start > timeoutMs) throw new MigrationError(`Polling status fetch failed: ${err.message}`, { retryable: true });
      continue;
    }
    log.debug('Session encoding state', { state: session?.state || session?.Status || session?.status });
    if (isSessionComplete(session)) return;
    if (isSessionFailed(session)) throw new MigrationError(`Encoding failed for session ${sessionId}`, { retryable: false });
    if (Date.now() - start > timeoutMs) {
      throw new MigrationError(`Polling timeout for session ${sessionId}`, { retryable: true });
    }
  }
}
