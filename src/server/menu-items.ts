import type { Metadata } from "next";
import {
  dishDescription,
  dishLocales,
  dishPath,
  dishText,
} from "@/modules/menu-items";
import { asset, origin, type PublicContent } from "./public";

export function dishMetadata(
  site: PublicContent,
  item: any,
  locale: string,
): Metadata {
  const text = dishText(item, locale, site.defaultLocale);
  const title = text?.seoTitle || `${text?.name} | ${site.name}`;
  const description = dishDescription(text);
  const canonical = new URL(
    dishPath(item.slug, text.locale, site.defaultLocale),
    origin(site),
  ).href;
  const image = asset(site, item.imageId) || item.images?.[0]?.media;
  const languages = Object.fromEntries(
    dishLocales(item, site).map((code) => [
      code,
      new URL(dishPath(item.slug, code, site.defaultLocale), origin(site)).href,
    ]),
  );
  return {
    metadataBase: new URL(origin(site)),
    title,
    description,
    alternates: { canonical, languages },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      locale: text.locale,
      images: image ? [{ url: image.url, alt: image.alt || text.name }] : [],
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image.url] : [],
    },
  };
}
export function dishStructuredData(
  site: PublicContent,
  item: any,
  locale: string,
) {
  const text = dishText(item, locale, site.defaultLocale);
  const url = new URL(
    dishPath(item.slug, text.locale, site.defaultLocale),
    origin(site),
  ).href;
  const image = asset(site, item.imageId);
  return {
    "@context": "https://schema.org",
    "@type": "MenuItem",
    "@id": `${url}#dish`,
    name: text.name,
    url,
    inLanguage: text.locale,
    ...(text.description || text.details
      ? { description: text.description || text.details }
      : {}),
    ...(image ? { image: image.url } : {}),
    offers: [
      { price: item.price, name: text.name },
      ...(item.variants || []).map((v: any) => ({
        price: v.price,
        name: dishText(v, locale, site.defaultLocale)?.name,
      })),
    ].map((offer) => ({
      "@type": "Offer",
      ...offer,
      priceCurrency: item.currency,
      availability: item.available
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url,
    })),
  };
}
