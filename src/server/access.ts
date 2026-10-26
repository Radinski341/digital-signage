import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "./db";
import { AppError } from "./errors";
import { permits, Permission } from "@/modules/security";
export async function requireAccess(
  permission: Permission = "content",
  request?: Request,
) {
  if (request && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const expected = process.env.NEXTAUTH_URL;
    if (!origin || !expected || origin !== new URL(expected).origin)
      throw new AppError(403, "Request origin is not allowed.");
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new AppError(403, "Cross-site request rejected.");
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new AppError(401, "Please sign in.");
  const user = await db.user.findUnique({
    where: { email: session.user.email },
    include: {
      memberships: { include: { site: true }, orderBy: { id: "asc" } },
    },
  });
  if (!user || user.disabled || session.sessionVersion !== user.sessionVersion)
    throw new AppError(401, "Please sign in again.");
  const membership = process.env.SITE_ID
    ? user.memberships.find(
        (m) => m.siteId === process.env.SITE_ID && !m.disabled,
      )
    : user.memberships.filter((m) => !m.disabled).length === 1
      ? user.memberships.find((m) => !m.disabled)
      : undefined;
  if (!membership || !permits(membership.role, permission))
    throw new AppError(403, "You do not have permission for this action.");
  return {
    user,
    site: membership.site,
    siteId: membership.siteId,
    role: membership.role,
  };
}
export async function publicSite() {
  if (process.env.SITE_ID)
    return db.site.findUnique({ where: { id: process.env.SITE_ID } });
  const sites = await db.site.findMany({ take: 2 });
  if (sites.length > 1) throw new AppError(503, "Site configuration required.");
  return sites[0] ?? null;
}
