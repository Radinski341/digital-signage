import { db } from "@/server/db";
import { requireAccess } from "@/server/access";
import { endpoint } from "@/server/errors";
export const GET = endpoint(async (req: Request) => {
  const { siteId } = await requireAccess();
  const url = new URL(req.url);
  const query = (url.searchParams.get("q") ?? "").slice(0, 100);
  const rows = await db.mediaAsset.findMany({
    where: {
      siteId,
      archived: url.searchParams.get("archived") === "true",
      ...(query
        ? {
            OR: [
              { alt: { contains: query, mode: "insensitive" } },
              { caption: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { references: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 61,
    ...(url.searchParams.get("cursor")
      ? { cursor: { id: url.searchParams.get("cursor")! }, skip: 1 }
      : {}),
  });
  const more = rows.length > 60;
  if (more) rows.pop();
  return Response.json({ rows, nextCursor: more ? rows.at(-1)?.id : null });
});
