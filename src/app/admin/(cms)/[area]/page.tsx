import { notFound } from "next/navigation";
import { schemas, Resource } from "@/modules/cms";
import { requireAccess } from "@/server/access";
import { listResource, permission } from "@/server/cms";
import { adminContext } from "@/server/admin-context";
import ResourceWorkbench from "@/components/admin/ResourceWorkbench";
import MediaLibrary from "@/components/admin/MediaLibrary";
export default async function ContentArea({
  params,
}: {
  params: Promise<{ area: string }>;
}) {
  const { area } = await params;
  const name = area === "menu" ? "items" : area;
  if (name === "media") {
    await requireAccess();
    return <MediaLibrary />;
  }
  if (!Object.hasOwn(schemas, name)) notFound();
  const resource = name as Resource;
  const access = await requireAccess(permission(resource));
  const [rows, context] = await Promise.all([
    listResource(access, resource),
    adminContext(access),
  ]);
  return (
    <ResourceWorkbench
      resource={resource}
      initialRows={JSON.parse(JSON.stringify(rows))}
      context={context}
    />
  );
}
