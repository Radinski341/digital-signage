import { z } from "zod";
import { db } from "@/server/db";
import { requireAccess } from "@/server/access";
import { endpoint, AppError } from "@/server/errors";
import { invalidateSite } from "@/server/cache";
export const POST = endpoint(
  async (req: Request, ctx: { params: Promise<{ resource: string }> }) => {
    const { siteId, user } = await requireAccess("content", req);
    const { resource } = await ctx.params;
    if (!["categories", "items"].includes(resource))
      throw new AppError(404, "This collection cannot be reordered.");
    const input = z
      .array(z.object({ id: z.string(), version: z.number().int() }))
      .min(1)
      .max(1000)
      .parse(await req.json());
    if (new Set(input.map((v) => v.id)).size !== input.length)
      throw new AppError(422, "Duplicate entries.");
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Site" WHERE "id" = ${siteId} FOR NO KEY UPDATE`;
      for (const [position, row] of input.entries()) {
        const updated =
          resource === "categories"
            ? await tx.menuCategory.updateMany({
                where: { id: row.id, siteId, version: row.version },
                data: { position, version: { increment: 1 } },
              })
            : await tx.menuItem.updateMany({
                where: { id: row.id, siteId, version: row.version },
                data: { position, version: { increment: 1 } },
              });
        if (updated.count !== 1)
          throw new AppError(
            409,
            "The collection changed. Reload before reordering.",
          );
      }
      await tx.site.update({
        where: { id: siteId },
        data: { version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          siteId,
          actorId: user.id,
          action: resource + ".reorder",
          targetType: resource,
          targetId: siteId,
        },
      });
    });
    invalidateSite(siteId);
    return Response.json({ ok: true });
  },
);
