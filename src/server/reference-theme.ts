import { PrismaClient, Prisma } from "@prisma/client";
export const referenceBranding = {
  primaryColor: "#282828",
  accentColor: "#383838",
  textColor: "#101820",
  backgroundColor: "#ffffff",
  surfaceColor: "#ffffff",
  headingFont: "montserrat",
  bodyFont: "montserrat",
  radius: 22,
};

/** Explicit installation operation: scoped, audited, idempotent, never publishes content. */
export async function applyReferenceTheme(
  db: PrismaClient,
  siteId: string,
  options: { branding?: boolean } = {},
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Site" WHERE id = ${siteId} FOR NO KEY UPDATE`;
    const site = await tx.site.findUniqueOrThrow({
      where: { id: siteId },
      include: { branding: true, locales: { include: { strings: true } } },
    });
    let changed = false;
    const brandingChanged =
      options.branding !== false &&
      Object.entries(referenceBranding).some(
        ([key, value]) => (site.branding as any)?.[key] !== value,
      );
    if (brandingChanged) {
      const branding = await tx.branding.upsert({
        where: { siteId },
        create: { siteId, ...referenceBranding },
        update: { ...referenceBranding, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          siteId,
          action: "branding.reference_preset",
          targetType: "branding",
          targetId: branding.id,
          before: site.branding
            ? Object.fromEntries(
                Object.keys(referenceBranding).map((key) => [
                  key,
                  (site.branding as any)[key],
                ]),
              )
            : Prisma.JsonNull,
          after: referenceBranding,
        },
      });
      changed = true;
    }
    let locations = await tx.page.findFirst({
      where: { siteId, sections: { some: { type: "LOCATIONS" } } },
    });
    if (!locations) {
      let slug = "locations";
      let suffix = 2;
      while (
        await tx.pageTranslation.findFirst({
          where: { siteId, OR: [{ slug }, { publishedSlug: slug }] },
        })
      )
        slug = "locations-" + suffix++;
      const locale = site.locales.find(
        (language) => language.code === site.defaultLocale,
      );
      const title =
        locale?.strings.find((string) => string.key === "locations")?.value ||
        "Locations";
      locations = await tx.page.create({
        data: {
          siteId,
          type: "CUSTOM",
          internalName: "Locations",
          translations: {
            create: { siteId, locale: site.defaultLocale, title, slug },
          },
          sections: {
            create: {
              type: "LOCATIONS",
              config: { locationId: null },
              translations: {
                create: {
                  locale: site.defaultLocale,
                  content: { heading: "", subtitle: "", caption: "", alt: "" },
                },
              },
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          siteId,
          action: "page.locations_starter",
          targetType: "Page",
          targetId: locations.id,
        },
      });
      changed = true;
    }
    const pages = await tx.page.findMany({
      where: {
        siteId,
        OR: [
          { type: { in: ["MENU", "ABOUT", "CONTACT"] } },
          { id: locations.id },
        ],
      },
      include: { translations: true },
      orderBy: { createdAt: "asc" },
    });
    for (const key of ["header", "footer", "footer-info"]) {
      const existing = await tx.navigation.findUnique({
        where: { siteId_key: { siteId, key } },
        include: { items: true },
      });
      const navigation =
        existing || (await tx.navigation.create({ data: { siteId, key } }));
      if (!existing) changed = true;
      const targets =
        key === "footer-info"
          ? []
          : existing?.items.length
            ? pages.filter(
                (page) =>
                  page.id === locations!.id &&
                  !existing.items.some((item) => item.pageId === page.id),
              )
            : pages;
      let position =
        Math.max(-1, ...(existing?.items.map((item) => item.position) ?? [])) +
        1;
      for (const page of targets) {
        const title =
          page.translations.find(
            (translation) => translation.locale === site.defaultLocale,
          )?.title || page.internalName;
        await tx.navigationItem.create({
          data: {
            navigationId: navigation.id,
            pageId: page.id,
            position: position++,
            translations: {
              create: { locale: site.defaultLocale, label: title },
            },
          },
        });
        changed = true;
      }
      if (targets.length && existing)
        await tx.navigation.update({
          where: { id: navigation.id },
          data: { version: { increment: 1 } },
        });
    }
    if (changed) {
      await tx.site.update({
        where: { id: siteId },
        data: { version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          siteId,
          action: "theme.reference_setup",
          targetType: "Site",
          targetId: siteId,
          after: { locationsPageId: locations.id, brandingChanged },
        },
      });
    }
    return {
      siteId,
      changed,
      brandingChanged,
      locationsPageId: locations.id,
      locationsStatus: locations.status,
    };
  });
}
