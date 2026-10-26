ALTER TABLE "Membership" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Action" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SiteLocale" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Navigation" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "MenuTag" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
-- Custom pages may repeat their type; essential page identities are unique per site.
CREATE UNIQUE INDEX "Page_siteId_system_type_key" ON "Page" ("siteId", "type") WHERE "type" <> 'CUSTOM';
