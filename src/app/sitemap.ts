import { dishLocales, dishPath } from "@/modules/menu-items";
import { MetadataRoute } from "next";
import {
  getSite,
  getPublicContent,
  getLivePages,
  origin,
  pagePath,
} from "@/server/public";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const record = await getSite();
  if (!record) return [];
  const site = await getPublicContent(record.id);
  if (!site) return [];
  const pages = await getLivePages(site.id);
  const pageEntries = pages.flatMap((p) =>
    p.translations
      .filter(
        (t) =>
          !(t.snapshot as any)?.translation?.noIndex &&
          site.locales.some((l) => l.code === t.locale),
      )
      .map((t) => ({
        url: new URL(
          pagePath(t.publishedSlug!, t.locale, site.defaultLocale),
          origin(site),
        ).href,
        lastModified: p.updatedAt,
      })),
  );
  const dishes = site.items.flatMap((item) => {
    const locales = dishLocales(item, site);
    const languages = Object.fromEntries(
      locales.map((code) => [
        code,
        new URL(dishPath(item.slug, code, site.defaultLocale), origin(site))
          .href,
      ]),
    );
    return locales.map((code) => ({
      url: languages[code],
      lastModified: new Date(item.updatedAt),
      alternates: { languages },
    }));
  });
  return [...pageEntries, ...dishes];
}
