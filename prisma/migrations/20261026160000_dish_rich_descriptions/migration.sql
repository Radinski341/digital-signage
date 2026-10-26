-- Preserve all existing plain descriptions; structured content is optional.
ALTER TABLE "ItemTranslation" ADD COLUMN "detailsDocument" JSONB;
