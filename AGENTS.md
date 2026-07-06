# AGENTS.md

## Project purpose

Node.js service that migrates MP4 videos from a Linux storage server into Panopto. Migration targets are defined in an Oracle table `content_migration` driven by LXP content-migration data. This repo is pre-implementation (no source yet); the facts below are the agreed design and must be honored.

## Critical business rules (non-obvious — do NOT get these wrong)

- **User folder naming**: under the Panopto `Users` top-level folder, create a folder per professor named exactly `파놉토연결ID<DELIM>사번` (delimiter from `FOLDER_NAME_DELIMITER`). The LXP-linked account is an external user, so the professor's employee number (`사번`) alone must NOT be used as the folder name — the Panopto link ID prefix is mandatory.
- **Folder hierarchy**: `Users` → `<linkID><DELIM><사번>` → `<과목명>` → uploaded MP4 session.
- **Session name ≠ source file name**: the Panopto display name (`panopto_session_name`) is intentionally different from the actual uploaded file (`source_file_name`). Never assume they match; both columns must be read from the DB row.
- **Permissions**: the professor (looked up by Panopto link ID, NOT `사번`) must be granted Creator/editor access on their user folder (and course folder unless inheritance is used).
- **Idempotency**: before creating any folder or session, check existing IDs stored in the row (`panopto_user_folder_id`, `panopto_course_folder_id`, `panopto_session_id`) to avoid duplicates on re-runs.

## Database

- Oracle. Table `content_migration` (DDL defined in conversation; columns prefixed `panopto_*` hold IDs populated during processing).
- `status` lifecycle: `PENDING → FOLDER_CREATING → UPLOADING → COMPLETED | FAILED`. Process rows where `status = PENDING`.
- `migration_id` uses an Oracle sequence (`seq_content_migration`); no auto-increment. On 12c+ an `IDENTITY` column is acceptable.
- `uq_cm_session` unique index on `(panopto_course_folder_id, panopto_session_name)` enforces no duplicate sessions per course folder.

## Environment

All secrets/credentials live in `.env` (copy from `.env.example`). Never hardcode Panopto client_id/secret, service account, or DB credentials. Key vars: `PANOPTO_*`, `LINUX_*` (file access via `LOCAL_MOUNT` or `SFTP`), `DB_*`, upload/polling tuning, and `FOLDER_NAME_DELIMITER`.

## Upload flow

1. Fetch `PENDING` rows from `content_migration`.
2. OAuth2 token (Client Credentials) → ensure non-expired; refresh as needed.
3. Ensure user folder + course folder exist (create under `PANOPTO_USERS_PARENT_FOLDER_ID`); persist returned IDs back to the row.
4. Grant Creator access to the professor resolved by Panopto link ID.
5. Create session (`panopto_session_name`) in the course folder; persist `panopto_session_id`.
6. Chunked MP4 upload (`UPLOAD_CHUNK_SIZE_MB`) of the file at `source_file_path` (filename `source_file_name`).
7. Poll encoding state until `Complete` (respect `POLLING_INTERVAL_SEC` / `POLLING_TIMEOUT_SEC`); set `status=COMPLETED`, `uploaded_at`.
8. On failure: `status=FAILED`, record `error_message`, increment `retry_count`; re-queue up to `MAX_RETRY_COUNT`.

## Open items to confirm before/while implementing

- `FOLDER_NAME_DELIMITER`: Panopto may not allow `\` in folder names — verify against the API and adjust the env value (likely `_`).
- Session naming convention (currently only "differs from file name") — needs an explicit rule.
- Duplicate `course_name` across semesters may collide; consider adding a semester/year discriminator.
- How the Panopto link ID resolves to a user key via the UserManagement API depends on the IdP/SSO setup.
