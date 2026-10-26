-- ONLY for a database still at 20250812182057_init. Back up the entire database first.
-- Review with the runbook. Run with psql -v ON_ERROR_STOP=1, then verify before migrate resolve.
BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Template' AND column_name='key') THEN
  RAISE EXCEPTION 'Unexpected schema: Template.key already exists. Stop and inspect migration history.';
 END IF;
 IF to_regclass('public."MediaAsset"') IS NULL OR to_regclass('legacy_archive."MediaAsset"') IS NOT NULL THEN
  RAISE EXCEPTION 'Unexpected media archive state. Stop for manual review.';
 END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS legacy_archive;
ALTER TABLE public."MediaAsset" SET SCHEMA legacy_archive;
ALTER TYPE "public"."FieldType" ADD VALUE IF NOT EXISTS 'BOOLEAN';
ALTER TYPE "public"."FieldType" ADD VALUE IF NOT EXISTS 'SELECT';
ALTER TYPE "public"."FieldType" ADD VALUE IF NOT EXISTS 'COLOR';
ALTER TABLE "Template" ADD COLUMN "description" TEXT, ADD COLUMN "key" TEXT;
UPDATE "Template" SET "key" = 'legacy-' || md5("id");
ALTER TABLE "Template" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "Template_key_key" ON "Template"("key");
ALTER TABLE "TemplateField" ADD COLUMN "config" JSONB, ADD COLUMN "isArray" BOOLEAN NOT NULL DEFAULT false;
COMMIT;
-- Legacy media remains in legacy_archive."MediaAsset" and is included in full database backups.
-- Existing generic templates retain fields and content; do not guess a designed renderer from a name.
