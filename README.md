# Panopto Uploader (Node.js)

Linux 저장 서버의 MP4 원본 동영상을 Oracle `content_migration` 테이블 기반으로 Panopto로 마이그레이션하는 서비스입니다. 설계 배경과 비즈니스 규칙은 `AGENTS.md`를 참고하세요.

## 폴더 구조

```
src/
  config/index.js          # .env 로딩 및 검증, user 폴더명 생성 헬퍼
  utils/
    logger.js              # winston 로거 (콘솔 + 파일)
    index.js               # sleep, MigrationError, truncate
  db/
    oracle.js              # node-oracledb(thin mode) 커넥션 풀
    migrationRepository.js # PENDING 조회/상태갱신/폴더·세션 ID 갱신/완료·실패
  panopto/
    auth.js                # OAuth2 Client Credentials 토큰 발급/갱신(캐싱)
    client.js              # axios 인스턴스 + 401 자동 재발급 인터셉터
    users.js               # linkID(=cup-panopto\사번) userKey 조회 + 미존재 시 SOAP CreateUser 멱등 등록
    soapClient.js          # UserManagement.svc SOAP 클라이언트 + AuthCode/UserKey 인증
    folders.js             # 폴더 조회/생성(중복 체크)
    permissions.js         # 폴더 Creator 권한 부여
    sessions.js            # 업로드 세션 생성/완료/상태 조회
    manifest.js            # UCS v2 매니페스트 XML 생성
    upload.js              # UploadTarget으로 매니페스트+MP4 PUT 업로드
  linux/
    fileAccess.js          # LOCAL_MOUNT / SFTP 읽기 스트림 제공
  orchestrator.js         # 단건 마이그레이션 처리 흐름
  index.js                # 메인: 풀 초기화 -> 배치 폴링 루프
db/content_migration.sql  # Oracle DDL
```

## 시작하기

1. `.env.example`을 복사해 `.env` 작성 (필수값 모두 기재).
2. 의존성 설치: `npm install`
3. 실행:
   - 1회 실행: `npm run start:once`
   - 폴링 루프: `npm start` (기본 30초 간격으로 PENDING 재폴링)

## 처리 흐름

1. `status = PENDING` 행을 `BATCH_SIZE` 만큼 조회.
2. `FOLDER_CREATING` 전환 → Panopto 사용자 보장(`panopto_link_id` = `cup-panopto\사번` userKey). 존재하지 않으면 SOAP `CreateUser`로 외부 사용자 생성(이름/이메일). 이미 존재하면 스킵. → user 폴더(`cup-panopto<DELIM>사번`)/course 폴더 보장.
3. 교수 userKey 조회 → user 폴더 Creator 권한 부여.
4. `UPLOADING` 전환 → `POST /sessionUpload`로 빈 세션 생성, `uploadTarget` 확보.
5. `uploadTarget`로 매니페스트 + MP4 PUT 업로드 후 `PUT /sessionUpload/{id}` 완료 신호.
6. `POLLING_INTERVAL_SEC`/`POLLING_TIMEOUT_SEC` 기준 인코딩 폴링 → `Complete` 시 `COMPLETED`/`uploaded_at` 갱신.
7. 실패 시 `status=FAILED`(또는 재시도 한도 내 `PENDING`), `error_message`, `retry_count` 갱신.

## 멱등성

- 폴더/세션 생성 전 행의 `panopto_*_id` 컬럼과 sibling row를 조회해 기존 ID를 재사용합니다.
- `uq_cm_session`(course_folder_id, session_name) 고유 인덱스로 동일 과목 내 세션명 중복을 방지합니다.

## 주의/미해결 (1차 버전)

- Panopto 업로드 API 엔드포인트(`/Panopto/api/v1/sessionUpload`)와 `UploadTarget` 업로드 방식(단일 PUT)은 실제 사이트 정책에 따라 S3 멀티파트로 보강이 필요할 수 있습니다.
- 대용량 MP4의 진짜 청크 업로드(`UPLOAD_CHUNK_SIZE_MB`)는 현재 스트리밍 PUT으로 대체되어 있으며, 필요 시 S3 멀티파트 업로드로 확장.
- `linkID -> userKey` 매핑은 IdP/SSO 설정에 따라 `users.js`의 후보 로직을 조정해야 할 수 있습니다.
- `panopto_parent_folder_id`는 env(`PANOPTO_USERS_PARENT_FOLDER_ID`)로 고정 사용되므로 row별 값은 사용하지 않습니다.
