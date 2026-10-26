import { headers } from "next/headers";
import { getSite, getPublicContent } from "@/server/public";
import "./globals.css";
export const metadata = { title: { default: "Restaurant", template: "%s" } };
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = (await headers()).get("x-public-path");
  let locale = "en";
  let direction = "ltr";
  if (path) {
    const record = await getSite();
    if (record) {
      const site = await getPublicContent(record.id);
      if (site) {
        const prefix = path.split("/")[1];
        locale = site.locales.some((l) => l.code === prefix)
          ? prefix
          : site.defaultLocale;
        direction =
          site.locales.find((l) => l.code === locale)?.direction || "ltr";
      }
    }
  }
  return (
    <html lang={locale} dir={direction}>
      <body>{children}</body>
    </html>
  );
}
