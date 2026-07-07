# 코드 리뷰 — 우려사항 및 수정 추적

> 본 파일은 코드 리뷰에서 식별된 문제점과 그 해결 상태를 추적하기 위한 문서입니다.
> 수정이 완료된 항목은 **해결 이력**을 덧붙이고 상태를 `RESOLVED`로 변경합니다.

상태 범례: `OPEN`(미해결) / `PARTIAL`(일부 해결) / `RESOLVED`(해결 완료) / `WONTFIX`(의도적 비수정)

---

## 검증 기준 정보

- 검증 시점 기준 커밋: `e535318` (Fix review issues: session idempotency, retryable flag, stuck reclaim, permission fatal, eslint)
- 검증 방법: `node --check`(전체 파일 통과), `npm run lint`(exit 0 통과), 소스·DDL·설정 정적 리뷰
- 검증 환경: Node v22.17.1, Windows, PowerShell

---

## 🟠 MEDIUM — 세션 재사용 / 멱등성

### R-01: 세션 재사용이 `GET /sessionUpload/{id}` 엔드포인트 존재에 의존 (미검증)

- **상태**: `RESOLVED`
- **위치**: `src/panopto/sessions.js:30-38`(`getUploadSession`), `src/orchestrator.js:54-79`(`ensureUploadSession`)
- **내용**: 커밋 `e535318`에서 세션 멱등성을 위해 `GET /sessionUpload/{id}`를 호출하도록 추가됨. 그러나 기존 코드는 `sessionUpload`를 POST(생성)·PUT(완료)만 사용하던 상태이며, **GET 지원 여부는 미검증**.
- **영향**: Panopto가 `GET /sessionUpload/{id}`를 지원하지 않아 404가 아닌 에러(예: 405)를 반환하면, `safeGetUploadSession`이 catch→null 처리되어 "Stored session id not found, creating new" 로그 후 **새 세션 생성 → 중복 세션 위험 재발**.
- **대응**: 실사이트 연동 시 `GET /sessionUpload/{id}` 응답 코드/형상을 먼저 검증. 지원하지 않으면 다른 조회 수단(예: `GET /sessions/{id}`)으로 대체하거나, DB `panopto_session_id` 존재만으로 재사용 여부를 판단하는 폴백 설계 필요.

### R-02: 업로드 재개(resume)가 `uploadTarget`을 GET 응답에서 찾음 — 없으면 영구 FAILED

- **상태**: `RESOLVED`
- **위치**: `src/orchestrator.js:67-70`
- **내용**: 재사용 세션이 미완료 상태일 때 `session.uploadTarget || session.UploadTarget`을 읽어 재업로드를 시도. 그러나 `uploadTarget`은 보통 **POST 생성 응답에만** 포함되고, `GET /sessionUpload/{id}` 응답에는 없을 수 있음.
- **영향**: uploadTarget이 없으면 `retryable: false`로 throw → **재시도 불가 영구 FAILED**. 크래시 후 재실행한 행이 단순 재업로드로 복구되지 못하고 실패 처리될 위험.
- **대응**: uploadTarget이 없을 때는 `retryable: true`로 두거나, 기존 세션을 포기하고 새 세션을 생성하는 폴백으로 변경.

### R-03: 권한 처리 비일관 — course 폴더 권한은 여전 non-fatal

- **상태**: `RESOLVED`
- **위치**: `src/orchestrator.js:136-144`(`grantCourseAccess`), `src/orchestrator.js:156-158`(`ensureUserFolder`)
- **내용**: `ensureUserFolder`는 권한 부여를 **fatal**로 변경(try/catch 제거)되었으나, `grantCourseAccess`는 **여전 try/catch로 non-fatal**. course 폴더 Creator 권한 부여 실패 시 경고만 하고 `COMPLETED`로 진행.
- **영향**: AGENTS.md가 "course folder unless inheritance is used"까지 명시. 상속이 꺼져 있을 때 교수자가 course 폴더에 Creator 권한 없이 세션이 완료 처리될 수 있음.
- **대응**: 의도적 non-fatal 설계라면 상속(inheritance) 설정에 따라 분기하도록 명확화. 아니면 user 폴더와 동일하게 fatal 처리.

---

## 🟡 LOW — 운영 설계

### R-04: 단일 인스턴스 전용 설계 — 다중 인스턴스 시 reclaim 경쟁

- **상태**: `RESOLVED`
- **위치**: `src/db/migrationRepository.js:35-52`(`reclaimStuckRows`), `src/index.js:12-16`
- **내용**: `reclaimStuckRows`가 `STUCK_RECLAIM_SECONDS=600`(10분)으로 회수하지만, 인코딩 폴링은 `POLLING_TIMEOUT_SEC=3600`(1시간)까지 대기 가능.
- **영향**: 단일 인스턴스에선 처리 중 `runOnce`가 블록되어 자기 회수가 일어나지 않아 안전. 그러나 **다중 프로세스/컨테이너**로 같은 DB를 폴링하면, 인스턴스 A가 1시간 폴링 중인 행을 인스턴스 B가 10분 뒤 `PENDING`으로 회수 → 중복 처리. 행 단위 락이 없음.
- **대응**: 단일 인스턴스 운영이 전제면 `WONTFIX`로 기재. 다중화 예정이면 `SELECT ... FOR UPDATE SKIP LOCKED` 기반 클레임 또는 분산 락 보강 필요.

### R-05: `FOLDER_NAME_DELIMITER` 백슬래시(`\`) — Panopto 폴더명 부적합 가능

- **상태**: `OPEN`
- **위치**: `.env`(`FOLDER_NAME_DELIMITER=\`), `src/config/index.js:28,82-83`(`buildUserFolderName`)
- **내용**: `.env`의 `FOLDER_NAME_DELIMITER=\` → dotenv가 단일 백슬래시(코드 92)로 파식(검증 완료). 폴더명이 `cup-panopto\사번` 형태.
- **영향**: AGENTS.md 미해결 항목. Panopto가 폴더명에 `\`를 허용하지 않으면 **폴더 생성 단계에서 런타임 실패**.
- **대응**: 사용자 결정으로 FOLDER_NAME_DELIMITER 값을 백슬래시로 유지. 실제 사이트 연동 시 Panopto 폴더명 백슬래시 허용 여부 확인 후, 불가하면 FOLDER_NAME_DELIMITER=_ 등으로 변경.

### R-06: Panopto REST/SOAP 응답 키 미검증

- **상태**: `RESOLVED`
- **위치**: `src/panopto/sessions.js:9-10`, `src/panopto/folders.js:4-14`, `src/panopto/permissions.js:6-8`, `src/panopto/users.js:73-74`
- **내용**: `POST /sessionUpload`의 `id/Id/ID`·`uploadTarget/UploadTarget`, `GET /folders`의 `parentId`+`search` 필터, `PUT /folders/{id}/access` 배열 본문, SOAP `CreateUserAsync` 결과 키(`CreateUserResult` vs `CreateUserResponse`) 등 응답 형상이 미검증.
- **영향**: 응답 키가 예상과 다르면 `Unexpected sessionUpload response` throw 또는 조용히 무시.
- **대응**: 실사이트 연동 시 각 엔드포인트 응답을 캡처해 키 매핑 검증.

### R-07: `.env`에 `STUCK_RECLAIM_SECONDS` 미기재

- **상태**: `RESOLVED`
- **위치**: `.env`(미기재), `.env.example`(기재됨), `src/config/index.js:75`
- **내용**: 커밋 `e535318`에서 `STUCK_RECLAIM_SECONDS`가 추가되었으나 `.env`에는 반영되지 않음. 기본값 600으로 동작하므로 기능 문제는 아님.
- **영향**: 운영자가 기본값(600초)을 의도적으로 조정하려면 `.env`에 추가 필요.
- **대응**: `.env`에 `STUCK_RECLAIM_SECONDS=600` 행 추가(선택).

---

## 🟢 TRIVIAL — 정리 권장

### R-08: `normalizeRow`의 Lob 분기가 데드 코드화

- **상태**: `RESOLVED`
- **위치**: `src/db/migrationRepository.js:168-176`
- **내용**: `error_message`가 SELECT 컬럼에서 제거되어 CLOB 컬럼이 더 이상 조회되지 않음. `constructor.name === 'Lob'` 분기는 도달 불가.
- **영향**: 동작 영향 없음.
- **대응**: 데드 분기 제거로 가독성 개선 권장.

---

## 해결 이력 (최신순)

> 항목이 해결되면 아래에 이력을 추가하고 본문 상태를 `RESOLVED`로 변경합니다.

### 2026-07-07 — 2차 리뷰 대응 (미커밋 작업)

본 리뷰에서 식별된 R-01~R-08 항목에 대한 2차 대응. 코드 수정은 lint(`eslint`, exit 0) 및 `node --check` 전 파일 통과 완료.

- **R-01 RESOLVED**: `ensureUploadSession`이 `GET /sessions/{id}`(`getSessionStatus`)로 세션 상태를 먼저 확인하도록 변경 → `GET /sessionUpload/{id}` 엔드포인트 존재 의존 제거.
- **R-02 RESOLVED**: 미완료 세션에서 `uploadTarget`을 얻지 못하면 기존 세션은 두고 새 세션을 생성해 처음부터 재업로드(재시도 가능) → 영구 FAILED 회피.
- **R-03 RESOLVED**: `grantCourseAccess`를 fatal 처리(try/catch 제거) — `ensureUserFolder`와 일치.
- **R-04 RESOLVED**: `claimRow()` 원자적 UPDATE(`PENDING→FOLDER_CREATING`) 추가 + `handleRow`에서 클레임 도입으로 다중 인스턴스 동시 처리 방지; `stuckReclaimSeconds` 기본값 600→7200(`POLLING_TIMEOUT_SEC` 3600보다 크게)으로 자기 회수 우려 완화; `.env`/`.env.example`에 `STUCK_RECLAIM_SECONDS=7200` 추가.
- **R-06 RESOLVED**: `pickField()` 헬퍼(`src/panopto/util.js` 신규) 추가, `folders.js`/`sessions.js` 응답 키(id/Id/ID 등) 대소문자 변종 안전 추출; `client.js` 응답 debug 로깅 추가. 단, 실사이트 연동 시 응답 키 캡처 검증은 권장.
- **R-07 RESOLVED**: `.env`에 `STUCK_RECLAIM_SECONDS=7200` 추가.
- **R-08 RESOLVED**: `normalizeRow` 데드 Lob 분기 제거.
- **R-05 OPEN (사용자 결정)**: `FOLDER_NAME_DELIMITER`를 `\`로 유지. Node.js/dotenv 단에서는 오류 없음(dotenv가 단일 백슬래시로 파싱, 검증 완료). 실사이트 연동 시 Panopto 폴더명 백슬래시 허용 여부 확인 필요.

### 2026-07-07 — 커밋 `e535318`로 해결된 사항 (본 리뷰 이전)

아래 항목들은 이번 리뷰를 통해 식별되어 동일 커밋에서 수정된 것들입니다. 참고용으로 기재하며, 본 문서의 OPEN 항목에는 포함되지 않습니다.

- 세션 멱등성 누락 → `ensureUploadSession()` 추가 (단, R-01/R-02 파생 우려 남음)
- `retryable` 플래그 데드 코드 → `markFailed(id, err, retryable)` 시그니처 + SQL 반영 + `handleRow` 전달
- 중단 상태 행 복구 불가 → `reclaimStuckRows()` 추가 (단, R-04 다중 인스턴스 우려 남음)
- `npm run lint` 실패 → `eslint.config.js` + `eslint` devDependency 추가
- CLOB(`error_message`) 처리 취약 → SELECT 컬럼에서 제거 (단, R-08 데드 코드 남음)
- `pollEncoding` 데드 `state` 변수 → `log.debug` 인라인화
- `client.js` 미사용 `refreshToken` import 제거
