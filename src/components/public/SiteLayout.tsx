import { CSSProperties, ReactNode } from "react";
import {
  PublicContent,
  asset,
  localized,
  sitePagePath,
  dictionary,
  actionLink,
} from "@/server/public";
import { Globe, Phone, Search, ArrowUpRight } from "lucide-react";
import "@fontsource-variable/montserrat/wght.css";
import "@/app/catalog.css";
import { ContactDetails, OpeningHours } from "./RestaurantDetails";
import MobileNavigation from "./MobileNavigation";
import { contrastText, colorContrast } from "@/modules/security";
export default function SiteLayout({
  site,
  locale,
  children,
  languagePaths = {},
}: {
  site: PublicContent;
  locale: string;
  children: ReactNode;
  languagePaths?: Record<string, string>;
}) {
  const brand = site.branding;
  const text = dictionary(site, locale);
  const profile = localized(
    site.profile?.translations ?? [],
    locale,
    site,
  ) as any;
  const logo = asset(site, brand?.logoId);
  const links = (key: string) => {
    const items = site.navigation.find((n) => n.key === key)?.items ?? [];
    const nodes = items.flatMap((i: any) => {
      const translation = localized(i.translations, locale, site) as any;
      const page =
        i.page?.translations.find(
          (t: any) => t.locale === locale && t.publishedRevisionId,
        ) ??
        i.page?.translations.find(
          (t: any) => t.locale === site.defaultLocale && t.publishedRevisionId,
        );
      const href = i.pageId
        ? page
          ? sitePagePath(page.publishedSlug, page.locale, site)
          : null
        : i.url;
      return href && translation
        ? [{ id: i.id, parentId: i.parentId, href, label: translation.label }]
        : [];
    });
    return nodes
      .filter((i: any) => !i.parentId)
      .map((i: any) => ({
        ...i,
        children: nodes.filter((c: any) => c.parentId === i.id),
      }));
  };
  const flatten = (items: any[]) => items.flatMap((i) => [i, ...i.children]);
  const header = links("header");
  const order = site.actions.find(
    (a) => a.type === "ORDERING" && actionLink(a, site, locale),
  );
  const orderLabel = localized(order?.translations ?? [], locale, site) as any;
  const font = (name?: string) =>
    name === "serif"
      ? "Georgia, serif"
      : name === "system"
        ? "system-ui, sans-serif"
        : '"Montserrat Variable", system-ui, sans-serif';
  const company = flatten(links("footer"));
  const information = flatten(links("footer-info"));
  const primaryLocation = site.locations[0];
  let todayHours = "";
  if (primaryLocation && site.timeZone) {
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: site.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const exception = primaryLocation.exceptions.find(
      (row: any) => row.date === date,
    );
    const weekday = new Date(date + "T00:00:00Z").getUTCDay();
    const intervals = exception
      ? exception.closed
        ? []
        : exception.intervals
      : primaryLocation.hours.filter((row: any) => row.weekday === weekday);
    todayHours = intervals.length
      ? intervals
          .map(
            (row: any) =>
              `${row.opens}–${row.closes}${row.nextDay ? " (+1)" : ""}`,
          )
          .join(", ")
      : text.closed;
  }
  const tokens = {
    "--brand": brand?.primaryColor,
    "--brand-foreground": contrastText(brand?.primaryColor || "#282828"),
    "--public-link":
      Math.min(
        colorContrast(
          brand?.primaryColor || "#282828",
          brand?.backgroundColor || "#ffffff",
        ),
        colorContrast(
          brand?.primaryColor || "#282828",
          brand?.surfaceColor || "#ffffff",
        ),
      ) >= 4.5
        ? brand?.primaryColor
        : brand?.textColor,
    "--accent": brand?.accentColor,
    "--public-text": brand?.textColor,
    "--public-bg": brand?.backgroundColor,
    "--public-surface": brand?.surfaceColor,
    "--public-radius": `${brand?.radius ?? 12}px`,
    "--heading-font": font(brand?.headingFont),
    "--body-font": font(brand?.bodyFont),
  } as CSSProperties;
  return (
    <div
      className="public-site"
      style={tokens}
      dir={site.locales.find((l) => l.code === locale)?.direction || "ltr"}
      lang={locale}
    >
      <a href="#main-content" className="skip-link">
        {text.skip}
      </a>
      <header className="public-header">
        <div className="public-header-inner">
          <a className="restaurant-brand" href={sitePagePath("", locale, site)}>
            {logo ? (
              <img
                src={logo.url}
                alt={profile?.name || site.name}
                width={160}
                height={64}
              />
            ) : (
              profile?.name || site.name
            )}
          </a>
          <nav className="desktop-navigation" aria-label={text.navigation}>
            {header.map((l: any) =>
              l.children.length ? (
                <details key={l.id} className="public-submenu">
                  <summary>{l.label}</summary>
                  <div>
                    <a href={l.href}>{l.label}</a>
                    {l.children.map((c: any) => (
                      <a key={c.id} href={c.href}>
                        {c.label}
                      </a>
                    ))}
                  </div>
                </details>
              ) : (
                <a key={l.id} href={l.href}>
                  {l.label}
                </a>
              ),
            )}
          </nav>
          <div className="header-actions">
            {order && (
              <a
                href={actionLink(order, site, locale)!}
                className="public-button primary"
              >
                {orderLabel?.label || text.order}
              </a>
            )}
            {site.profile?.phone && (
              <div className="header-phone">
                <a href={"tel:" + site.profile.phone.replace(/[ ()]/g, "")}>
                  {site.profile.phone}
                </a>
                {todayHours && (
                  <small>
                    {text.today}: {todayHours}
                  </small>
                )}
              </div>
            )}
            <a
              className="public-icon-button header-search"
              href={sitePagePath("", locale, site) + "#menu-search"}
              aria-label={text.search}
            >
              <Search size={21} />
            </a>
            {site.locales.length > 1 && (
              <details className="public-language-picker">
                <summary
                  className="public-icon-button"
                  aria-label={text.languages}
                >
                  <Globe size={20} />
                </summary>
                <nav className="locale-switch" aria-label={text.languages}>
                  {site.locales.map((language) => (
                    <a
                      key={language.code}
                      href={
                        languagePaths[language.code] ||
                        sitePagePath("", language.code, site)
                      }
                      hrefLang={language.code}
                      aria-current={
                        language.code === locale ? "true" : undefined
                      }
                    >
                      {language.label}
                    </a>
                  ))}
                </nav>
              </details>
            )}
            <MobileNavigation
              links={
                order
                  ? [
                      ...flatten(header),
                      {
                        href: actionLink(order, site, locale)!,
                        label: orderLabel?.label || text.order,
                      },
                    ]
                  : flatten(header)
              }
              label={text.navigation}
              closeLabel={text.close}
            />
          </div>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="public-footer">
        <div className="public-footer-grid">
          <div className="footer-identity">
            <a className="footer-brand" href={sitePagePath("", locale, site)}>
              {logo ? (
                <img
                  src={logo.url}
                  alt={profile?.name || site.name}
                  width={112}
                  height={112}
                />
              ) : (
                <strong>{profile?.name || site.name}</strong>
              )}
            </a>
            {profile?.summary && <p>{profile.summary}</p>}
          </div>
          {company.length > 0 && (
            <nav aria-label={text.company}>
              <h2>{text.company}</h2>
              {company.map((link: any) => (
                <a key={link.id} href={link.href}>
                  {link.label}
                </a>
              ))}
            </nav>
          )}
          {information.length > 0 && (
            <nav aria-label={text.information}>
              <h2>{text.information}</h2>
              {information.map((link: any) => (
                <a key={link.id} href={link.href}>
                  {link.label}
                </a>
              ))}
            </nav>
          )}
          <div className="footer-contact">
            <h2>{text.stayConnected}</h2>
            {site.profile?.phone && (
              <a href={"tel:" + site.profile.phone.replace(/[ ()]/g, "")}>
                <Phone size={19} aria-hidden="true" />
                {site.profile.phone}
              </a>
            )}
            {site.profile?.socials.map((social: any) => (
              <a key={social.id} href={social.url} rel="noopener noreferrer">
                <ArrowUpRight size={19} aria-hidden="true" />
                {social.label}
              </a>
            ))}
            <details>
              <summary>{text.contact}</summary>
              <ContactDetails site={site} locale={locale} />
            </details>
            {primaryLocation && (
              <details>
                <summary>{text.openingHours}</summary>
                <OpeningHours site={site} locale={locale} />
              </details>
            )}
          </div>
          <small>
            © {new Date().getFullYear()} {profile?.name || site.name}
          </small>
        </div>
      </footer>
    </div>
  );
}
