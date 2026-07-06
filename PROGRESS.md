# 진행 사항 기록
> 본 파일은 구현 이전 단계의 설계/합의 사항을 추적하기 위한 진행 로그입니다.
> 코드 구현이 시작되면 이 파일의 완료된 항목은 AGENTS.md 로 이관/통합하세요.

## 완료 사항

- [x] 콘텐츠 마이그레이션 테이블 설계 (content_migration)
  - 컬럼 구조 확정 (Oracle DDL 기준)
  - status 라이프사이클 정의: PENDING -> FOLDER_CREATING -> UPLOADING -> COMPLETED | FAILED
  - 유니크 인덱스 uq_cm_session (panopto_course_folder_id, panopto_session_name) 적용
  - PK migration_id -> Oracle 시퀀스 seq_content_migration (12c+ IDENTITY 옵션 제시)
- [x] Oracle DDL 문 작성 -> db/content_migration.sql
  - CREATE TABLE content_migration + 인덱스/시퀀스/CHECK 제약
  - IDENTITY 대체안(12c+) 및 updated_at 자동 갱신 트리거 포함
- [x] 파놉토 접속/프로세스 필요 사항 정리
  - OAuth2 Client Credentials 인증
  - 폴더 생성 -> 권한 부여 -> 세션 생성 -> 청크 업로드 -> 인코딩 폴링 흐름 정리
- [x] .env.example 템플릿 생성
  - PANOPTO_*, LINUX_*, DB_*, 업로드/폴링 설정, FOLDER_NAME_DELIMITER 포함
  - 비밀값(클라이언트 시크릿/서비스계정/DB 자격증명)은 변수로만 정의(사용자 기재 예정)
- [x] .env 실제 값 기재 완료 (사용자)
- [x] .gitignore 추가 (.env, node_modules/, *.log, .env.local 제외)
- [x] AGENTS.md 작성
  - 폴더명 규칙, 세션명은 파일명과 상이, 멱등성, DB/스키마, 업로드 흐름, 미해결 항목 문서화
- [x] 폴더명 오타 수정: Uusers -> Users (최상위 폴더명)
- [x] Git 저장소 push: https://github.com/kks04040/panoptouploader3-nodejs.git (main 브랜치)

## 미해결 / 확인 필요 항목

- [ ] FOLDER_NAME_DELIMITER 값 확정: \ 허용 여부 API 확인 (불가 시 _ 등으로 조정)
- [ ] panopto_session_name 세션명 생성 규칙 정의 (현재는 "원본명과 상이" 조건만 있음)
- [ ] 중복 course_name(학기/연도별 충돌) 처리 기준 - 학기/연도 판별자 컬럼 추가 검토
- [ ] 파놉토연결ID -> 사용자 키(UserManagement API) 조회 방식 (IdP/SSO 설정 의존)
- [ ] Linux -> 애플리케이션 파일 접근 방식 확정 (LOCAL_MOUNT vs SFTP)

## 다음 단계 (구현 진입)

1. Node.js 프로젝트 초기화 (package.json, 디렉토리 구조)
2. Oracle DB 연결 (content_migration PENDING 조회/갱신)
3. Panopto OAuth2 토큰 발급/갱신 모듈
4. 폴더 생성 + 권한 부여 모듈
5. 세션 생성 + MP4 청크 업로드 모듈
6. 인코딩 폴링 + 상태 갱신
7. 실패 처리/재시도 로직
