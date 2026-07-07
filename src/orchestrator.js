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
    // 1) 검증된 엔드포인트(GET /sessions/{id})로 세션 상태를 먼저 확인.
    //    GET /sessionUpload/{id}가 지원되지 않을 수 있으므로 상태 판단은 이 엔드포인트에 의존.
    let status = null;
    try {
      status = await getSessionStatus(row.panopto_session_id);
    } catch (err) {
      log.warn('Failed to fetch session status for stored id', { sessionId: row.panopto_session_id, err: err.message });
    }
    if (status) {
      if (isSessionComplete(status)) {
        log.info('Session already complete, finalizing row', { sessionId: row.panopto_session_id });
        await repo.markCompleted(row.migration_id);
        return { sessionId: row.panopto_session_id, skip: true };
      }
      if (isSessionFailed(status)) {
        throw new MigrationError(`Existing session ${row.panopto_session_id} is in failed state`, { retryable: false });
      }
      // 2) 미완료(처리중) -> uploadTarget 재사용 시도(best-effort).
      //    GET /sessionUpload/{id}가 응답에 uploadTarget을 포함하지 않을 수 있어, 실패해도 치명적이지 않음.
      const uploadSession = await safeGetUploadSession(row.panopto_session_id);
      const uploadTarget = uploadSession?.uploadTarget || uploadSession?.UploadTarget;
      if (uploadTarget) {
        log.info('Reusing existing upload session', { sessionId: row.panopto_session_id });
        return { sessionId: row.panopto_session_id, uploadTarget };
      }
      // uploadTarget을 얻지 못했으면 기존 미완료 세션은 두고 새 세션을 생성해 처음부터 재업로드.
      // 영구 FAILED 대신 재시도 가능한 경로로 회복.
      log.warn('Stored session in progress but no uploadTarget; creating new session to re-upload', { sessionId: row.panopto_session_id });
    } else {
      log.warn('Stored session id status unknown; creating new session', { sessionId: row.panopto_session_id });
    }
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
  const userKey = resolveUserKey(row.panopto_link_id, row.professor_emp_no);
  await grantCreatorAccess(courseFolderId, userKey);
  log.info('Granted Creator access on course folder', { courseFolderId, userKey });
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
