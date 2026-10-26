import { dishPath } from "@/modules/menu-items";
import { ReactNode } from "react";
import { asset, localized, dictionary, PublicContent } from "@/server/public";
import {
  sectionDefinitions,
  sectionContentSchema,
} from "@/modules/sections/schema";
import RichText from "@/components/public/RichText";
import Actions from "@/components/public/Actions";
import {
  ContactDetails,
  OpeningHours,
} from "@/components/public/RestaurantDetails";
import Menu from "@/components/public/Menu";
import Locations from "@/components/public/Locations";
import { safeHref } from "@/modules/security";
type Props = {
  config: any;
  content: any;
  site: PublicContent;
  locale: string;
  heroLevel?: "h1" | "h2";
};
function Image({
  id,
  site,
  alt,
  priority = false,
}: {
  id?: string;
  site: PublicContent;
  alt?: string;
  priority?: boolean;
}) {
  const image = asset(site, id);
  return image ? (
    <img
      src={image.url}
      alt={alt || image.alt}
      width={image.width}
      height={image.height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
    />
  ) : null;
}
function Hero({ config, content, site, locale, heroLevel = "h1" }: Props) {
  const Heading = heroLevel;
  return (
    <section
      className={`public-hero ${config.variant} overlay-${config.overlay} align-${config.align}`}
    >
      <Image id={config.imageId} site={site} alt={content.alt} priority />
      <div className="hero-copy">
        <p className="eyebrow">
          {(localized(site.profile?.translations ?? [], locale, site) as any)
            ?.name || site.name}
        </p>
        <Heading>{content.heading}</Heading>
        {content.subtitle && (
          <p className="hero-subtitle">{content.subtitle}</p>
        )}
        <Actions ids={config.actionIds} site={site} locale={locale} />
      </div>
    </section>
  );
}
function Text({ config, content, site }: Props) {
  return (
    <section className={`public-section text-section ${config.width}`}>
      {content.heading && <h2>{content.heading}</h2>}
      <RichText document={content.body} site={site} />
    </section>
  );
}
function ImageText({ config, content, site, locale }: Props) {
  return (
    <section className={`public-section image-text ${config.placement}`}>
      <Image id={config.imageId} site={site} alt={content.alt} />
      <div>
        {content.heading && <h2>{content.heading}</h2>}
        {content.subtitle && <p>{content.subtitle}</p>}
        <RichText document={content.body} site={site} />
        <Actions ids={config.actionIds} site={site} locale={locale} />
      </div>
    </section>
  );
}
function StandaloneImage({ config, content, site }: Props) {
  return (
    <figure className="public-section standalone-image">
      <Image id={config.imageId} site={site} alt={content.alt} />
      {content.caption && <figcaption>{content.caption}</figcaption>}
    </figure>
  );
}
function Gallery({ config, content, site }: Props) {
  return (
    <section className="public-section">
      {content.heading && <h2>{content.heading}</h2>}
      <div
        className={`public-gallery ${config.variant}`}
        role={config.variant === "carousel" ? "region" : undefined}
        tabIndex={config.variant === "carousel" ? 0 : undefined}
        aria-label={
          config.variant === "carousel"
            ? content.heading || "Gallery"
            : undefined
        }
      >
        {config.imageIds.map((id: string) => (
          <figure key={id}>
            <Image id={id} site={site} alt={asset(site, id)?.alt} />
            {asset(site, id)?.caption && (
              <figcaption>{asset(site, id)?.caption}</figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}
function CTA({ config, content, site, locale }: Props) {
  return (
    <section className="public-section public-cta">
      {content.heading && <h2>{content.heading}</h2>}
      {content.subtitle && <p>{content.subtitle}</p>}
      <Actions ids={config.actionIds} site={site} locale={locale} />
    </section>
  );
}
function Highlights({ config, content, site, locale }: Props) {
  const items = site.items
    .filter((i) =>
      config.itemIds.length
        ? config.itemIds.includes(i.id)
        : config.categoryIds.length
          ? config.categoryIds.includes(i.categoryId)
          : i.featured,
    )
    .slice(0, config.limit);
  const categories = site.categories.filter((c) =>
    items.some((i) => i.categoryId === c.id),
  );
  return (
    <section className="public-section highlights">
      {content.heading && <h2>{content.heading}</h2>}
      <Menu
        compact
        items={items.map((item) => menuItemDTO(item, site, locale))}
        categories={menuCategoryDTO(categories)}
        media={menuMediaDTO(site, items)}
        locale={locale}
        defaultLocale={site.defaultLocale}
        strings={dictionary(site, locale)}
      />
    </section>
  );
}
function Hours({ config, content, site, locale }: Props) {
  return (
    <section className="public-section details-section">
      {content.heading && <h2>{content.heading}</h2>}
      <OpeningHours
        site={site}
        locale={locale}
        locationId={config.locationId}
      />
    </section>
  );
}
function Contact({ config, content, site, locale }: Props) {
  return (
    <section className="public-section details-section">
      {content.heading && <h2>{content.heading}</h2>}
      <ContactDetails
        site={site}
        locale={locale}
        locationId={config.locationId}
      />
    </section>
  );
}
function LocationsSection({ config, content, site, locale }: Props) {
  const locations = (
    config.locationId
      ? site.locations.filter((location) => location.id === config.locationId)
      : site.locations
  ).map((location) => ({
    id: location.id,
    name: location.name,
    address: location.address,
    city: location.city,
    postalCode: location.postalCode,
    country: location.country,
    directionsUrl: safeHref(location.directionsUrl),
    latitude: location.latitude == null ? null : Number(location.latitude),
    longitude: location.longitude == null ? null : Number(location.longitude),
  }));
  return (
    <section className="public-section locations-section">
      {content.heading && <h2>{content.heading}</h2>}
      <Locations
        locations={locations}
        strings={dictionary(site, locale)}
        locale={locale}
      />
    </section>
  );
}
function Social({ content, site }: Props) {
  return (
    <section className="public-section">
      {content.heading && <h2>{content.heading}</h2>}
      <div className="social-links">
        {site.profile?.socials.map((s: any) =>
          safeHref(s.url) ? (
            <a
              key={s.id}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {s.label} ↗
            </a>
          ) : null,
        )}
      </div>
    </section>
  );
}
function Divider({ config }: Props) {
  return (
    <div className={`public-divider ${config.size}`}>
      {config.line && <hr />}
    </div>
  );
}
const registry: Record<string, (props: Props) => ReactNode> = {
  HERO: Hero,
  RICH_TEXT: Text,
  IMAGE_TEXT: ImageText,
  IMAGE: StandaloneImage,
  GALLERY: Gallery,
  CTA,
  MENU_HIGHLIGHTS: Highlights,
  OPENING_HOURS: Hours,
  CONTACT: Contact,
  LOCATIONS: LocationsSection,
  SOCIAL_LINKS: Social,
  DIVIDER: Divider,
};
export default function Sections({
  sections,
  site,
  locale,
  headingProvided = false,
}: {
  sections: any[];
  site: PublicContent;
  locale: string;
  headingProvided?: boolean;
}) {
  let heroUsed = headingProvided;
  return (
    <>
      {sections.map((section) => {
        if (section.hidden) return null;
        const definition =
          sectionDefinitions[section.type as keyof typeof sectionDefinitions];
        const Renderer = registry[section.type];
        if (!definition || !Renderer) return null;
        const parsed = definition.schema.safeParse(section.config);
        const translation = localized(
          section.translations ?? [],
          locale,
          site,
        ) as any;
        const content = sectionContentSchema.safeParse(
          translation?.content ?? {},
        );
        if (!parsed.success || !content.success) return null;
        const heroLevel = heroUsed ? "h2" : "h1";
        if (section.type === "HERO") heroUsed = true;
        return (
          <div key={section.id} lang={translation?.locale}>
            <Renderer
              config={parsed.data}
              content={content.data}
              site={site}
              locale={locale}
              heroLevel={heroLevel}
            />
          </div>
        );
      })}
    </>
  );
}
function menuItemDTO(item: any, site: PublicContent, locale: string) {
  return {
    id: item.id,
    categoryId: item.categoryId,
    detailHref:
      (site.previewBase || "") +
      dishPath(item.slug, locale, site.defaultLocale),
    imageId: item.imageId,
    price: item.price,
    currency: item.currency,
    available: item.available,
    translations: item.translations.map((translation: any) => ({
      locale: translation.locale,
      name: translation.name,
      description: translation.description,
    })),
  };
}

function menuCategoryDTO(categories: any[]) {
  return categories.map((category) => ({
    id: category.id,
    translations: category.translations.map((translation: any) => ({
      locale: translation.locale,
      name: translation.name,
      description: translation.description,
    })),
  }));
}
function menuMediaDTO(site: PublicContent, items: any[]) {
  const used = new Set(items.map((item) => item.imageId));
  return site.media
    .filter((media) => used.has(media.id))
    .map((media) => ({
      id: media.id,
      url: media.url,
      thumbnailUrl: media.thumbnailUrl,
      width: media.width,
      height: media.height,
      alt: media.alt,
    }));
}
export function PublicMenu({
  site,
  locale,
  layout = "catalog",
  title,
  headingLevel,
}: {
  site: PublicContent;
  locale: string;
  layout?: "catalog" | "sidebar";
  title?: string;
  headingLevel?: "h1" | "h2";
}) {
  const items = site.items.map((item) => menuItemDTO(item, site, locale));
  return (
    <div className="public-section">
      <Menu
        layout={layout}
        title={title}
        headingLevel={headingLevel}
        items={items}
        categories={menuCategoryDTO(site.categories)}
        media={menuMediaDTO(site, items)}
        locale={locale}
        defaultLocale={site.defaultLocale}
        strings={dictionary(site, locale)}
      />
    </div>
  );
}
