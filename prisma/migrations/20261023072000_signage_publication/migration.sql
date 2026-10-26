-- AlterTable
ALTER TABLE "public"."Banner" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "menuCategoryId" TEXT,
ADD COLUMN     "menuItemId" TEXT,
ADD COLUMN     "publicationSnapshot" JSONB,
ADD COLUMN     "sourceLocale" TEXT,
ADD COLUMN     "status" "public"."PublicationStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "public"."Slide" ADD COLUMN     "publicationSnapshot" JSONB,
ADD COLUMN     "status" "public"."PublicationStatus" NOT NULL DEFAULT 'DRAFT';

-- AddForeignKey
ALTER TABLE "public"."Banner" ADD CONSTRAINT "Banner_menuCategoryId_fkey" FOREIGN KEY ("menuCategoryId") REFERENCES "public"."MenuCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Banner" ADD CONSTRAINT "Banner_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "public"."MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Legacy signage stays live, with exactly its existing content and monetary denomination.
UPDATE "Banner" SET "status" = 'PUBLISHED', "currency" = 'BGN', "publicationSnapshot" = jsonb_build_object('data', "data", 'currency', 'BGN', 'menuCategoryId', null, 'menuItemId', null, 'sourceLocale', null);
UPDATE "Slide" AS s SET "status" = 'PUBLISHED', "publicationSnapshot" = jsonb_build_object('name', s."name", 'speedMs', s."speedMs", 'effect', s."effect", 'bannerIds', COALESCE((SELECT jsonb_agg(i."bannerId" ORDER BY i."order") FROM "SlideItem" AS i WHERE i."slideId" = s."id"), '[]'::jsonb));
