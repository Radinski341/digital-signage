import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { includes, permission, type Access } from "@/server/cms";
import { permits } from "@/modules/security";
import {
  assertSafeDraft,
  draftIssues,
  workspaceSchemas,
  type WorkspaceResource,
} from "@/modules/ai/workspace";
export const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as any;
export const workspaceModels = {
  profile: "restaurantProfile",
  branding: "branding",
  locations: "location",
  categories: "menuCategory",
  items: "menuItem",
  tags: "menuTag",
  locales: "siteLocale",
  integrations: "orderingIntegration",
  actions: "action",
  pages: "page",
  navigation: "navigation",
  media: "mediaAsset",
  templates: "template",
  banners: "banner",
  slides: "slide",
} as const;
export function fingerprint(value: unknown): string {
  const normalize = (v: any): any =>
    Array.isArray(v)
      ? v
          .map(normalize)
          .sort((a, b) =>
            a?.position !== undefined && b?.position !== undefined
              ? a.position - b.position
              : a?.locale && b?.locale
                ? a.locale.localeCompare(b.locale)
                : a?.id && b?.id
                  ? a.id.localeCompare(b.id)
                  : 0,
          )
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, normalize(v[k])]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(normalize(json(value))))
    .digest("hex");
}
export function checkResource(access: Access, resource: WorkspaceResource) {
  const required = ["media", "templates", "banners", "slides"].includes(
    resource,
  )
    ? "content"
    : permission(resource as any);
  if (!permits(access.role, required))
    throw new AppError(403, "You cannot edit this content area.");
}
export function recordInclude(resource: WorkspaceResource): any {
  return (
    (includes as any)[resource] ||
    (resource === "templates"
      ? { fields: { orderBy: { order: "asc" } } }
      : resource === "slides"
        ? { items: { orderBy: { order: "asc" } } }
        : undefined)
  );
}
export async function getRecord(
  siteId: string,
  resource: WorkspaceResource,
  id: string,
  client: any = db,
) {
  return (client[workspaceModels[resource]] as any).findFirst({
    where: { id, siteId },
    include: recordInclude(resource),
  });
}
export function recordPayload(
  resource: WorkspaceResource,
  record: any,
  site: any,
): any {
  const value = json(record);
  if (resource === "profile")
    Object.assign(value, {
      currency: site.currency,
      timeZone: site.timeZone,
      domain: site.domain || "",
      name: site.name,
    });
  if (resource === "items")
    Object.assign(value, {
      price: String(value.price),
      variants: (value.variants || []).map((v: any) => ({
        ...v,
        price: String(v.price),
      })),
      tagIds: (value.tags || []).map((v: any) => v.tagId),
      imageIds: (value.images || []).map((v: any) => v.mediaId),
    });
  if (resource === "locales")
    value.isDefault = value.code === site.defaultLocale;
  if (resource === "locations")
    for (const key of ["latitude", "longitude"])
      if (value[key] != null) value[key] = Number(value[key]);
  if (resource === "templates")
    value.fields = value.fields.map((f: any) => ({
      ...f,
      config: f.config || {},
    }));
  if (resource === "slides")
    value.bannerIds = value.items.map((i: any) => i.bannerId);
  const parsed = workspaceSchemas[resource].safeParse(value);
  if (parsed.success) return json(parsed.data);
  // Preserve invalid legacy draft fields too, stripping protected database columns.
  const fields = Object.keys((workspaceSchemas[resource] as any).shape || {});
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => fields.includes(key)),
  );
}
export async function ownedWorkspace(
  access: Access,
  id: string,
  client: any = db,
) {
  const workspace = await client.aiWorkspace.findFirst({
    where: { id, siteId: access.siteId, ownerId: access.user.id },
    include: {
      operations: { orderBy: { createdAt: "asc" } },
      runs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!workspace) throw new AppError(404, "Website proposal not found.");
  return workspace;
}
export async function lockWorkspace(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "AiWorkspace" WHERE id=${id} FOR UPDATE`;
}
export async function workerAccess(
  workspace: any,
  sessionVersion?: number,
): Promise<Access> {
  const user = await db.user.findUnique({
    where: { id: workspace.ownerId },
    include: { memberships: { include: { site: true } } },
  });
  const membership = user?.memberships.find(
    (m) => m.siteId === workspace.siteId && !m.disabled,
  );
  if (
    !user ||
    user.disabled ||
    !membership ||
    (sessionVersion !== undefined && user.sessionVersion !== sessionVersion)
  )
    throw new AppError(
      403,
      "The initiating employee's access changed. Sign in and start a new run.",
    );
  return {
    user,
    site: membership.site,
    siteId: workspace.siteId,
    role: membership.role,
  } as Access;
}
export function safePayload(payload: unknown) {
  if (JSON.stringify(payload).length > 300000)
    throw new AppError(413, "One proposed record is too large.");
  try {
    assertSafeDraft(payload);
  } catch (e) {
    throw new AppError(422, (e as Error).message);
  }
}
export function fieldIssues(resource: WorkspaceResource, payload: unknown) {
  return draftIssues(resource, payload);
}

/** Recheck the initiating actor inside a mutation, locking against account/role revocation. */
export async function assertWorkspaceActor(
  tx: Prisma.TransactionClient,
  access: Access,
  resource?: WorkspaceResource,
): Promise<Access> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${access.user.id} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "Membership" WHERE "siteId"=${access.siteId} AND "userId"=${access.user.id} FOR SHARE`;
  const membership = await tx.membership.findUnique({
    where: { siteId_userId: { siteId: access.siteId, userId: access.user.id } },
    include: { user: true, site: true },
  });
  if (
    !membership ||
    membership.disabled ||
    membership.user.disabled ||
    membership.user.sessionVersion !== access.user.sessionVersion ||
    !permits(membership.role, "content")
  )
    throw new AppError(
      403,
      "Your access changed. Sign in again before continuing.",
    );
  const fresh = {
    ...access,
    role: membership.role,
    site: membership.site,
    user: { ...access.user, ...membership.user },
  };
  if (resource) checkResource(fresh, resource);
  return fresh;
}
