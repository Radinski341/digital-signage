import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  applyReferenceTheme,
  referenceBranding,
} from "@/server/reference-theme";
const db = new PrismaClient();
let siteId: string;
beforeAll(async () => {
  const site = await db.site.create({
    data: {
      key: "theme-test-" + crypto.randomUUID(),
      name: "Theme test",
      branding: {
        create: {
          primaryColor: "#123456",
          headingFont: "serif",
          logoId: "preserved-logo",
        },
      },
      locales: { create: { code: "en", label: "English" } },
      navigation: {
        create: {
          key: "header",
          items: {
            create: {
              url: "https://example.test/existing",
              position: 4,
              translations: {
                create: { locale: "en", label: "Existing navigation" },
              },
            },
          },
        },
      },
    },
  });
  siteId = site.id;
  await db.page.create({
    data: {
      siteId,
      type: "HOME",
      internalName: "Existing Home",
      translations: {
        create: { siteId, locale: "en", slug: "", title: "Existing title" },
      },
    },
  });
});
afterAll(async () => {
  if (siteId) {
    await db.navigation.deleteMany({ where: { siteId } });
    await db.pageTranslation.deleteMany({ where: { siteId } });
    await db.page.deleteMany({ where: { siteId } });
    await db.auditLog.deleteMany({ where: { siteId } });
    await db.branding.deleteMany({ where: { siteId } });
    await db.siteLocale.deleteMany({ where: { siteId } });
    await db.site.delete({ where: { id: siteId } });
  }
  await db.$disconnect();
});
describe.sequential("audited reference preset", () => {
  it("uses neutral defaults for newly created branding without changing explicit settings", async () => {
    expect(
      await db.branding.findUniqueOrThrow({ where: { siteId } }),
    ).toMatchObject({
      primaryColor: "#123456",
      headingFont: "serif",
      bodyFont: "montserrat",
      backgroundColor: "#ffffff",
      radius: 22,
    });
  });
  it("preserves existing assets/navigation and creates only an unpublished Locations page", async () => {
    const result = await applyReferenceTheme(db, siteId);
    expect(result.changed).toBe(true);
    expect(result.locationsStatus).toBe("DRAFT");
    expect(await db.branding.findUnique({ where: { siteId } })).toMatchObject({
      ...referenceBranding,
      logoId: "preserved-logo",
    });
    expect(
      await db.navigationItem.findFirst({
        where: { navigation: { siteId }, url: "https://example.test/existing" },
      }),
    ).not.toBeNull();
    const page = await db.page.findUniqueOrThrow({
      where: { id: result.locationsPageId },
      include: { translations: true, sections: true },
    });
    expect(page.sections[0].type).toBe("LOCATIONS");
    expect(page.translations[0].publishedRevisionId).toBeNull();
    expect(
      await db.auditLog.findFirst({
        where: { siteId, action: "branding.reference_preset" },
      }),
    ).toMatchObject({
      before: expect.objectContaining({ primaryColor: "#123456" }),
    });
  });
  it("is idempotent and does not overwrite branding during normal seeding", async () => {
    expect((await applyReferenceTheme(db, siteId)).changed).toBe(false);
    await db.branding.update({
      where: { siteId },
      data: { primaryColor: "#135724" },
    });
    await applyReferenceTheme(db, siteId, { branding: false });
    expect(
      (await db.branding.findUniqueOrThrow({ where: { siteId } })).primaryColor,
    ).toBe("#135724");
  });
});
