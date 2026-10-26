import MenuItemPage from "@/components/public/MenuItemPage";
import { dishText } from "@/modules/menu-items";
import { AppError } from "@/server/errors";
import { notFound, redirect } from "next/navigation";
import { requireAccess } from "@/server/access";
import {
  projectWorkspace,
  proposalPagePath,
} from "@/server/ai/workspace-preview";
import SiteLayout from "@/components/public/SiteLayout";
import Sections, { PublicMenu } from "@/components/sections/renderers";
import BannerRenderer from "@/components/BannerRenderer";
import { renderBannerData } from "@/server/signage-rendering";
import "@/app/signage.css";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Private website proposal",
  robots: { index: false, follow: false },
};
export default async function SiteProposal({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; path?: string[] }>;
  searchParams: Promise<{ banner?: string; slide?: string }>;
}) {
  let access;
  try {
    access = await requireAccess();
  } catch (error) {
    if (error instanceof AppError && error.status === 401)
      redirect("/admin/login");
    throw error;
  }
  const { workspaceId, path = [] } = await params;
  const { site, pages, invalid } = await projectWorkspace(access, workspaceId);
  const query = await searchParams;
  if (query.banner || query.slide) {
    const slide = query.slide
      ? site.slides.find((s: any) => s.id === query.slide)
      : null;
    const ids = slide
      ? slide.items.map((i: any) => i.bannerId)
      : [query.banner];
    if (!ids.length) notFound();
    return (
      <div className="preview-panel">
        <p className="admin-notice">Private signage proposal · Not live</p>
        {await Promise.all(
          ids.map(async (id: string) => {
            const b = site.banners.find((b: any) => b.id === id);
            const template = site.templates.find(
              (t: any) => t.id === b?.templateId,
            );
            if (!b || !template)
              return <p key={id}>Complete this banner to preview it.</p>;
            return (
              <div
                key={id}
                style={{
                  aspectRatio: "16 / 9",
                  maxWidth: 1280,
                  margin: "24px auto",
                  containerType: "size",
                }}
              >
                <BannerRenderer
                  templateKey={template.key}
                  fields={template.fields}
                  data={await renderBannerData({ ...b, template }, false, site)}
                />
              </div>
            );
          }),
        )}
      </div>
    );
  }
  const parts = [...path];
  let locale = site.defaultLocale;
  if (site.locales.some((l: any) => l.code === parts[0]))
    locale = parts.shift()!;
  if (parts.length === 2 && parts[0] === "dishes") {
    const item = site.items.find((dish: any) => dish.slug === parts[1]);
    if (!item || !dishText(item, locale, site.defaultLocale)?.name) notFound();
    return (
      <div className="preview-panel">
        <p className="admin-notice">Private dish proposal · Not live</p>
        <MenuItemPage
          site={site}
          item={item}
          locale={locale}
          pages={pages}
          preview
        />
      </div>
    );
  }
  if (parts.length > 1) notFound();
  const slug = parts[0] || "";
  const page = pages.find((p) =>
    p.translations.some((t: any) => t.locale === locale && t.slug === slug),
  );
  const translation = page?.translations.find(
    (t: any) => t.locale === locale && t.slug === slug,
  );
  if (!page || !translation) {
    if (slug) notFound();
    return (
      <div className="preview-panel">
        <p className="admin-notice">
          Private website proposal · Complete a Home page to preview the
          homepage.
        </p>
        <SiteLayout site={site} locale={locale}>
          <div className="public-section">
            <h1>{site.name}</h1>
            <PublicMenu site={site} locale={locale} />
          </div>
        </SiteLayout>
      </div>
    );
  }
  const sections = translation.sections || [];
  const hero = sections.some((s: any) => s.type === "HERO" && !s.hidden);
  return (
    <div className="preview-panel">
      <p className="admin-notice">
        Private website proposal · Not live
        {invalid.length
          ? ` · ${invalid.length} incomplete records are shown in the review editor`
          : ""}
      </p>
      <SiteLayout
        site={site}
        locale={locale}
        languagePaths={Object.fromEntries(
          page.translations.map((t: any) => [
            t.locale,
            proposalPagePath(site, page, t.locale),
          ]),
        )}
      >
        {(!hero || page.type === "HOME") && (
          <div
            className={
              page.type === "HOME" ? "sr-only" : "public-section page-intro"
            }
          >
            {page.type !== "MENU" && <h1>{translation.title}</h1>}
          </div>
        )}
        <div
          className={
            ["HOME", "MENU"].includes(page.type) ? "menu-page" : undefined
          }
        >
          {page.type === "HOME" && <PublicMenu site={site} locale={locale} />}
          <Sections
            sections={
              page.type === "MENU"
                ? sections.filter(
                    (section: any) => section.type !== "MENU_HIGHLIGHTS",
                  )
                : sections
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
              title={translation.title}
              headingLevel={hero ? "h2" : "h1"}
            />
          )}
        </div>
      </SiteLayout>
    </div>
  );
}
