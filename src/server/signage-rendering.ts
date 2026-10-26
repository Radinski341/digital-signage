import { db } from "./db";
import { localize } from "@/modules/security";
import { signBannerMedia } from "@/lib/media/signBannerMedia";
export async function renderBannerData(
  banner: any,
  published = false,
  projectedSite?: any,
) {
  const snapshot = published ? banner.publicationSnapshot : null;
  const source = snapshot || banner;
  let data: any = { ...(source.data || {}) };
  const site =
    projectedSite ||
    (await db.site.findUniqueOrThrow({
      where: { id: banner.siteId },
      include: { profile: { include: { translations: true } } },
    }));
  const locale = source.sourceLocale || site.defaultLocale;
  data.__currency = source.currency || site.currency;
  data.__locale = locale;
  if (source.menuCategoryId) {
    const category = projectedSite
      ? (() => {
          const c = projectedSite.categories.find(
            (c: any) => c.id === source.menuCategoryId && c.enabled,
          );
          return c
            ? {
                ...c,
                items: projectedSite.items
                  .filter(
                    (i: any) =>
                      i.categoryId === c.id &&
                      i.status === "PUBLISHED" &&
                      i.available,
                  )
                  .slice(0, 15),
              }
            : null;
        })()
      : await db.menuCategory.findFirst({
          where: { id: source.menuCategoryId, siteId: site.id, enabled: true },
          include: {
            translations: true,
            items: {
              where: { siteId: site.id, status: "PUBLISHED", available: true },
              orderBy: { position: "asc" },
              take: 15,
              include: { translations: true },
            },
          },
        });
    const title =
      localize<any>(category?.translations ?? [], locale, site.defaultLocale)
        ?.name || "";
    const rows = (category?.items ?? []).map((item: any) => ({
      name:
        localize<any>(item.translations, locale, site.defaultLocale)?.name ||
        "",
      price: item.price.toString(),
    }));
    data = {
      ...data,
      __currency: category?.items[0]?.currency || site.currency,
      __hidden: !rows.length,
      title,
      description:
        localize<any>(
          site.profile?.translations ?? [],
          locale,
          site.defaultLocale,
        )?.name || site.name,
      rows,
      firstListTitle: title,
      firstList: rows.slice(0, 5),
      secondListTitle: "",
      secondList: rows.slice(5, 10),
      thirdListTitle: "",
      thirdList: rows.slice(10, 15),
    };
  }
  if (source.menuItemId) {
    const item = projectedSite
      ? projectedSite.items.find(
          (i: any) =>
            i.id === source.menuItemId &&
            i.status === "PUBLISHED" &&
            i.available &&
            projectedSite.categories.some(
              (c: any) => c.id === i.categoryId && c.enabled,
            ),
        )
      : await db.menuItem.findFirst({
          where: {
            id: source.menuItemId,
            siteId: site.id,
            status: "PUBLISHED",
            available: true,
            category: { enabled: true },
          },
          include: { translations: true },
        });
    const text = localize<any>(
      item?.translations ?? [],
      locale,
      site.defaultLocale,
    );
    const image = item?.imageId
      ? projectedSite
        ? projectedSite.media.find((m: any) => m.id === item.imageId)
        : await db.mediaAsset.findFirst({
            where: { id: item.imageId, siteId: site.id },
          })
      : null;
    data = {
      ...data,
      __hidden: !item,
      title: text?.name || "",
      subtitle: text?.description || "",
      description: "",
      price: item?.price.toString() ?? null,
      image: image?.url ?? null,
      __currency: item?.currency || site.currency,
    };
  }
  return signBannerMedia(banner.template, data);
}
export async function playerSlide(id: string, previewSiteId?: string) {
  const slide = await db.slide.findUnique({
    where: { id },
    include: {
      site: { select: { version: true } },
      items: {
        orderBy: { order: "asc" },
        include: {
          banner: { include: { template: { include: { fields: true } } } },
        },
      },
    },
  });
  if (!slide) return null;
  if (previewSiteId) {
    if (slide.siteId !== previewSiteId) return null;
    return {
      ...slide,
      items: await Promise.all(
        slide.items.map(async (item) => ({
          ...item,
          banner: { ...item.banner, data: await renderBannerData(item.banner) },
        })),
      ),
    };
  }
  if (slide.status !== "PUBLISHED" || !slide.publicationSnapshot) return null;
  const snapshot = slide.publicationSnapshot as any;
  const banners = await db.banner.findMany({
    where: {
      id: { in: snapshot.bannerIds },
      siteId: slide.siteId,
      status: "PUBLISHED",
      publicationSnapshot: { not: dbNull() },
    },
    include: { template: { include: { fields: true } } },
  });
  const items = await Promise.all(
    snapshot.bannerIds
      .flatMap((bannerId: string, index: number) => {
        const banner = banners.find((b) => b.id === bannerId);
        return banner
          ? [{ id: `${slide.id}-${index}`, order: index, banner }]
          : [];
      })
      .map(async (item: any) => ({
        ...item,
        banner: {
          id: item.banner.id,
          template: {
            key: item.banner.template.key,
            name: item.banner.template.name,
            fields: item.banner.template.fields.map((field: any) => ({
              key: field.key,
              label: field.label,
              type: field.type,
              required: field.required,
              isArray: field.isArray,
            })),
          },
          data: await renderBannerData(item.banner, true),
        },
      })),
  );
  return {
    id: slide.id,
    name: snapshot.name,
    speedMs: snapshot.speedMs,
    effect: snapshot.effect,
    version: slide.version,
    site: slide.site,
    items: items.filter((i) => !i.banner.data.__hidden),
  };
}
import { Prisma } from "@prisma/client";
function dbNull() {
  return Prisma.DbNull;
}
