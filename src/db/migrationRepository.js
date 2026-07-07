import { getConnection, oracledb } from './oracle.js';
import config from '../config/index.js';
import { truncate } from '../utils/index.js';

const COLUMNS = `
  migration_id, professor_emp_no, professor_name, professor_email, panopto_link_id,
  panopto_user_folder_name, course_id, course_name,
  source_file_path, source_file_name, panopto_session_name,
  panopto_parent_folder_id, panopto_user_folder_id, panopto_course_folder_id,
  panopto_session_id, status, error_message, retry_count,
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

export async function markFailed(id, errorMessage) {
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE content_migration
       SET status = CASE WHEN retry_count + 1 >= :maxRetry THEN 'FAILED' ELSE 'PENDING' END,
           error_message = :err,
           retry_count = retry_count + 1
       WHERE migration_id = :id`,
      {
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
    const v = row[k];
    if (v instanceof Date) o[k.toLowerCase()] = v;
    else if (oracledb && v && typeof v === 'object' && v.constructor && v.constructor.name === 'Lob') o[k.toLowerCase()] = null;
    else o[k.toLowerCase()] = v;
  }
  return o;
}
