-- =============================================================================
-- content_migration 보강 마이그레이션 (이미 테이블이 생성된 경우 실행)
-- =============================================================================

-- 교수자 이메일 컬럼 추가 (외부 사용자 생성 시 필수)
ALTER TABLE content_migration ADD (
    professor_email VARCHAR2(200)
);

COMMENT ON COLUMN content_migration.professor_email IS '교수자 이메일 (Panopto 외부 사용자 생성 시 필수)';
