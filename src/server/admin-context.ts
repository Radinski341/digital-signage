import { db } from "./db";
import type { Access } from "./cms";
export async function adminContext(access: Access) {
  const where = { siteId: access.siteId };
  const [
    locales,
    media,
    categories,
    items,
    pages,
    actions,
    integrations,
    tags,
    locations,
  ] = await Promise.all([
    db.siteLocale.findMany({ where }),
    db.mediaAsset.findMany({
      where: { ...where, archived: false },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.menuCategory.findMany({
      where,
      include: { translations: true },
      orderBy: { position: "asc" },
    }),
    db.menuItem.findMany({
      where,
      include: { translations: true },
      orderBy: { position: "asc" },
    }),
    db.page.findMany({ where, select: { id: true, internalName: true } }),
    db.action.findMany({ where }),
    db.orderingIntegration.findMany({ where }),
    db.menuTag.findMany({ where, include: { translations: true } }),
    db.location.findMany({ where, orderBy: { position: "asc" } }),
  ]);
  return JSON.parse(
    JSON.stringify({
      site: access.site,
      role: access.role,
      locales,
      media,
      categories,
      items,
      pages,
      actions,
      integrations,
      tags,
      locations,
    }),
  );
}
