import type { Access, CmsExecution } from "./cms";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { requireAccess } from "./access";
import { z } from "zod";
import { AppError } from "./errors";
import {
  templateSchema,
  slideSchema,
  validateField,
  DynamicField,
} from "@/modules/signage";
import { slugify, safeHref } from "@/modules/security";
import { sanitizeLegacyHtml } from "./content";
import { storeImage } from "./media";
import { renderBannerData } from "./signage-rendering";
export type RouteContext = { params: Promise<{ id: string }> };
export const bannerInclude = {
  template: { include: { fields: { orderBy: { order: "asc" as const } } } },
};
export const slideInclude = {
  items: {
    orderBy: { order: "asc" as const },
    include: { banner: { include: bannerInclude } },
  },
};
async function trackBannerMedia(
  tx: Prisma.TransactionClient,
  siteId: string,
  id: string,
  data: unknown,
  published = false,
) {
  const values = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") values.add(v);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(data);
  const assets = await tx.mediaAsset.findMany({
    where: {
      siteId,
      OR: [{ key: { in: [...values] } }, { url: { in: [...values] } }],
    },
    select: { id: true },
  });
  const targetType = published ? "bannerPublished" : "banners";
  await tx.mediaReference.deleteMany({ where: { targetType, targetId: id } });
  if (assets.length)
    await tx.mediaReference.createMany({
      data: assets.map((asset) => ({
        mediaId: asset.id,
        targetType,
        targetId: id,
      })),
    });
}
export async function listTemplates() {
  const { siteId } = await requireAccess();
  return Response.json({
    templates: await db.template.findMany({
      where: { siteId },
      include: { fields: { orderBy: { order: "asc" } } },
    }),
  });
}
export async function createTemplate(req: Request) {
  const { siteId } = await requireAccess("content", req);
  const input = templateSchema.parse(await req.json());
  return Response.json(
    await db.template.create({
      data: {
        siteId,
        key: `custom-${slugify(input.name)}-${randomUUID().slice(0, 8)}`,
        name: input.name,
        fields: {
          create: input.fields.map((f, order) => ({
            ...f,
            config: f.config as Prisma.InputJsonValue | undefined,
            order,
          })),
        },
      },
      include: { fields: true },
    }),
    { status: 201 },
  );
}
export async function listBanners() {
  const { siteId } = await requireAccess();
  const banners = await db.banner.findMany({
    where: { siteId },
    include: bannerInclude,
    orderBy: { createdAt: "desc" },
  });
  return Response.json({
    banners: await Promise.all(
      banners.map(async (b) => ({
        ...b,
        rawData: b.data,
        data: await renderBannerData(b),
      })),
    ),
  });
}
async function parseBanner(
  req: Request,
  siteId: string,
  fields: DynamicField[],
  previous: Record<string, any> = {},
) {
  if (Number(req.headers.get("content-length") ?? 0) > 4_000_000)
    throw new AppError(413, "Use the Media Library for larger uploads.");
  const form = await req.formData();
  const mode = String(form.get("sourceMode") || "MANUAL");
  if (!["MANUAL", "CATEGORY", "ITEM"].includes(mode))
    throw new AppError(422, "Choose a supported source.");
  const menuCategoryId =
    mode === "CATEGORY" ? String(form.get("menuCategoryId") || "") : null;
  const menuItemId =
    mode === "ITEM" ? String(form.get("menuItemId") || "") : null;
  if (
    mode === "CATEGORY" &&
    !(await db.menuCategory.findFirst({
      where: { id: menuCategoryId!, siteId },
    }))
  )
    throw new AppError(422, "Choose a category from this restaurant.");
  if (
    mode === "ITEM" &&
    !(await db.menuItem.findFirst({ where: { id: menuItemId!, siteId } }))
  )
    throw new AppError(422, "Choose a dish from this restaurant.");
  const site = await db.site.findUniqueOrThrow({ where: { id: siteId } });
  const sourceLocale = String(form.get("sourceLocale") || site.defaultLocale);
  if (
    !(await db.siteLocale.findFirst({ where: { siteId, code: sourceLocale } }))
  )
    throw new AppError(422, "Choose a configured language.");
  const data: Record<string, any> = {};
  for (const f of fields) {
    let value: any = previous[f.key];
    if (f.type === "IMAGE") {
      if (!f.isArray && form.has(`${f.key}_existing`)) {
        const key = String(form.get(`${f.key}_existing`));
        if (
          key &&
          key !== previous[f.key] &&
          !(await db.mediaAsset.findFirst({
            where: { siteId, key, archived: false },
          }))
        )
          throw new AppError(422, "Choose an image from this restaurant.");
        value = key || null;
      }
      if (f.isArray && form.has(`${f.key}_existing`)) {
        const requested: unknown = JSON.parse(
          String(form.get(`${f.key}_existing`)),
        );
        if (
          !Array.isArray(requested) ||
          requested.some((v) => !(previous[f.key] ?? []).includes(v))
        )
          throw new AppError(422, "Invalid existing image reference.");
        value = requested;
      }
      const files = form
        .getAll(f.key)
        .filter((v): v is File => v instanceof File && v.size > 0);
      if (files.length > 20)
        throw new AppError(422, "Choose at most 20 images.");
      if (files.length) {
        const assets = [];
        for (const file of files)
          assets.push(
            await storeImage(
              siteId,
              Buffer.from(await file.arrayBuffer()),
              file.type,
            ),
          );
        value = f.isArray
          ? [...(value ?? []), ...assets.map((a) => a.key)]
          : assets[0].key;
      }
    } else if (f.isArray && form.has(`${f.key}__json`))
      value = JSON.parse(String(form.get(`${f.key}__json`)));
    else if (!f.isArray && form.has(f.key)) {
      const raw = String(form.get(f.key));
      value =
        f.type === "NUMBER"
          ? raw === ""
            ? null
            : Number(raw)
          : f.type === "BOOLEAN"
            ? ["true", "on"].includes(raw)
            : raw;
    }
    try {
      value = validateField(
        mode === "MANUAL" ? f : { ...f, required: false },
        value,
      );
    } catch {
      throw new AppError(422, `Please check ${f.label}.`);
    }
    if (f.type === "RICHTEXT" && typeof value === "string")
      value = sanitizeLegacyHtml(value);
    if (
      f.type === "IMAGE" &&
      typeof value === "string" &&
      /^https?:/.test(value) &&
      !safeHref(value)
    )
      throw new AppError(422, "Invalid image address.");
    data[f.key] = value;
  }
  return {
    data: data as Prisma.InputJsonObject,
    version: Number(form.get("version") ?? 0),
    templateId: String(form.get("templateId") ?? ""),
    menuCategoryId,
    menuItemId,
    sourceLocale,
    currency: site.currency,
  };
}
export async function createBanner(req: Request) {
  const { siteId, user } = await requireAccess("content", req);
  // Clone is read only; the same bounded form is subsequently validated against the template.
  const templateId = String(
    (await req.clone().formData()).get("templateId") ?? "",
  );
  const template = await db.template.findFirst({
    where: { id: templateId, siteId },
    include: { fields: true },
  });
  if (!template) throw new AppError(404, "Template not found.");
  const { data, menuCategoryId, menuItemId, sourceLocale, currency } =
    await parseBanner(req, siteId, template.fields);
  return Response.json(
    await db.$transaction(async (tx) => {
      const banner = await tx.banner.create({
        data: {
          siteId,
          templateId,
          data,
          menuCategoryId,
          menuItemId,
          sourceLocale,
          currency,
        },
      });
      await trackBannerMedia(tx, siteId, banner.id, data);
      await tx.site.update({
        where: { id: siteId },
        data: { version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          siteId,
          actorId: user.id,
          action: "banner.create",
          targetType: "Banner",
          targetId: banner.id,
        },
      });
      return banner;
    }),
    { status: 201 },
  );
}
export async function updateBanner(req: Request, ctx: RouteContext) {
  const { siteId, user } = await requireAccess("content", req);
  const { id } = await ctx.params;
  const banner = await db.banner.findFirst({
    where: { id, siteId },
    include: bannerInclude,
  });
  if (!banner) throw new AppError(404, "Banner not found.");
  const { data, version, menuCategoryId, menuItemId, sourceLocale } =
    await parseBanner(
      req,
      siteId,
      banner.template.fields,
      banner.data as Record<string, any>,
    );
  if (version !== banner.version)
    throw new AppError(
      409,
      "Another editor changed this banner. Reload before saving.",
    );
  return Response.json(
    await db.$transaction(async (tx) => {
      const result = await tx.banner.update({
        where: { id, siteId, version: banner.version },
        data: {
          data,
          menuCategoryId,
          menuItemId,
          sourceLocale,
          version: { increment: 1 },
        },
      });
      await tx.site.update({
        where: { id: siteId },
        data: { version: { increment: 1 } },
      });
      await trackBannerMedia(tx, siteId, id, data);
      await tx.auditLog.create({
        data: {
          siteId,
          actorId: user.id,
          action: "banner.update",
          targetType: "Banner",
          targetId: id,
          before: banner.data as Prisma.InputJsonValue,
          after: data,
        },
      });
      return result;
    }),
  );
}
export async function deleteBanner(req: Request, ctx: RouteContext) {
  const { siteId, user } = await requireAccess("content", req);
  const { id } = await ctx.params;
  await db.$transaction(async (tx) => {
    const banner = await tx.banner.findFirst({ where: { id, siteId } });
    if (!banner) throw new AppError(404, "Banner not found.");
    if (await tx.slideItem.count({ where: { bannerId: id } }))
      throw new AppError(
        409,
        "Remove this banner from its slides before deleting it.",
      );
    const live = await tx.slide.findMany({
      where: { siteId, status: "PUBLISHED" },
      select: { publicationSnapshot: true },
    });
    if (
      live.some((s) => (s.publicationSnapshot as any)?.bannerIds?.includes(id))
    )
      throw new AppError(
        409,
        "Publish updated playlists without this banner before deleting it.",
      );
    await tx.mediaReference.deleteMany({
      where: {
        targetId: id,
        targetType: { in: ["banners", "bannerPublished"] },
      },
    });
    await tx.banner.delete({ where: { id, siteId } });
    await tx.auditLog.create({
      data: {
        siteId,
        actorId: user.id,
        action: "banner.delete",
        targetType: "Banner",
        targetId: id,
      },
    });
  });
  return new Response(null, { status: 204 });
}
export async function listSlides() {
  const { siteId } = await requireAccess();
  const slides = await db.slide.findMany({
    where: { siteId },
    include: slideInclude,
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ slides: await Promise.all(slides.map(signSlide)) });
}
export async function signSlide<
  T extends {
    items: Array<{
      banner: { data: Prisma.JsonValue; template: { fields: DynamicField[] } };
    }>;
  },
>(slide: T) {
  return {
    ...slide,
    items: await Promise.all(
      slide.items.map(async (item) => ({
        ...item,
        banner: { ...item.banner, data: await renderBannerData(item.banner) },
      })),
    ),
  };
}
export async function saveSlide(req: Request, ctx?: RouteContext) {
  const { siteId, user } = await requireAccess("content", req);
  const input = slideSchema.parse(await req.json());
  const id = ctx ? (await ctx.params).id : undefined;
  const result = await saveSlideRecord({ siteId, user } as Access, input, id);
  return Response.json(result, { status: id ? 200 : 201 });
}
export async function saveSlideRecord(
  access: Access,
  raw: unknown,
  id?: string,
  execution?: CmsExecution,
) {
  const { siteId, user } = access;
  const input = slideSchema.parse(raw);
  const mutate = async (tx: Prisma.TransactionClient) => {
    const count = await tx.banner.count({
      where: { siteId, id: { in: [...new Set(input.bannerIds)] } },
    });
    if (count !== new Set(input.bannerIds).size)
      throw new AppError(
        422,
        "A selected banner is not available for this site.",
      );
    const previous = id
      ? await tx.slide.findFirst({ where: { id, siteId } })
      : null;
    if (id && !previous) throw new AppError(404, "Slide not found.");
    if (previous && previous.version !== input.version)
      throw new AppError(409, "Another editor changed this slide.");
    const data = {
      name: input.name,
      speedMs: input.speedMs,
      effect: input.effect,
    };
    const slide = previous
      ? await tx.slide.update({
          where: { id: previous.id, siteId, version: previous.version },
          data: {
            ...data,
            version: { increment: 1 },
            items: {
              deleteMany: {},
              create: input.bannerIds.map((bannerId, order) => ({
                bannerId,
                order,
              })),
            },
          },
        })
      : await tx.slide.create({
          data: {
            ...data,
            id: execution?.createId,
            siteId,
            items: {
              create: input.bannerIds.map((bannerId, order) => ({
                bannerId,
                order,
              })),
            },
          },
        });
    await tx.site.update({
      where: { id: siteId },
      data: { version: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        siteId,
        actorId: user.id,
        action: previous ? "slide.update" : "slide.create",
        targetType: "Slide",
        targetId: slide.id,
      },
    });
    return slide;
  };
  return execution ? mutate(execution.tx) : db.$transaction(mutate);
}
export async function deleteSlide(req: Request, ctx: RouteContext) {
  const { siteId, user } = await requireAccess("content", req);
  const { id } = await ctx.params;
  await db.$transaction(async (tx) => {
    const slide = await tx.slide.findFirst({ where: { id, siteId } });
    if (!slide) throw new AppError(404, "Slide not found.");
    await tx.slide.delete({ where: { id, siteId } });
    await tx.auditLog.create({
      data: {
        siteId,
        actorId: user.id,
        action: "slide.delete",
        targetType: "Slide",
        targetId: id,
      },
    });
  });
  return new Response(null, { status: 204 });
}

export async function publishSignage(
  req: Request,
  ctx: { params: Promise<{ kind: string; id: string }> },
) {
  const { siteId, user } = await requireAccess("content", req);
  const { kind, id } = await ctx.params;
  if (!["banners", "slides"].includes(kind))
    throw new AppError(404, "Unknown display content.");
  const input = z
    .object({
      version: z.number().int(),
      operation: z.enum(["publish", "unpublish"]),
    })
    .parse(await req.json());
  return Response.json(
    await publishSignageRecord(
      { siteId, user } as Access,
      kind as "banners" | "slides",
      id,
      input,
    ),
  );
}
export async function publishSignageRecord(
  access: Access,
  kind: "banners" | "slides",
  id: string,
  input: { version: number; operation: "publish" | "unpublish" },
  execution?: CmsExecution,
) {
  const { siteId, user } = access;
  const mutate = async (tx: Prisma.TransactionClient) => {
    const target =
      kind === "banners"
        ? await tx.banner.findFirst({ where: { id, siteId } })
        : await tx.slide.findFirst({
            where: { id, siteId },
            include: { items: { orderBy: { order: "asc" } } },
          });
    if (!target) throw new AppError(404, "Display content not found.");
    if (target.version !== input.version)
      throw new AppError(409, "Content changed. Reload before publishing.");
    let snapshot: Prisma.InputJsonValue | undefined;
    if (input.operation === "publish") {
      if (kind === "banners") {
        const b = target as any;
        snapshot = {
          data: b.data,
          menuCategoryId: b.menuCategoryId,
          menuItemId: b.menuItemId,
          sourceLocale: b.sourceLocale,
          currency: b.currency,
        };
      } else {
        const s = target as any;
        const bannerIds = s.items.map((i: any) => i.bannerId);
        if (
          (await tx.banner.count({
            where: {
              id: { in: [...new Set(bannerIds)] as string[] },
              siteId,
              status: "PUBLISHED",
            },
          })) !== new Set(bannerIds).size
        )
          throw new AppError(
            422,
            "Publish each selected banner before publishing the slide.",
          );
        snapshot = {
          name: s.name,
          speedMs: s.speedMs,
          effect: s.effect,
          bannerIds,
        };
      }
    }
    if (kind === "banners")
      await trackBannerMedia(
        tx,
        siteId,
        id,
        input.operation === "publish" ? snapshot : null,
        true,
      );
    const data = {
      status:
        input.operation === "publish"
          ? ("PUBLISHED" as const)
          : ("DRAFT" as const),
      publicationSnapshot: snapshot ?? Prisma.DbNull,
      version: { increment: 1 },
    };
    const updated =
      kind === "banners"
        ? await tx.banner.update({
            where: { id, siteId, version: input.version },
            data,
          })
        : await tx.slide.update({
            where: { id, siteId, version: input.version },
            data,
          });
    await tx.site.update({
      where: { id: siteId },
      data: { version: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        siteId,
        actorId: user.id,
        action: kind + "." + input.operation,
        targetType: kind,
        targetId: id,
        before:
          (target.publicationSnapshot as Prisma.InputJsonValue) ?? undefined,
        after: snapshot,
      },
    });
    return updated;
  };
  return execution ? mutate(execution.tx) : db.$transaction(mutate);
}
