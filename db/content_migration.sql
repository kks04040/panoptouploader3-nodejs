-- =============================================================================
-- content_migration 테이블 DDL (Oracle)
-- LXP 콘텐츠 마이그레이션 정보 관리 테이블
-- =============================================================================

-- [옵션 A] 시퀀스 방식 (11g 이하 또는 명시적 시퀀스 선호 시)
CREATE TABLE content_migration (
    migration_id             NUMBER(19)       NOT NULL,
    professor_emp_no         VARCHAR2(20)     NOT NULL,  -- 교수자 사번 (LXP 기준)
    professor_name           VARCHAR2(100),               -- 교수자명
    panopto_link_id          VARCHAR2(100)    NOT NULL,  -- 파놉토연결ID (외부사용자 연동 ID)
    panopto_user_folder_name VARCHAR2(200)    NOT NULL,  -- 사용자 폴더명 (파놉토연결ID<DELIM>사번)
    course_id                VARCHAR2(50),                -- LXP 과목 ID
    course_name              VARCHAR2(200)    NOT NULL,  -- 과목명 (파놉토 폴더명)
    source_file_path         VARCHAR2(500)    NOT NULL,  -- Linux 서버 원본 동영상 전체 경로
    source_file_name         VARCHAR2(200)    NOT NULL,  -- 실제 업로드될 파일명
    panopto_session_name     VARCHAR2(300)    NOT NULL,  -- 파놉토 표시 세션명 (원본명과 상이)
    panopto_parent_folder_id VARCHAR2(100),               -- Users 최상위 폴더 ID
    panopto_user_folder_id   VARCHAR2(100),               -- 생성된 사번 폴더 ID (처리 중 갱신)
    panopto_course_folder_id VARCHAR2(100),               -- 생성된 과목 폴더 ID (처리 중 갱신)
    panopto_session_id       VARCHAR2(100),               -- 업로드 완료된 세션 ID
    status                   VARCHAR2(20)     DEFAULT 'PENDING' NOT NULL,
    error_message            CLOB,                        -- 실패 사유
    retry_count              NUMBER(10)       DEFAULT 0 NOT NULL,
    created_at               TIMESTAMP        DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at               TIMESTAMP        DEFAULT SYSTIMESTAMP NOT NULL,
    uploaded_at              TIMESTAMP,                   -- 업로드 완료일
    CONSTRAINT pk_content_migration PRIMARY KEY (migration_id),
    CONSTRAINT ck_cm_status CHECK (status IN ('PENDING','FOLDER_CREATING','UPLOADING','COMPLETED','FAILED'))
);

CREATE INDEX idx_cm_status    ON content_migration (status);
CREATE INDEX idx_cm_emp_no    ON content_migration (professor_emp_no);
CREATE INDEX idx_cm_link_id   ON content_migration (panopto_link_id);
CREATE INDEX idx_cm_session_id ON content_migration (panopto_session_id);
CREATE UNIQUE INDEX uq_cm_session ON content_migration (panopto_course_folder_id, panopto_session_name);

CREATE SEQUENCE seq_content_migration START WITH 1 INCREMENT BY 1 NOCACHE;

-- =============================================================================
-- [옵션 B] Oracle 12c+ IDENTITY 컬럼 방식 (시퀀스 불필요)
-- 위 CREATE TABLE 의 migration_id 컬럼 정의를 아래로 교체하고 시퀀스 생성 생략:
--
--   migration_id NUMBER(19) GENERATED ALWAYS AS IDENTITY,
-- =============================================================================

-- =============================================================================
-- 참고: updated_at 자동 갱신 트리거 (Oracle은 ON UPDATE CURRENT_TIMESTAMP 미지원)
-- =============================================================================
CREATE OR REPLACE TRIGGER trg_content_migration_updated
BEFORE UPDATE ON content_migration
FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSTIMESTAMP;
END;
/
