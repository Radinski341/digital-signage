import Link from "next/link";
import MenuItemPage from "@/components/public/MenuItemPage";
import { dishMetadata } from "@/server/menu-items";
import { dishPath, dishText } from "@/modules/menu-items";
import { Metadata } from "next";
import {
  notFound,
  permanentRedirect,
  redirect as temporaryRedirect,
} from "next/navigation";
import { db } from "@/server/db";
import {
  getSite,
  getPublicContent,
  getLivePages,
  origin,
  pagePath,
  restaurantStructuredData,
  dictionary,
} from "@/server/public";
import SiteLayout from "@/components/public/SiteLayout";
import Sections, { PublicMenu } from "@/components/sections/renderers";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ path?: string[] }> };
async function resolve(params: Props["params"]) {
  const siteRecord = await getSite();
  if (!siteRecord) return null;
  const site = await getPublicContent(siteRecord.id);
  if (!site) return null;
  const parts = [...((await params).path ?? [])];
  let locale = site.defaultLocale;
  if (site.locales.some((l) => l.code === parts[0])) {
    locale = parts.shift()!;
    if (locale === site.defaultLocale) permanentRedirect("/" + parts.join("/"));
  }
  if (parts.length === 2 && parts[0] === "dishes") {
    const item = site.items.find((dish) => dish.slug === parts[1]);
    if (!item || !dishText(item, locale, site.defaultLocale)?.name) {
      const fromPath = dishPath(parts[1], locale, site.defaultLocale);
      const redirect = await db.redirect.findUnique({
        where: { siteId_fromPath: { siteId: site.id, fromPath } },
      });
      if (redirect) permanentRedirect(redirect.toPath);
      notFound();
    }
    return { site, locale, item, pages: await getLivePages(site.id) };
  }
  if (parts.length > 1) notFound();
  const slug = parts[0] ?? "";
  const pages = await getLivePages(site.id);
  const page = pages.find((p) =>
    p.translations.some((t) => t.locale === locale && t.publishedSlug === slug),
  );
  const translation = page?.translations.find(
    (t) => t.locale === locale && t.publishedSlug === slug,
  );
  if (!page || !translation?.snapshot) {
    const path = pagePath(slug, locale, site.defaultLocale);
    const redirect = await db.redirect.findUnique({
      where: { siteId_fromPath: { siteId: site.id, fromPath: path } },
    });
    if (redirect) permanentRedirect(redirect.toPath);
    if (locale !== site.defaultLocale) {
      const fallbackPage = pages.find((p) =>
        p.translations.some(
          (t) => t.locale === site.defaultLocale && t.publishedSlug === slug,
        ),
      );
      const target =
        fallbackPage?.translations.find((t) => t.locale === locale) ??
        fallbackPage?.translations.find((t) => t.locale === site.defaultLocale);
      if (target)
        temporaryRedirect(
          pagePath(target.publishedSlug!, target.locale, site.defaultLocale),
        );
    }
    if (!slug) return { site, locale, page: null, snapshot: null, pages };
    notFound();
  }
  return { site, locale, page, snapshot: translation.snapshot as any, pages };
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await resolve(params);
  if (resolved && "item" in resolved && resolved.item)
    return dishMetadata(resolved.site, resolved.item, resolved.locale);
  if (!resolved?.snapshot)
    return {
      title: resolved?.site.name || "Restaurant",
      robots: { index: false, follow: false },
    };
  const { site, locale, page, snapshot } = resolved;
  const t = snapshot.translation;
  const url = new URL(
    pagePath(t.slug, locale, site.defaultLocale),
    origin(site),
  ).href;
  const languages = Object.fromEntries(
    page!.translations
      .filter(
        (v: any) =>
          !(v.snapshot as any)?.translation?.noIndex &&
          site.locales.some((l) => l.code === v.locale),
      )
      .map((v) => [
        v.locale,
        new URL(
          pagePath(v.publishedSlug!, v.locale, site.defaultLocale),
          origin(site),
        ).href,
      ]),
  );
  const image = site.media.find(
    (m) => m.id === (t.socialImageId || site.branding?.socialImageId),
  );
  const title = t.seoTitle || `${t.title} | ${site.name}`;
  const description =
    t.seoDescription ||
    site.profile?.translations.find((p: any) => p.locale === locale)?.summary ||
    site.profile?.translations.find((p: any) => p.locale === site.defaultLocale)
      ?.summary ||
    undefined;
  return {
    metadataBase: new URL(origin(site)),
    title,
    description,
    icons: site.branding?.faviconId
      ? { icon: site.media.find((m) => m.id === site.branding.faviconId)?.url }
      : undefined,
    robots: { index: !t.noIndex, follow: !t.noIndex },
    alternates: { canonical: t.canonicalUrl || url, languages },
    openGraph: {
      title: t.ogTitle || title,
      description: t.ogDescription || description,
      url,
      locale,
      images: image ? [{ url: image.url, alt: image.alt }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image.url] : [],
    },
  };
}
export default async function RestaurantPage({ params }: Props) {
  const resolved = await resolve(params);
  if (!resolved)
    return (
      <main className="setup-message">
        <h1>Restaurant website</h1>
        <p>This website is being prepared.</p>
        <Link href="/admin/login">Staff sign in</Link>
      </main>
    );
  if ("item" in resolved && resolved.item)
    return (
      <MenuItemPage
        site={resolved.site}
        item={resolved.item}
        locale={resolved.locale}
        pages={resolved.pages}
      />
    );
  const { site, locale, page, snapshot } = resolved;
  if (!page || !snapshot)
    return (
      <SiteLayout site={site} locale={locale}>
        <div className="public-section">
          <h1>{site.name}</h1>
          <p>This website is being prepared.</p>
        </div>
      </SiteLayout>
    );
  const menuPage = resolved.pages.find((p) => p.type === "MENU");
  const menuTranslation = menuPage?.translations.find(
    (t) => t.locale === locale,
  );
  const schema = {
    ...restaurantStructuredData(site, locale),
    ...(menuTranslation
      ? {
          hasMenu: new URL(
            pagePath(
              menuTranslation.publishedSlug!,
              locale,
              site.defaultLocale,
            ),
            origin(site),
          ).href,
        }
      : {}),
  };
  const languagePaths = Object.fromEntries(
    page.translations.map((t) => [
      t.locale,
      pagePath(t.publishedSlug!, t.locale, site.defaultLocale),
    ]),
  );
  const hero = snapshot.sections.some(
    (s: any) => s.type === "HERO" && !s.hidden,
  );
  return (
    <SiteLayout site={site} locale={locale} languagePaths={languagePaths}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
        }}
      />
      {(!hero || page.type === "HOME") && (
        <div
          className={
            page.type === "HOME" ? "sr-only" : "public-section page-intro"
          }
        >
          {page.type !== "HOME" && (
            <nav
              className="public-breadcrumbs"
              aria-label={dictionary(site, locale).breadcrumbs}
            >
              <Link href={pagePath("", locale, site.defaultLocale)}>
                {dictionary(site, locale).home}
              </Link>
              <span aria-hidden="true">›</span>
              <span aria-current="page">{snapshot.translation.title}</span>
            </nav>
          )}
          {page.type !== "MENU" && <h1>{snapshot.translation.title}</h1>}
        </div>
      )}
      <div
        className={
          ["MENU", "HOME"].includes(page.type) ? "menu-page" : undefined
        }
      >
        {page.type === "HOME" && <PublicMenu site={site} locale={locale} />}
        <Sections
          sections={
            page.type === "MENU"
              ? snapshot.sections.filter(
                  (section: any) => section.type !== "MENU_HIGHLIGHTS",
                )
              : snapshot.sections
          }
          site={site}
          locale={locale}
          headingProvided={!hero || page.type === "HOME"}
        />
        {page.type === "MENU" && (
          <PublicMenu
            site={site}
            locale={locale}
            layout="sidebar"
            title={snapshot.translation.title}
            headingLevel={hero ? "h2" : "h1"}
          />
        )}
      </div>
    </SiteLayout>
  );
}
