import { MetadataRoute } from "next";
import { getSite, getPublicContent, origin } from "@/server/public";
export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> {
  const record = await getSite();
  const site = record ? await getPublicContent(record.id) : null;
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api",
        "/preview",
        "/banner",
        "/slide",
        "/settings",
      ],
    },
    ...(site ? { sitemap: origin(site) + "/sitemap.xml" } : {}),
  };
}
