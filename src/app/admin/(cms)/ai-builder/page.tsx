import { requireAccess } from "@/server/access";
import AiWebsiteBuilder from "@/components/admin/AiWebsiteBuilder";
export default async function AiBuilderPage() {
  const access = await requireAccess();
  return <AiWebsiteBuilder defaultLocale={access.site.defaultLocale} />;
}
