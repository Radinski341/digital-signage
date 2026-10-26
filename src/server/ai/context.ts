import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { type Access, permission } from "@/server/cms";
import { permits } from "@/modules/security";
import type { Resource } from "@/modules/cms";
import type { AiScope } from "@/modules/ai/contracts";
import { dictionaryDefaults } from "@/modules/localization";

export function checkAiPermission(access: Access, scope: AiScope) {
  const required = ["templates", "banners", "slides", "media"].includes(scope)
    ? "content"
    : permission(scope as Resource);
  if (!permits(access.role, required))
    throw new AppError(403, "You cannot edit this content area.");
}

const models = {
  profile: "restaurantProfile",
  branding: "branding",
  locations: "location",
  categories: "menuCategory",
  items: "menuItem",
  tags: "menuTag",
  locales: "siteLocale",
  integrations: "orderingIntegration",
  actions: "action",
  pages: "page",
  navigation: "navigation",
  media: "mediaAsset",
  banners: "banner",
  slides: "slide",
  templates: "template",
} as const;
export async function assertTarget(
  access: Access,
  scope: AiScope,
  recordId: string | null,
) {
  checkAiPermission(access, scope);
  if (recordId) {
    const found = await (db[models[scope]] as any).findFirst({
      where: { id: recordId, siteId: access.siteId },
      select: { id: true },
    });
    if (!found) throw new AppError(404, "Content not found.");
  }
}

export async function aiContext(
  access: Access,
  scope: AiScope,
  recordId: string | null,
  templateId?: string,
  sourceMode?: string,
) {
  await assertTarget(access, scope, recordId);
  const where = { siteId: access.siteId };
  const [
    profile,
    locales,
    categories,
    items,
    pages,
    actions,
    integrations,
    tags,
    locations,
    banners,
    banner,
  ] = await Promise.all([
    db.restaurantProfile.findUnique({
      where: { siteId: access.siteId },
      select: {
        cuisines: true,
        phone: true,
        email: true,
        translations: {
          where: { locale: access.site.defaultLocale },
          select: {
            locale: true,
            name: true,
            summary: true,
            description: true,
          },
        },
      },
    }),
    db.siteLocale.findMany({
      where,
      select: {
        id: true,
        code: true,
        label: true,
        enabled: true,
        direction: true,
      },
    }),
    db.menuCategory.findMany({
      where,
      take: 100,
      select: {
        id: true,
        translations: {
          where: { locale: access.site.defaultLocale },
          select: { locale: true, name: true },
        },
      },
    }),
    db.menuItem.findMany({
      where,
      take: 100,
      select: {
        id: true,
        translations: {
          where: { locale: access.site.defaultLocale },
          select: { locale: true, name: true },
        },
      },
    }),
    db.page.findMany({
      where,
      take: 100,
      select: { id: true, internalName: true, type: true },
    }),
    db.action.findMany({ where, take: 100, select: { id: true, name: true } }),
    db.orderingIntegration.findMany({
      where,
      take: 100,
      select: { id: true, label: true },
    }),
    db.menuTag.findMany({
      where,
      take: 100,
      select: { id: true, key: true, kind: true },
    }),
    db.location.findMany({
      where,
      take: 30,
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        country: true,
        hours: true,
      },
    }),
    scope === "slides"
      ? db.banner.findMany({
          where,
          take: 100,
          select: { id: true, template: { select: { name: true } } },
        })
      : [],
    scope === "banners" && recordId
      ? db.banner.findFirst({
          where: { ...where, id: recordId },
          select: { templateId: true, menuCategoryId: true, menuItemId: true },
        })
      : null,
  ]);
  if (banner && templateId && banner.templateId !== templateId)
    throw new AppError(400, "This banner uses a different template.");
  const template =
    scope === "banners"
      ? await db.template.findFirst({
          where: { ...where, id: banner?.templateId || templateId || "" },
          select: { name: true, fields: { orderBy: { order: "asc" } } },
        })
      : null;
  if (scope === "banners" && !template)
    throw new AppError(400, "Choose a banner template first.");
  const linked = sourceMode
    ? sourceMode !== "MANUAL"
    : Boolean(banner?.menuCategoryId || banner?.menuItemId);
  const fields =
    template?.fields.filter(
      (f) => !linked || ["note", "themeColor"].includes(f.key),
    ) ?? [];
  return {
    fields,
    context: {
      restaurant: {
        name: access.site.name,
        currency: access.site.currency,
        timeZone: access.site.timeZone,
        defaultLocale: access.site.defaultLocale,
        profile,
      },
      locales,
      ...(scope === "locales"
        ? {
            interfaceDictionary: dictionaryDefaults,
            editingLocale:
              locales.find((locale) => locale.id === recordId) ?? null,
          }
        : {}),
      categories,
      items,
      pages,
      actions,
      integrations,
      tags,
      locations,
      banners,
      template: template ? { name: template.name, fields } : null,
    },
    references: {
      categoryId: categories.map((v) => v.id),
      categoryIds: categories.map((v) => v.id),
      itemId: items.map((v) => v.id),
      itemIds: items.map((v) => v.id),
      pageId: pages.map((v) => v.id),
      actionId: actions.map((v) => v.id),
      actionIds: actions.map((v) => v.id),
      integrationId: integrations.map((v) => v.id),
      tagIds: tags.map((v) => v.id),
      locationId: locations.map((v) => v.id),
      bannerIds: banners.map((v) => v.id),
    },
    allowedLocales: locales.map((l) => l.code),
  };
}
