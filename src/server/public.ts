import { unstable_cache } from "next/cache";
import { db } from "./db";
import { publicSite } from "./access";
import { localize, safeHref } from "@/modules/security";
import { AppError } from "./errors";
import { mediaIds } from "@/modules/sections/schema";
export const getSite = unstable_cache(publicSite, ["installation-site"], {
  revalidate: 60,
});
export const getPublicContent = (siteId: string, preview = false) => {
  const load = async () => {
    const site = await db.site.findUnique({
      where: { id: siteId },
      include: {
        profile: {
          include: {
            translations: true,
            socials: { orderBy: { position: "asc" } },
          },
        },
        branding: true,
        locales: { where: { enabled: true }, include: { strings: true } },
        locations: {
          orderBy: { position: "asc" },
          include: {
            hours: { orderBy: { position: "asc" } },
            exceptions: { include: { intervals: true } },
          },
        },
        categories: {
          where: { enabled: true },
          orderBy: { position: "asc" },
          include: { translations: true },
        },
        items: {
          where: { status: "PUBLISHED", category: { enabled: true } },
          orderBy: { position: "asc" },
          include: {
            translations: true,
            variants: {
              orderBy: { position: "asc" },
              include: { translations: true },
            },
            tags: { include: { tag: { include: { translations: true } } } },
            images: { include: { media: true }, orderBy: { position: "asc" } },
          },
        },
        media: true,
        actions: {
          where: { enabled: true },
          include: {
            translations: true,
            integration: true,
            page: { include: { translations: true } },
          },
        },
        navigation: {
          include: {
            items: {
              where: { enabled: true },
              include: {
                translations: true,
                page: { include: { translations: true } },
              },
              orderBy: { position: "asc" },
            },
          },
        },
      },
    });
    if (!site) return null;
    if (!preview) {
      const translations = await db.pageTranslation.findMany({
        where: { siteId, publishedRevisionId: { not: null } },
        select: { publishedRevisionId: true },
      });
      const references = await db.mediaReference.findMany({
        where: {
          revisionId: { in: translations.map((t) => t.publishedRevisionId!) },
        },
      });
      const used = new Set([
        ...mediaIds({
          branding: site.branding,
          categories: site.categories,
          items: site.items,
          actions: site.actions,
        }),
        ...references.map((r) => r.mediaId),
      ]);
      site.media = site.media.filter((m) => used.has(m.id));
    }
    return JSON.parse(JSON.stringify(site)) as PublicContent;
  };
  return preview
    ? load()
    : unstable_cache(load, ["public-content", siteId], {
        tags: [`site:${siteId}`],
        revalidate: 300,
      })();
};
// Serialized domain DTO: Decimal values and timestamps are serialized at the server boundary.
export type PublicContent = Record<string, any> & {
  id: string;
  name: string;
  defaultLocale: string;
  locales: any[];
  media: any[];
  items: any[];
  categories: any[];
  actions: any[];
  locations: any[];
  navigation: any[];
};
export const getLivePages = (siteId: string) =>
  unstable_cache(
    async () => {
      const pages = await db.page.findMany({
        where: { siteId, status: "PUBLISHED" },
        include: { translations: true },
      });
      const ids = pages.flatMap((p) =>
        p.translations.flatMap((t) =>
          t.publishedRevisionId ? [t.publishedRevisionId] : [],
        ),
      );
      const revisions = await db.contentRevision.findMany({
        where: { id: { in: ids } },
      });
      return pages.map((p) => ({
        ...p,
        translations: p.translations
          .filter((t) => t.publishedRevisionId)
          .map((t) => ({
            ...t,
            snapshot: revisions.find((r) => r.id === t.publishedRevisionId)
              ?.snapshot,
          })),
      }));
    },
    ["public-pages", siteId],
    { tags: [`site:${siteId}`], revalidate: 300 },
  )();
export function pagePath(slug: string, locale: string, defaultLocale: string) {
  return (
    `${locale === defaultLocale ? "" : "/" + locale}${slug ? "/" + slug : ""}` ||
    "/"
  );
}
export function localized<T extends { locale: string }>(
  items: T[],
  locale: string,
  site: PublicContent,
): T | undefined {
  return localize(items, locale, site.defaultLocale);
}
export function asset(site: PublicContent, id: string | undefined | null) {
  return id ? site.media.find((m) => m.id === id) : undefined;
}
export function sitePagePath(
  slug: string,
  locale: string,
  site: PublicContent,
) {
  return (site.previewBase || "") + pagePath(slug, locale, site.defaultLocale);
}
export function actionLink(
  action: any,
  site: PublicContent,
  locale: string,
): string | null {
  if (!action?.enabled) return null;
  switch (action.type) {
    case "PAGE": {
      const t =
        action.page?.translations.find(
          (t: any) => t.locale === locale && t.publishedRevisionId,
        ) ??
        action.page?.translations.find(
          (t: any) => t.locale === site.defaultLocale && t.publishedRevisionId,
        );
      return t ? sitePagePath(t.publishedSlug, t.locale, site) : null;
    }
    case "ORDERING":
      return action.integration?.enabled
        ? safeHref(action.integration.url)
        : null;
    case "PHONE": {
      const phone = (action.destination || site.profile?.phone || "").replace(
        /[ ()]/g,
        "",
      );
      return safeHref("tel:" + phone);
    }
    case "EMAIL":
      return safeHref(
        "mailto:" + (action.destination || site.profile?.email || ""),
      );
    case "DIRECTIONS":
      return safeHref(action.destination || site.locations[0]?.directionsUrl);
    default:
      return safeHref(action.destination);
  }
}
export { dictionaryDefaults } from "@/modules/localization";
import { dictionaryDefaults } from "@/modules/localization";
export function dictionary(site: PublicContent, locale: string) {
  const base = Object.fromEntries(
    (
      site.locales.find((l) => l.code === site.defaultLocale)?.strings ?? []
    ).map((s: any) => [s.key, s.value]),
  );
  const requested = Object.fromEntries(
    (site.locales.find((l) => l.code === locale)?.strings ?? []).map(
      (s: any) => [s.key, s.value],
    ),
  );
  return { ...dictionaryDefaults, ...base, ...requested };
}
export function origin(site: PublicContent) {
  const value = site.domain || process.env.NEXTAUTH_URL;
  if (!value) throw new AppError(503, "Configure the public domain.");
  return new URL(value).origin;
}
export function restaurantStructuredData(site: PublicContent, locale: string) {
  const profile = site.profile;
  const text = localized(profile?.translations ?? [], locale, site) as any;
  const location = site.locations[0];
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: text?.name || site.name,
    url: origin(site),
    ...(profile?.phone ? { telephone: profile.phone } : {}),
    ...(profile?.email ? { email: profile.email } : {}),
    ...(profile?.cuisines?.length ? { servesCuisine: profile.cuisines } : {}),
    ...(profile?.priceRange ? { priceRange: profile.priceRange } : {}),
    ...(location
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: location.address,
            addressLocality: location.city,
            addressCountry: location.country,
            ...(location.postalCode ? { postalCode: location.postalCode } : {}),
          },
          ...(location.latitude != null && location.longitude != null
            ? {
                geo: {
                  "@type": "GeoCoordinates",
                  latitude: Number(location.latitude),
                  longitude: Number(location.longitude),
                },
              }
            : {}),
          openingHoursSpecification: location.hours.map((h: any) => ({
            "@type": "OpeningHoursSpecification",
            dayOfWeek: [
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ][h.weekday],
            opens: h.opens,
            closes: h.closes,
          })),
        }
      : {}),
    sameAs: profile?.socials?.map((s: any) => s.url) ?? [],
  };
}
