import { notFound } from "next/navigation";
import BannerRenderer from "@/components/BannerRenderer";
import { renderBannerData } from "@/server/signage-rendering";
import { requireAccess } from "@/server/access";
import { db as prisma } from "@/server/db";

export const revalidate = 0;

export default async function BannerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ draft?: string }>;
}) {
  const banner = await prisma.banner.findUnique({
    where: { id: (await params).id },
    include: { template: { include: { fields: true } } },
  });

  const draft = Boolean((await searchParams).draft);
  if (!banner || (!draft && banner.status !== "PUBLISHED")) notFound();
  if (draft && (await requireAccess()).siteId !== banner.siteId) notFound();

  // Sign all IMAGE fields before render
  const signedData = await renderBannerData(banner, !draft);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <BannerRenderer
        templateKey={banner.template.key}
        data={signedData}
        fields={banner.template.fields}
      />
    </div>
  );
}

export const metadata = { robots: { index: false, follow: false } };
