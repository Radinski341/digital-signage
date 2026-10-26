import { richDocumentText } from "./rich-text";
import { localize } from "./formatting";

export function dishPath(slug: string, locale: string, defaultLocale: string) {
  return `${locale === defaultLocale ? "" : "/" + locale}/dishes/${encodeURIComponent(slug)}`;
}
export function dishLocales(item: any, site: any): string[] {
  return site.locales
    .filter(
      (l: any) =>
        l.enabled !== false &&
        item.translations.some(
          (t: any) => t.locale === l.code && t.name?.trim(),
        ),
    )
    .map((l: any) => l.code);
}
export function dishDescription(text: any): string | undefined {
  const description = (
    text?.seoDescription ||
    text?.description ||
    (text?.detailsDocument
      ? richDocumentText(text.detailsDocument)
      : text?.details) ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim();
  return description ? description.slice(0, 160) : undefined;
}
export function relatedDishes(item: any, items: any[], limit = 4) {
  const tags = new Set((item.tags || []).map(({ tag }: any) => tag.id));
  const score = (candidate: any) =>
    (candidate.categoryId === item.categoryId ? 100 : 0) +
    (candidate.tags || []).filter(({ tag }: any) => tags.has(tag.id)).length *
      5 +
    (candidate.featured ? 1 : 0);
  return items
    .filter(
      (candidate) =>
        candidate.id !== item.id &&
        candidate.available &&
        (!candidate.status || candidate.status === "PUBLISHED"),
    )
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}
export function dishText(item: any, locale: string, defaultLocale: string) {
  return localize(item.translations, locale, defaultLocale) as any;
}
