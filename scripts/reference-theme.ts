import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { applyReferenceTheme } from "../src/server/reference-theme";
loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function main() {
  const sites = await db.site.findMany({ select: { id: true }, take: 2 });
  const siteId =
    process.env.SITE_ID || (sites.length === 1 ? sites[0].id : null);
  if (!siteId)
    throw new Error("Set SITE_ID when more than one restaurant exists.");
  console.log(JSON.stringify(await applyReferenceTheme(db, siteId)));
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Theme setup failed.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
