-- =============================================================================
-- Sample seed data for content_migration
--
-- Conventions:
--   - PANOPTO_LINK_ENTITY_ID (env, e.g. cup-panopto) + FOLDER_NAME_DELIMITER (env, e.g. \)
--     + professor_emp_no forms panopto_link_id, e.g. cup-panopto\100123.
--   - panopto_link_id is also the Panopto external UserKey (used verbatim in CreateUser /
--     userExists / permission grants), so it MUST be unique per professor. Two rows sharing
--     one panopto_link_id would collapse both professors onto the same Panopto account.
--   - The user folder name is the same form (cup-panopto\<empNo>) and is resolved at
--     runtime via buildUserFolderName(); it is NOT stored as a separate column.
--   - source_file_name is the physical MP4 file name.
--   - panopto_session_name is the display name shown in Panopto (differs from file name).
--
-- Before using in a real environment, set PANOPTO_USERS_PARENT_FOLDER_ID (or leave NULL).
-- =============================================================================

INSERT INTO content_migration (
    migration_id,
    professor_emp_no,
    professor_name,
    professor_email,
    panopto_link_id,
    course_id,
    course_name,
    source_file_path,
    source_file_name,
    panopto_session_name,
    panopto_parent_folder_id,
    status,
    retry_count
) VALUES (
    seq_content_migration.NEXTVAL,
    '100123',
    '김민준',
    'minjun.kim@example.edu',
    'cup-panopto\100123',
    'LXP-2026-1-CS101',
    'Introduction to Computer Science',
    '/mnt/lxp/videos/2026/CS101/week01/VID_000145.mp4',
    'VID_000145.mp4',
    'CS101 Week 01 - Orientation and Course Overview',
    NULL,
    'PENDING',
    0
);

INSERT INTO content_migration (
    migration_id,
    professor_emp_no,
    professor_name,
    professor_email,
    panopto_link_id,
    course_id,
    course_name,
    source_file_path,
    source_file_name,
    panopto_session_name,
    panopto_parent_folder_id,
    status,
    retry_count
) VALUES (
    seq_content_migration.NEXTVAL,
    '100123',
    '김민준',
    'minjun.kim@example.edu',
    'cup-panopto\100123',
    'LXP-2026-1-CS101',
    'Introduction to Computer Science',
    '/mnt/lxp/videos/2026/CS101/week02/VID_000212.mp4',
    'VID_000212.mp4',
    'CS101 Week 02 - Variables, Types, and Control Flow',
    NULL,
    'PENDING',
    0
);

INSERT INTO content_migration (
    migration_id,
    professor_emp_no,
    professor_name,
    professor_email,
    panopto_link_id,
    course_id,
    course_name,
    source_file_path,
    source_file_name,
    panopto_session_name,
    panopto_parent_folder_id,
    status,
    retry_count
) VALUES (
    seq_content_migration.NEXTVAL,
    '100123',
    '김민준',
    'minjun.kim@example.edu',
    'cup-panopto\100123',
    'LXP-2026-1-DS201',
    'Data Structures',
    '/mnt/lxp/videos/2026/DS201/week01/lecture_capture_20260304.mp4',
    'lecture_capture_20260304.mp4',
    'DS201 Week 01 - Arrays and Linked Lists',
    NULL,
    'PENDING',
    0
);

INSERT INTO content_migration (
    migration_id,
    professor_emp_no,
    professor_name,
    professor_email,
    panopto_link_id,
    course_id,
    course_name,
    source_file_path,
    source_file_name,
    panopto_session_name,
    panopto_parent_folder_id,
    status,
    retry_count
) VALUES (
    seq_content_migration.NEXTVAL,
    '200456',
    '이서연',
    'seoyeon.lee@example.edu',
    'cup-panopto\200456',
    'LXP-2026-1-MATH110',
    'Calculus I',
    '/mnt/lxp/videos/2026/MATH110/week01/MATH110_001.mp4',
    'MATH110_001.mp4',
    'Calculus I Week 01 - Limits and Continuity',
    NULL,
    'PENDING',
    0
);

INSERT INTO content_migration (
    migration_id,
    professor_emp_no,
    professor_name,
    professor_email,
    panopto_link_id,
    course_id,
    course_name,
    source_file_path,
    source_file_name,
    panopto_session_name,
    panopto_parent_folder_id,
    status,
    retry_count
) VALUES (
    seq_content_migration.NEXTVAL,
    '300789',
    '박지훈',
    'jihoon.park@example.edu',
    'cup-panopto\300789',
    'LXP-2026-1-BIZ305',
    'Business Analytics',
    '/mnt/lxp/videos/2026/BIZ305/week03/session_raw_003.mp4',
    'session_raw_003.mp4',
    'Business Analytics Week 03 - Dashboard Metrics',
    NULL,
    'PENDING',
    0
);

COMMIT;
