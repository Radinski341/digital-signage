import { z } from "zod";
import { db } from "@/server/db";
import { requireAccess } from "@/server/access";
import { endpoint, AppError } from "@/server/errors";
import { invalidateSite } from "@/server/cache";
export const PUT = endpoint(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { siteId } = await requireAccess("content", req);
    const { id } = await ctx.params;
    const input = z
      .object({
        alt: z.string().max(500),
        caption: z.string().max(2000),
        archived: z.boolean(),
      })
      .parse(await req.json());
    const asset = await db.mediaAsset.findFirst({ where: { id, siteId } });
    if (!asset) throw new AppError(404, "Image not found.");
    const updated = await db.mediaAsset.update({
      where: { id, siteId },
      data: input,
    });
    invalidateSite(siteId);
    return Response.json(updated);
  },
);
export const DELETE = endpoint(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { siteId, user } = await requireAccess("settings", req);
    const { id } = await ctx.params;
    await db.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.findFirst({
        where: { id, siteId },
        include: { references: true, menuImages: true },
      });
      if (!asset) throw new AppError(404, "Image not found.");
      const banners = await tx.banner.findMany({
        where: { siteId },
        select: { data: true, publicationSnapshot: true },
      });
      const used =
        asset.references.length ||
        asset.menuImages.length ||
        banners.some((b) => JSON.stringify(b).includes(asset.key));
      if (used)
        throw new AppError(
          409,
          "This image is still in use. Archive it instead.",
        );
      if (!asset.archived)
        throw new AppError(
          409,
          "Archive the image before deleting its library record.",
        );
      await tx.mediaAsset.delete({ where: { id, siteId } });
      await tx.auditLog.create({
        data: {
          siteId,
          actorId: user.id,
          action: "media.delete",
          targetType: "MediaAsset",
          targetId: id,
          after: { key: asset.key },
        },
      });
    });
    // Retain immutable objects for backup/recovery; operators can apply documented retention policies.
    return new Response(null, { status: 204 });
  },
);

export const GET = endpoint(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { siteId } = await requireAccess();
    const { id } = await ctx.params;
    const asset = await db.mediaAsset.findFirst({ where: { id, siteId } });
    if (!asset) throw new AppError(404, "Image not found.");
    return Response.json(asset);
  },
);
