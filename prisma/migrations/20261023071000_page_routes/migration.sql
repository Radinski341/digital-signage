ALTER TABLE "PageTranslation" ADD COLUMN "siteId" TEXT, ADD COLUMN "publishedSlug" TEXT;
UPDATE "PageTranslation" AS t SET "siteId" = p."siteId" FROM "Page" AS p WHERE t."pageId" = p."id";
ALTER TABLE "PageTranslation" ALTER COLUMN "siteId" SET NOT NULL;
CREATE UNIQUE INDEX "PageTranslation_siteId_locale_slug_key" ON "PageTranslation" ("siteId", "locale", "slug");
CREATE UNIQUE INDEX "PageTranslation_siteId_locale_publishedSlug_key" ON "PageTranslation" ("siteId", "locale", "publishedSlug");
