"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { List, Search, X } from "lucide-react";
import { localize } from "@/modules/formatting";
import MenuItemCard from "./MenuItemCard";
import { CategoryNavigation } from "./CategoryNavigation";
type Props = {
  items: any[];
  categories: any[];
  media: any[];
  locale: string;
  defaultLocale: string;
  strings: Record<string, string>;
  compact?: boolean;
  layout?: "catalog" | "sidebar";
  title?: string;
  headingLevel?: "h1" | "h2";
};
export default function Menu({
  items,
  categories,
  media,
  locale,
  defaultLocale,
  strings,
  compact = false,
  layout = "catalog",
  title,
  headingLevel: Heading = "h2",
}: Props) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [active, setActive] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const menuRoot = useRef<HTMLDivElement>(null);
  const translate = (rows: any[]) =>
    localize(rows, locale, defaultLocale) as any;
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const t = localize(item.translations, locale, defaultLocale) as any;
        return `${t?.name} ${t?.description}`
          .toLocaleLowerCase(locale)
          .includes(search.toLocaleLowerCase(locale));
      }),
    [items, search, locale, defaultLocale],
  );
  const groups = categories
    .map((category) => ({
      category,
      dishes: filtered.filter((item) => item.categoryId === category.id),
    }))
    .filter((group) => group.dishes.length);
  const categoryIds = groups.map(({ category }) => category.id).join(",");
  const priorityImages = !compact
    ? groups
        .flatMap((group) => group.dishes)
        .filter((item) => item.imageId)
        .slice(0, 4)
        .map((item) => item.id)
    : [];
  useEffect(() => {
    const nav =
      menuRoot.current?.querySelector<HTMLElement>(".menu-categories");
    const link = nav?.querySelector<HTMLElement>("a[aria-current]");
    if (!nav || !link) return;
    const bounds = nav.getBoundingClientRect(),
      target = link.getBoundingClientRect();
    if (target.left < bounds.left) nav.scrollLeft += target.left - bounds.left;
    else if (target.right > bounds.right)
      nav.scrollLeft += target.right - bounds.right;
  }, [active]);
  useEffect(() => {
    if (compact) return;
    const openSearch = () => {
      if (window.location.hash === "#menu-search") setSearchOpen(true);
    };
    openSearch();
    window.addEventListener("hashchange", openSearch);
    return () => window.removeEventListener("hashchange", openSearch);
  }, [compact]);
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);
  useEffect(() => {
    if (compact) return;
    const sections = Array.from(
      menuRoot.current?.querySelectorAll<HTMLElement>(".menu-category") ?? [],
    );
    const update = () => {
      const current =
        sections
          .filter(
            (section) =>
              section.getBoundingClientRect().top <=
              (layout === "sidebar" &&
              window.matchMedia("(min-width: 1024px)").matches
                ? 112
                : 170),
          )
          .at(-1) ?? sections[0];
      if (current) setActive(current.dataset.category || "");
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [categoryIds, compact, layout]);
  const imageFor = (item: any) =>
    media.find((asset) => asset.id === item.imageId);
  return (
    <div
      ref={menuRoot}
      className={`restaurant-menu catalog-menu ${compact ? "compact" : ""} ${layout === "sidebar" ? "sidebar-menu" : ""}`}
    >
      {layout === "sidebar" && !compact && (
        <aside className="menu-sidebar">
          <div className="menu-sidebar-heading">
            <Heading>{title || strings.menu}</Heading>
            <button
              className="public-icon-button sidebar-search-toggle"
              type="button"
              aria-label={strings.search}
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen(!searchOpen)}
            >
              <Search size={21} aria-hidden="true" />
            </button>
          </div>
          <nav className="menu-sidebar-categories" aria-label={strings.menu}>
            {groups.map(({ category }) => {
              const text = translate(category.translations);
              return (
                <a
                  key={category.id}
                  href={`#category-${category.id}`}
                  aria-current={active === category.id ? "location" : undefined}
                  lang={text?.locale}
                  onClick={() => setActive(category.id)}
                >
                  {text?.name}
                </a>
              );
            })}
          </nav>
        </aside>
      )}
      <div className="menu-results">
        {!compact && (
          <div className="catalog-toolbar">
            <CategoryNavigation strings={strings}>
              <List size={18} aria-hidden="true" />
              {groups.map(({ category }) => {
                const t = translate(category.translations);
                return (
                  <a
                    key={category.id}
                    href={`#category-${category.id}`}
                    aria-current={
                      active === category.id ? "location" : undefined
                    }
                    onClick={() => setActive(category.id)}
                    lang={t?.locale}
                  >
                    {t?.name}
                  </a>
                );
              })}
            </CategoryNavigation>
            <button
              className="public-icon-button catalog-search-toggle"
              type="button"
              aria-label={strings.search}
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen(!searchOpen)}
            >
              <Search size={21} />
            </button>
          </div>
        )}
        {!compact && (
          <div
            id="menu-search"
            className={searchOpen ? "menu-search" : "menu-search closed"}
          >
            {searchOpen && (
              <label>
                <span className="sr-only">{strings.search}</span>
                <Search size={18} aria-hidden="true" />
                <input
                  ref={searchInput}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={strings.search}
                />
                <button
                  type="button"
                  className="public-icon-button"
                  aria-label={strings.close}
                  onClick={() => {
                    setSearch("");
                    setSearchOpen(false);
                  }}
                >
                  <X size={18} />
                </button>
              </label>
            )}
          </div>
        )}
        <div aria-live="polite" className="sr-only">
          {search ? `${filtered.length}` : ""}
        </div>
        {!filtered.length && (
          <p className="catalog-empty">{strings.noResults}</p>
        )}
        {groups.map(({ category, dishes }) => {
          const title = translate(category.translations);
          return (
            <section
              id={compact ? undefined : `category-${category.id}`}
              data-category={category.id}
              key={category.id}
              className="menu-category"
            >
              <header className="menu-category-heading">
                <h2 lang={title?.locale}>
                  <span>{title?.name}</span>
                </h2>
                {title?.description && (
                  <p className="category-description" lang={title.locale}>
                    {title.description}
                  </p>
                )}
              </header>
              <div className="menu-dishes">
                {dishes.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    image={imageFor(item)}
                    locale={locale}
                    defaultLocale={defaultLocale}
                    strings={strings}
                    priority={priorityImages.includes(item.id)}
                    first={priorityImages[0] === item.id}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
