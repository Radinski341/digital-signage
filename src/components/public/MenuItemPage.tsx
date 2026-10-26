import Link from "next/link";
import { ArrowLeft, Utensils } from "lucide-react";
import { richDocumentText } from "@/modules/rich-text";
import { mediaIds } from "@/modules/sections/schema";
import { formatPrice } from "@/modules/formatting";
import {
  dishLocales,
  dishPath,
  dishText,
  relatedDishes,
} from "@/modules/menu-items";
import {
  actionLink,
  asset,
  dictionary,
  localized,
  origin,
  sitePagePath,
  type PublicContent,
} from "@/server/public";
import { dishStructuredData } from "@/server/menu-items";
import SiteLayout from "./SiteLayout";
import MenuItemCard from "./MenuItemCard";
import Actions from "./Actions";
import RichText from "./RichText";
import AllergenPanel from "./AllergenPanel";

export default function MenuItemPage({
  site,
  item,
  locale,
  pages,
  preview = false,
}: {
  site: PublicContent;
  item: any;
  locale: string;
  pages: any[];
  preview?: boolean;
}) {
  const text = dishText(item, locale, site.defaultLocale);
  const strings = dictionary(site, locale);
  const hasDetails = text.detailsDocument
    ? Boolean(
        richDocumentText(text.detailsDocument).trim() ||
          mediaIds(text.detailsDocument).length,
      )
    : Boolean(text.details);
  const category = site.categories.find((c) => c.id === item.categoryId);
  const categoryText = localized(
    category?.translations || [],
    locale,
    site,
  ) as any;
  const menu = pages.find((page) => page.type === "MENU");
  const menuTranslation = localized(
    menu?.translations || [],
    locale,
    site,
  ) as any;
  const menuHref = menuTranslation
    ? sitePagePath(
        menuTranslation.publishedSlug ?? menuTranslation.slug,
        menuTranslation.locale,
        site,
      )
    : sitePagePath("", locale, site);
  const primaryImage = asset(site, item.imageId) || item.images?.[0]?.media;
  const gallery = (item.images || [])
    .map((entry: any) => entry.media || asset(site, entry.mediaId))
    .filter((image: any) => image && image.id !== primaryImage?.id);
  const order = item.actionId
    ? site.actions.find((a) => a.id === item.actionId)
    : site.actions.find(
        (a) => a.type === "ORDERING" && actionLink(a, site, locale),
      );
  const related = relatedDishes(item, site.items);
  const languagePaths = Object.fromEntries(
    dishLocales(item, site).map((code) => [
      code,
      (site.previewBase || "") + dishPath(item.slug, code, site.defaultLocale),
    ]),
  );
  const breadcrumbs = [
    { name: strings.home, href: sitePagePath("", locale, site) },
    { name: strings.menu, href: menuHref },
    ...(categoryText
      ? [
          {
            name: categoryText.name,
            href: `${menuHref}#category-${category.id}`,
          },
        ]
      : []),
    {
      name: text.name,
      href:
        (site.previewBase || "") +
        dishPath(item.slug, locale, site.defaultLocale),
    },
  ];
  const schema = [
    dishStructuredData(site, item, locale),
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((entry, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: entry.name,
        item: new URL(entry.href, origin(site)).href,
      })),
    },
  ];
  return (
    <SiteLayout site={site} locale={locale} languagePaths={languagePaths}>
      {!preview && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <div className="public-section dish-page">
        <nav className="public-breadcrumbs" aria-label={strings.breadcrumbs}>
          {breadcrumbs.map((entry, index) => (
            <span key={index}>
              {index > 0 && <span aria-hidden="true"> › </span>}
              {index === breadcrumbs.length - 1 ? (
                <span aria-current="page" lang={text.locale}>
                  {entry.name}
                </span>
              ) : (
                <Link href={entry.href}>{entry.name}</Link>
              )}
            </span>
          ))}
        </nav>
        <div className="dish-page-hero">
          <div className="dish-page-media">
            <div className="dish-page-image">
              {primaryImage ? (
                <img
                  src={primaryImage.url}
                  alt={primaryImage.alt || text.name}
                  width={primaryImage.width || 900}
                  height={primaryImage.height || 900}
                  fetchPriority="high"
                />
              ) : (
                <Utensils size={80} aria-hidden="true" />
              )}
            </div>
            {gallery.length > 0 && (
              <div className="dish-page-gallery">
                {gallery.map((image: any) => (
                  <figure key={image.id}>
                    <img
                      src={image.url}
                      alt={image.alt || text.name}
                      width={image.width}
                      height={image.height}
                      loading="lazy"
                    />
                    {image.caption && <figcaption>{image.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            )}
          </div>
          <div className="dish-page-summary">
            {categoryText && (
              <Link
                href={`${menuHref}#category-${category.id}`}
                className="eyebrow"
                lang={categoryText.locale}
              >
                {categoryText.name}
              </Link>
            )}
            <h1 lang={text.locale}>{text.name}</h1>
            {text.description && (
              <p className="dish-page-lead" lang={text.locale}>
                {text.description}
              </p>
            )}
            <p className="dish-price">
              {formatPrice(item.price, item.currency, locale)}
            </p>
            {!item.available && (
              <p className="availability" role="status">
                {strings.unavailable}
              </p>
            )}
            {item.variants?.length > 0 && (
              <section className="dish-page-portions">
                <h2>{strings.portions}</h2>
                <ul className="dish-variants">
                  {item.variants.map((variant: any) => {
                    const translated = dishText(
                      variant,
                      locale,
                      site.defaultLocale,
                    );
                    return (
                      <li key={variant.id}>
                        <span lang={translated?.locale}>
                          {translated?.name}
                        </span>
                        <strong>
                          {formatPrice(variant.price, item.currency, locale)}
                        </strong>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {item.available && order && (
              <Actions ids={[order.id]} site={site} locale={locale} />
            )}
            <Link className="dish-back-link" href={menuHref}>
              <ArrowLeft size={16} aria-hidden="true" />
              {strings.backToMenu}
            </Link>
            {hasDetails && (
              <section className="dish-page-description">
                <h2>{strings.aboutDish}</h2>
                <div lang={text.locale}>
                  {text.detailsDocument ? (
                    <RichText document={text.detailsDocument} site={site} />
                  ) : (
                    text.details
                      .split(/\n\s*\n/)
                      .filter((paragraph: string) => paragraph.trim())
                      .map((paragraph: string, index: number) => (
                        <p key={index}>{paragraph}</p>
                      ))
                  )}
                </div>
              </section>
            )}
            {(["DIETARY"] as const).map((kind) => {
              const tags = (item.tags || []).filter(
                ({ tag }: any) => tag.kind === kind,
              );
              return (
                tags.length > 0 && (
                  <section className="dish-page-tags" key={kind}>
                    <h2>{strings.dietary}</h2>
                    <ul className="dietary-tags">
                      {tags.map(({ tag }: any) => {
                        const translated = dishText(
                          tag,
                          locale,
                          site.defaultLocale,
                        );
                        return (
                          <li key={tag.id} lang={translated?.locale}>
                            {translated?.name}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )
              );
            })}
            <AllergenPanel
              tags={(item.tags || []).filter(
                ({ tag }: any) => tag.kind === "ALLERGEN",
              )}
              site={site}
              locale={locale}
              strings={strings}
            />
          </div>
        </div>
        {related.length > 0 && (
          <section className="dish-related">
            <h2>{strings.relatedDishes}</h2>
            <div className="menu-dishes">
              {related.map((dish) => (
                <MenuItemCard
                  key={dish.id}
                  item={{
                    ...dish,
                    detailHref:
                      (site.previewBase || "") +
                      dishPath(dish.slug, locale, site.defaultLocale),
                  }}
                  image={asset(site, dish.imageId)}
                  locale={locale}
                  defaultLocale={site.defaultLocale}
                  strings={strings}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </SiteLayout>
  );
}
