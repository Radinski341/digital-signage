import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { templateSchema, validateField } from "@/modules/signage";
import { bannerDraftSchema } from "@/modules/ai/workspace";
import type { Access } from "@/server/cms";
import { AppError } from "@/server/errors";
import { sanitizeLegacyHtml } from "@/server/content";
import { json } from "./workspace-data";
export async function saveWorkspaceSignage(
  tx: Prisma.TransactionClient,
  access: Access,
  resource: "templates" | "banners",
  id: string,
  isNew: boolean,
  raw: any,
) {
  const { siteId } = access;
  if (resource === "templates") {
    const p = templateSchema.parse(raw);
    const used = await tx.banner.findMany({
      where: { siteId, templateId: id },
      select: { data: true, menuCategoryId: true, menuItemId: true },
    });
    for (const b of used)
      for (const f of p.fields)
        validateField(
          b.menuCategoryId || b.menuItemId ? { ...f, required: false } : f,
          (b.data as any)[f.key],
        );
    const data = {
      name: p.name,
      fields: {
        ...(isNew ? {} : { deleteMany: {} }),
        create: p.fields.map((f, order) => ({
          ...f,
          config: json(f.config || {}),
          order,
        })),
      },
    };
    return isNew
      ? tx.template.create({
          data: { ...data, id, siteId, key: `custom-${randomUUID()}` },
        })
      : tx.template.update({ where: { id, siteId }, data });
  }
  const p = bannerDraftSchema.parse(raw);
  const template = await tx.template.findFirst({
    where: { siteId, id: p.templateId },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  if (!template) throw new AppError(422, "Choose a template from this site.");
  if (
    !(await tx.siteLocale.findFirst({
      where: { siteId, code: p.sourceLocale, enabled: true },
    }))
  )
    throw new AppError(422, "Enable the banner's language first.");
  for (const [model, id] of [
    ["menuCategory", p.menuCategoryId],
    ["menuItem", p.menuItemId],
  ] as const)
    if (id && !(await (tx[model] as any).findFirst({ where: { id, siteId } })))
      throw new AppError(
        422,
        "The selected menu source does not belong to this site.",
      );
  const linked = !!(p.menuCategoryId || p.menuItemId),
    data: Record<string, unknown> = {};
  const mediaIds = new Set<string>();
  for (const f of template.fields) {
    let value = validateField(
      linked ? { ...f, required: false } : f,
      p.data[f.key],
    );
    if (f.type === "RICHTEXT" && typeof value === "string")
      value = sanitizeLegacyHtml(value);
    if (f.type === "IMAGE" && value) {
      for (const image of Array.isArray(value) ? value : [value]) {
        const asset = await tx.mediaAsset.findFirst({
          where: {
            siteId,
            archived: false,
            OR: [{ key: String(image) }, { url: String(image) }],
          },
        });
        if (!asset)
          throw new AppError(
            422,
            "Choose banner images from this site's Media Library.",
          );
        mediaIds.add(asset.id);
      }
    }
    data[f.key] = value;
  }
  const values = {
    templateId: template.id,
    data: json(data),
    menuCategoryId: p.menuCategoryId || null,
    menuItemId: p.menuItemId || null,
    sourceLocale: p.sourceLocale,
    currency: access.site.currency,
  };
  const record = isNew
    ? await tx.banner.create({ data: { ...values, id, siteId } })
    : await tx.banner.update({
        where: { id, siteId },
        data: { ...values, version: { increment: 1 } },
      });
  await tx.mediaReference.deleteMany({
    where: { targetType: "banners", targetId: id, revisionId: null },
  });
  if (mediaIds.size)
    await tx.mediaReference.createMany({
      data: [...mediaIds].map((mediaId) => ({
        mediaId,
        targetId: id,
        targetType: "banners",
      })),
    });
  return record;
}
