import { getConnection, oracledb } from './oracle.js';
import config from '../config/index.js';
import { truncate } from '../utils/index.js';

const COLUMNS = `
  migration_id, professor_emp_no, professor_name, professor_email, panopto_link_id,
  panopto_user_folder_name, course_id, course_name,
  source_file_path, source_file_name, panopto_session_name,
  panopto_parent_folder_id, panopto_user_folder_id, panopto_course_folder_id,
  panopto_session_id, status, retry_count,
  created_at, updated_at, uploaded_at
`;

export async function fetchPendingBatch(limit) {
  const conn = await getConnection();
  try {
    const sql = `
      SELECT ${COLUMNS}
      FROM content_migration
      WHERE status = 'PENDING'
        AND retry_count <= :maxRetry
      ORDER BY created_at ASC
      FETCH FIRST :limit ROWS ONLY
    `;
    const result = await conn.execute(sql, {
      maxRetry: { val: config.upload.maxRetryCount, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
      limit: { val: limit, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return result.rows.map(normalizeRow);
  } finally {
    await conn.close();
  }
}

export async function reclaimStuckRows(staleSeconds) {
  const conn = await getConnection();
  try {
    const sql = `
      UPDATE content_migration
      SET status = 'PENDING', error_message = 'Reclaimed from stuck state'
      WHERE status IN ('FOLDER_CREATING', 'UPLOADING')
        AND updated_at < SYSTIMESTAMP - NUMTODSINTERVAL(:staleSec, 'SECOND')
    `;
    const result = await conn.execute(sql, {
      staleSec: { val: staleSeconds, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    });
    await conn.commit();
    return result.rowsAffected || 0;
  } finally {
    await conn.close();
  }
}

export async function claimRow(migrationId) {
  const conn = await getConnection();
  try {
    // 원자적 UPDATE로 클레임: status가 아직 PENDING인 경우에만 FOLDER_CREATING으로 전환.
    // 다중 인스턴스가 같은 행을 동시에 클레임하지 못하도록 보장(rowsAffected=0이면 이미 클레임됨).
    const result = await conn.execute(
      `UPDATE content_migration
       SET status = 'FOLDER_CREATING'
       WHERE migration_id = :id AND status = 'PENDING'`,
      { id: { val: migrationId, dir: oracledb.BIND_IN, type: oracledb.NUMBER } }
    );
    await conn.commit();
    return (result.rowsAffected || 0) > 0;
  } finally {
    await conn.close();
  }
}

export async function updateStatus(id, status) {
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE content_migration SET status = :status WHERE migration_id = :id`,
      { status: { val: status, dir: oracledb.BIND_IN, type: oracledb.STRING }, id: { val: id, dir: oracledb.BIND_IN, type: oracledb.NUMBER } }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function updateUserFolder(id, folderId) {
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE content_migration SET panopto_user_folder_id = :fid WHERE migration_id = :id`,
      { fid: { val: folderId, dir: oracledb.BIND_IN, type: oracledb.STRING }, id: { val: id, dir: oracledb.BIND_IN, type: oracledb.NUMBER } }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function updateCourseFolder(id, folderId) {
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE content_migration SET panopto_course_folder_id = :fid WHERE migration_id = :id`,
      { fid: { val: folderId, dir: oracledb.BIND_IN, type: oracledb.STRING }, id: { val: id, dir: oracledb.BIND_IN, type: oracledb.NUMBER } }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function updateSessionId(id, sessionId) {
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE content_migration SET panopto_session_id = :sid WHERE migration_id = :id`,
      { sid: { val: sessionId, dir: oracledb.BIND_IN, type: oracledb.STRING }, id: { val: id, dir: oracledb.BIND_IN, type: oracledb.NUMBER } }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function markCompleted(id) {
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE content_migration
       SET status = 'COMPLETED', uploaded_at = SYSTIMESTAMP, error_message = NULL
       WHERE migration_id = :id`,
      { id: { val: id, dir: oracledb.BIND_IN, type: oracledb.NUMBER } }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function markFailed(id, errorMessage, retryable = true) {
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE content_migration
       SET status = CASE WHEN (:retryable = 0 OR retry_count + 1 >= :maxRetry) THEN 'FAILED' ELSE 'PENDING' END,
           error_message = :err,
           retry_count = retry_count + 1
       WHERE migration_id = :id`,
      {
        retryable: { val: retryable ? 1 : 0, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
        maxRetry: { val: config.upload.maxRetryCount, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
        err: { val: truncate(errorMessage, 4000), dir: oracledb.BIND_IN, type: oracledb.STRING },
        id: { val: id, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
      }
    );
    await conn.commit();
  } finally {
    await conn.close();
  }
}

export async function findExistingFolderIds(linkId, courseName) {
  const conn = await getConnection();
  try {
    const sql = `
      SELECT panopto_user_folder_id, panopto_course_folder_id
      FROM content_migration
      WHERE panopto_link_id = :linkId
        AND course_name = :courseName
        AND panopto_course_folder_id IS NOT NULL
      FETCH FIRST 1 ROWS ONLY
    `;
    const result = await conn.execute(sql, {
      linkId: { val: linkId, dir: oracledb.BIND_IN, type: oracledb.STRING },
      courseName: { val: courseName, dir: oracledb.BIND_IN, type: oracledb.STRING },
    }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    if (!result.rows.length) return null;
    return {
      userFolderId: result.rows[0].PANOPTO_USER_FOLDER_ID,
      courseFolderId: result.rows[0].PANOPTO_COURSE_FOLDER_ID,
    };
  } finally {
    await conn.close();
  }
}

function normalizeRow(row) {
  const o = {};
  for (const k of Object.keys(row)) {
    o[k.toLowerCase()] = row[k];
  }
  return o;
}
