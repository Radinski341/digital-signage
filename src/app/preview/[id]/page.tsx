import { AppError } from "@/server/errors";
import { notFound, redirect } from "next/navigation";
import { requireAccess } from "@/server/access";
import { db } from "@/server/db";
import { getPublicContent } from "@/server/public";
import SiteLayout from "@/components/public/SiteLayout";
import Sections, { PublicMenu } from "@/components/sections/renderers";
export const dynamic = "force-dynamic";
export default async function Preview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  let access;
  try {
    access = await requireAccess();
  } catch (error) {
    if (error instanceof AppError && error.status === 401)
      redirect("/admin/login");
    throw error;
  }
  const { siteId, site } = access;
  const { id } = await params;
  const locale = (await searchParams).locale || site.defaultLocale;
  const page = await db.page.findFirst({
    where: { id, siteId },
    include: {
      translations: true,
      sections: {
        include: { translations: true },
        orderBy: { position: "asc" },
      },
    },
  });
  const data = await getPublicContent(siteId, true);
  if (!page || !data) notFound();
  const translation =
    page.translations.find((t) => t.locale === locale) ||
    page.translations.find((t) => t.locale === site.defaultLocale);
  return (
    <div className="preview-panel">
      <div className="admin-notice">
        Private draft preview · Save the draft to update this preview.
      </div>
      <SiteLayout site={data} locale={locale}>
        {(page.type === "HOME" ||
          !page.sections.some((s) => s.type === "HERO" && !s.hidden)) && (
          <div
            className={
              page.type === "HOME" ? "sr-only" : "public-section page-intro"
            }
          >
            <h1>{translation?.title}</h1>
          </div>
        )}
        <div
          className={
            ["MENU", "HOME"].includes(page.type) ? "menu-page" : undefined
          }
        >
          {page.type === "HOME" && <PublicMenu site={data} locale={locale} />}
          <Sections
            sections={page.sections}
            site={data}
            locale={locale}
            headingProvided={
              page.type === "HOME" ||
              !page.sections.some((s) => s.type === "HERO" && !s.hidden)
            }
          />
          {page.type === "MENU" && <PublicMenu site={data} locale={locale} />}
        </div>
      </SiteLayout>
    </div>
  );
}
