import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { dishPath } from "@/modules/menu-items";
import { overlappingHours } from "@/modules/hours";
import { db } from "./db";
import { requireAccess } from "./access";
import { AppError } from "./errors";
import { invalidateSite } from "./cache";
import { schemas, Resource } from "@/modules/cms";
import { mediaIds, sectionDefinitions } from "@/modules/sections/schema";
import { safeHref, permits, slugify } from "@/modules/security";
type Transaction = Prisma.TransactionClient;
export type CmsExecution = { tx: Transaction; createId?: string };
export type Access = Awaited<ReturnType<typeof requireAccess>>;
const settings = new Set<Resource>([
  "branding",
  "locales",
  "integrations",
  "profile",
]);
export function permission(resource: Resource) {
  return resource === "users"
    ? "users"
    : settings.has(resource)
      ? "settings"
      : "content";
}
function model(tx: Transaction | PrismaClient, resource: Resource | "media") {
  const names = {
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
    users: "membership",
    media: "mediaAsset",
  } as const;
  return (tx as any)[names[resource]];
}
export const includes: Partial<Record<Resource, object>> = {
  profile: { translations: true, socials: { orderBy: { position: "asc" } } },
  locations: {
    hours: { orderBy: { position: "asc" } },
    exceptions: { include: { intervals: true } },
  },
  categories: { translations: true },
  items: {
    translations: true,
    variants: { include: { translations: true }, orderBy: { position: "asc" } },
    tags: { include: { tag: { include: { translations: true } } } },
    images: { orderBy: { position: "asc" } },
  },
  tags: { translations: true },
  locales: { strings: true },
  actions: { translations: true },
  pages: {
    translations: true,
    sections: { include: { translations: true }, orderBy: { position: "asc" } },
    revisions: {
      select: { id: true, locale: true, number: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    },
  },
  navigation: {
    items: { include: { translations: true }, orderBy: { position: "asc" } },
  },
  users: { user: { select: { id: true, email: true, disabled: true } } },
};
export async function listResource(access: Access, resource: Resource) {
  const rows = await model(db, resource).findMany({
    where: { siteId: access.siteId },
    include: includes[resource],
    orderBy:
      resource === "items" ||
      resource === "categories" ||
      resource === "locations"
        ? { position: "asc" }
        : undefined,
  });
  return rows;
}
async function reference(
  tx: Transaction,
  resource: Resource | "media",
  id: string | null | undefined,
  siteId: string,
) {
  if (!id) return;
  const found = await model(tx, resource).findFirst({ where: { id, siteId } });
  if (!found)
    throw new AppError(
      422,
      "A selected reference does not belong to this site.",
    );
  return found;
}
async function trackMedia(
  tx: Transaction,
  siteId: string,
  targetType: string,
  targetId: string,
  input: unknown,
) {
  const ids = mediaIds(input);
  if (
    ids.length !==
    (await tx.mediaAsset.count({
      where: {
        id: { in: ids },
        siteId,
        OR: [
          { archived: false },
          { references: { some: { targetType, targetId } } },
        ],
      },
    }))
  )
    throw new AppError(
      422,
      "Choose active images from this site’s Media Library.",
    );
  await tx.mediaReference.deleteMany({
    where: { targetType, targetId, revisionId: null },
  });
  if (ids.length)
    await tx.mediaReference.createMany({
      data: ids.map((mediaId) => ({ mediaId, targetType, targetId })),
    });
}
const dataKeys = (input: any, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, input[k] ?? null]));
export const reserved = new Set([
  "admin",
  "api",
  "banner",
  "slide",
  "settings",
  "preview",
  "images",
  "uploads",
  "test-fixtures",
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
]);
function pathFor(slug: string, locale: string, defaultLocale: string) {
  return (
    `${locale === defaultLocale ? "" : "/" + locale}${slug ? "/" + slug : ""}` ||
    "/"
  );
}
export async function saveResource(
  access: Access,
  resource: Resource,
  raw: unknown,
  id?: string,
  execution?: CmsExecution,
) {
  if (!permits(access.role, permission(resource)))
    throw new AppError(403, "You do not have permission for this action.");
  const normalized = raw && typeof raw === "object" ? ({ ...raw } as any) : raw;
  if (
    normalized &&
    ["items", "categories"].includes(resource) &&
    !normalized.slug
  ) {
    const title =
      normalized.translations?.find(
        (t: any) => t.locale === access.site.defaultLocale,
      )?.name || "";
    normalized.slug =
      slugify(title) || resource + "-" + randomUUID().slice(0, 8);
  }
  if (resource === "profile" && normalized)
    normalized.name =
      normalized.translations?.find(
        (t: any) => t.locale === access.site.defaultLocale,
      )?.name || normalized.name;
  const input: any = schemas[resource].parse(normalized);
  const { siteId, user } = access;
  let site = access.site;
  const mutate = async (tx: Transaction) => {
    await tx.$queryRaw`SELECT "id" FROM "Site" WHERE "id" = ${siteId} FOR NO KEY UPDATE`;
    site = await tx.site.findUniqueOrThrow({ where: { id: siteId } });
    const membership = await tx.membership.findUnique({
      where: { siteId_userId: { siteId, userId: user.id } },
    });
    if (
      !membership ||
      membership.disabled ||
      !permits(membership.role, permission(resource))
    )
      throw new AppError(
        403,
        "Your permissions changed. Please sign in again.",
      );
    const existing = id
      ? await model(tx, resource).findFirst({ where: { id, siteId } })
      : null;
    if (id && !existing) throw new AppError(404, "Content not found.");
    if (existing && "version" in existing && input.version !== existing.version)
      throw new AppError(
        409,
        "Another editor changed this content. Reload before saving.",
      );
    if (input.translations) {
      const codes = (
        await tx.siteLocale.findMany({
          where: { siteId },
          select: { code: true },
        })
      ).map((l) => l.code);
      if (input.translations.some((t: any) => !codes.includes(t.locale)))
        throw new AppError(422, "Enable the selected languages first.");
      if (!input.translations.some((t: any) => t.locale === site.defaultLocale))
        throw new AppError(422, "Default-language content is required.");
    }
    let record: any;
    const versioned = (data: any) =>
      existing ? { ...data, version: { increment: 1 } } : data;
    const persist = (data: any) =>
      existing
        ? model(tx, resource).update({
            where: {
              id,
              siteId,
              ...("version" in existing ? { version: existing.version } : {}),
            },
            data:
              "version" in existing
                ? { ...data, version: { increment: 1 } }
                : data,
          })
        : model(tx, resource).create({
            data: { id: execution?.createId, siteId, ...data },
          });
    const translated = (data: any) =>
      existing
        ? {
            ...data,
            translations: { deleteMany: {}, create: input.translations },
          }
        : { ...data, translations: { create: input.translations } };
    switch (resource) {
      case "profile": {
        if (
          site.currency !== input.currency &&
          (await tx.menuItem.count({
            where: {
              siteId,
              status: "PUBLISHED",
              currency: { not: input.currency },
            },
          }))
        )
          throw new AppError(
            422,
            "Archive existing dishes before changing currency, then explicitly update their prices and currency before republishing.",
          );
        const profile = await tx.restaurantProfile.findUniqueOrThrow({
          where: { siteId },
        });
        if (input.version !== profile.version)
          throw new AppError(
            409,
            "Restaurant information has changed. Reload first.",
          );
        await tx.site.update({
          where: { id: siteId },
          data: {
            name: input.name,
            currency: input.currency,
            timeZone: input.timeZone,
            domain: input.domain || null,
          },
        });
        record = await tx.restaurantProfile.update({
          where: { id: profile.id, version: profile.version },
          data: {
            ...dataKeys(input, [
              "legalName",
              "phone",
              "email",
              "website",
              "priceRange",
              "cuisines",
            ]),
            version: { increment: 1 },
            translations: { deleteMany: {}, create: input.translations },
            socials: {
              deleteMany: {},
              create: input.socials.map((s: any, position: number) => ({
                ...s,
                position,
              })),
            },
          },
        });
        break;
      }
      case "branding": {
        const branding = await tx.branding.findUniqueOrThrow({
          where: { siteId },
        });
        if (input.version !== branding.version)
          throw new AppError(409, "Branding changed. Reload first.");
        // Reject unreadable foreground/background combinations before changing public tokens.
        const luminance = (hex: string) => {
          const channels = [1, 3, 5]
            .map((n) => parseInt(hex.slice(n, n + 2), 16) / 255)
            .map((n) =>
              n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4,
            );
          return (
            channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
          );
        };
        const contrast = (a: string, b: string) => {
          const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
          return (values[0] + 0.05) / (values[1] + 0.05);
        };
        if (
          contrast(input.textColor, input.backgroundColor) < 4.5 ||
          contrast(input.textColor, input.surfaceColor) < 4.5
        )
          throw new AppError(
            422,
            "Text and surface colors need at least 4.5:1 contrast.",
          );
        record = await tx.branding.update({
          where: { id: branding.id, version: branding.version },
          data: {
            ...dataKeys(input, [
              "primaryColor",
              "accentColor",
              "textColor",
              "backgroundColor",
              "surfaceColor",
              "headingFont",
              "bodyFont",
              "radius",
              "logoId",
              "alternativeLogoId",
              "faviconId",
              "socialImageId",
            ]),
            version: { increment: 1 },
          },
        });
        break;
      }
      case "locations": {
        if (overlappingHours(input.hours))
          throw new AppError(
            422,
            "Opening intervals overlap, including overnight hours.",
          );
        for (let day = 0; day < 7; day++) {
          const intervals = input.hours
            .filter((h: any) => h.weekday === day)
            .sort((a: any, b: any) => a.opens.localeCompare(b.opens));
          for (let i = 1; i < intervals.length; i++)
            if (
              intervals[i - 1].nextDay ||
              intervals[i].opens < intervals[i - 1].closes
            )
              throw new AppError(422, "Opening intervals must not overlap.");
        }
        if (
          new Set(input.exceptions.map((e: any) => e.date)).size !==
          input.exceptions.length
        )
          throw new AppError(
            422,
            "Only one special schedule per date is allowed.",
          );
        record = await persist(
          versioned({
            ...dataKeys(input, [
              "name",
              "address",
              "city",
              "postalCode",
              "country",
              "phone",
              "email",
              "latitude",
              "longitude",
              "directionsUrl",
              "position",
            ]),
            hours: {
              ...(existing ? { deleteMany: {} } : {}),
              create: input.hours.map((h: any, position: number) => ({
                ...h,
                position,
              })),
            },
            exceptions: {
              ...(existing ? { deleteMany: {} } : {}),
              create: input.exceptions.map((e: any) => ({
                ...dataKeys(e, ["date", "label", "closed"]),
                intervals: { create: e.closed ? [] : e.intervals },
              })),
            },
          }),
        );
        break;
      }
      case "categories":
        record = await persist(
          translated(
            versioned(
              dataKeys(input, ["slug", "enabled", "position", "imageId"]),
            ),
          ),
        );
        break;
      case "items": {
        // Older clients may round-trip plain details without knowing about rich content.
        if (existing) {
          const previous = await tx.itemTranslation.findMany({
            where: { itemId: existing.id },
          });
          for (const translation of input.translations) {
            const old = previous.find(
              (row) => row.locale === translation.locale,
            );
            if (
              translation.detailsDocument === undefined &&
              old?.detailsDocument &&
              old.details === translation.details
            )
              translation.detailsDocument = old.detailsDocument;
          }
        }
        if (!site.currency || input.currency !== site.currency)
          throw new AppError(
            422,
            "Use the restaurant currency configured in Restaurant Information.",
          );
        const digits = new Intl.NumberFormat("en", {
          style: "currency",
          currency: input.currency,
        }).resolvedOptions().maximumFractionDigits;
        if (
          [input.price, ...input.variants.map((v: any) => v.price)].some(
            (p: string) => (p.split(".")[1]?.length ?? 0) > (digits ?? 2),
          )
        )
          throw new AppError(
            422,
            "Price has too many decimal places for this currency.",
          );
        await reference(tx, "categories", input.categoryId, siteId);
        await reference(tx, "actions", input.actionId, siteId);
        if (
          (await tx.menuTag.count({
            where: { siteId, id: { in: input.tagIds } },
          })) !== new Set(input.tagIds).size
        )
          throw new AppError(422, "Invalid dietary/allergen selection.");
        record = await persist(
          translated(
            versioned({
              ...dataKeys(input, [
                "categoryId",
                "slug",
                "price",
                "currency",
                "status",
                "available",
                "featured",
                "position",
                "imageId",
                "actionId",
              ]),
              variants: {
                ...(existing ? { deleteMany: {} } : {}),
                create: input.variants.map((v: any, position: number) => ({
                  price: v.price,
                  position,
                  translations: { create: v.translations },
                })),
              },
              tags: {
                ...(existing ? { deleteMany: {} } : {}),
                create: [...new Set(input.tagIds)].map((tagId) => ({
                  tagId,
                })),
              },
              images: {
                ...(existing ? { deleteMany: {} } : {}),
                create: input.imageIds.map(
                  (mediaId: string, position: number) => ({
                    mediaId,
                    position,
                  }),
                ),
              },
            }),
          ),
        );
        if (existing && existing.slug !== input.slug) {
          const locales = await tx.siteLocale.findMany({
            where: { siteId, enabled: true },
          });
          for (const locale of locales) {
            const fromPath = dishPath(
              existing.slug,
              locale.code,
              site.defaultLocale,
            );
            const toPath = dishPath(
              input.slug,
              locale.code,
              site.defaultLocale,
            );
            await tx.redirect.upsert({
              where: { siteId_fromPath: { siteId, fromPath } },
              create: { siteId, fromPath, toPath },
              update: { toPath },
            });
          }
        }
        break;
      }
      case "tags":
        record = await persist(translated(dataKeys(input, ["key", "kind"])));
        break;
      case "integrations":
        record = await persist(
          versioned(
            dataKeys(input, ["provider", "label", "url", "enabled", "logoId"]),
          ),
        );
        break;
      case "actions": {
        await reference(tx, "pages", input.pageId, siteId);
        await reference(tx, "integrations", input.integrationId, siteId);
        record = await persist(
          translated({
            ...dataKeys(input, [
              "name",
              "type",
              "destination",
              "style",
              "icon",
              "enabled",
              "newTab",
            ]),
            pageId: input.type === "PAGE" ? input.pageId : null,
            integrationId:
              input.type === "ORDERING" ? input.integrationId : null,
          }),
        );
        break;
      }
      case "locales": {
        if (
          !existing &&
          (await tx.pageTranslation.count({
            where: { siteId, slug: input.code },
          }))
        )
          throw new AppError(
            422,
            "This language prefix is already used by a page. Change that page URL first.",
          );
        if (input.isDefault && !input.enabled)
          throw new AppError(422, "The default language must stay enabled.");
        if (
          existing?.code === site.defaultLocale &&
          (!input.enabled || input.code !== site.defaultLocale)
        )
          throw new AppError(
            422,
            "Change the default language before disabling it. Locale identifiers cannot be renamed.",
          );
        if (existing && input.code !== existing.code)
          throw new AppError(
            422,
            "Add a new language instead of renaming its identifier.",
          );
        record = await persist({
          ...dataKeys(input, ["code", "label", "enabled", "direction"]),
          strings: {
            ...(existing ? { deleteMany: {} } : {}),
            create: input.strings,
          },
        });
        if (input.isDefault && input.code !== site.defaultLocale) {
          // A default switch changes routing; require complete published page translations first.
          const published = await tx.page.findMany({
            where: { siteId, status: "PUBLISHED" },
            include: { translations: true },
          });
          if (
            published.some(
              (p) =>
                !p.translations.some(
                  (t) => t.locale === input.code && t.publishedRevisionId,
                ),
            )
          )
            throw new AppError(
              422,
              "Publish every live page in the new default language first.",
            );
          for (const page of published)
            for (const t of page.translations)
              if (t.publishedSlug !== null) {
                const oldPath = pathFor(
                    t.publishedSlug,
                    t.locale,
                    site.defaultLocale,
                  ),
                  newPath = pathFor(t.publishedSlug, t.locale, input.code);
                if (oldPath !== newPath)
                  await tx.redirect.upsert({
                    where: { siteId_fromPath: { siteId, fromPath: oldPath } },
                    create: { siteId, fromPath: oldPath, toPath: newPath },
                    update: { toPath: newPath },
                  });
              }
          await tx.site.update({
            where: { id: siteId },
            data: { defaultLocale: input.code },
          });
        }
        break;
      }
      case "pages": {
        if (
          existing &&
          existing.type !== "CUSTOM" &&
          input.type !== existing.type
        )
          throw new AppError(422, "System page types cannot be changed.");
        if (
          !existing &&
          input.type !== "CUSTOM" &&
          (await tx.page.count({ where: { siteId, type: input.type } }))
        )
          throw new AppError(409, "This system page already exists.");
        const codes = (await tx.siteLocale.findMany({ where: { siteId } })).map(
          (l) => l.code,
        );
        for (const t of input.translations) {
          if (
            reserved.has(t.slug) ||
            codes.includes(t.slug) ||
            (input.type === "HOME" ? t.slug !== "" : !t.slug)
          )
            throw new AppError(
              422,
              "This URL is reserved or conflicts with a system route.",
            );
        }
        for (const section of input.sections) {
          const config: any = section.config;
          for (const actionId of config.actionIds ?? [])
            await reference(tx, "actions", actionId, siteId);
          for (const itemId of config.itemIds ?? [])
            await reference(tx, "items", itemId, siteId);
          for (const categoryId of config.categoryIds ?? [])
            await reference(tx, "categories", categoryId, siteId);
          await reference(tx, "locations", config.locationId, siteId);
        }
        record = await persist(
          versioned({ internalName: input.internalName, type: input.type }),
        );
        for (const t of input.translations)
          await tx.pageTranslation.upsert({
            where: { pageId_locale: { pageId: record.id, locale: t.locale } },
            create: { ...t, siteId, pageId: record.id },
            update: t,
          });
        await tx.pageSection.deleteMany({ where: { pageId: record.id } });
        for (const [position, s] of input.sections.entries())
          await tx.pageSection.create({
            data: {
              pageId: record.id,
              type: s.type,
              hidden: s.hidden,
              position,
              config: sectionDefinitions[
                s.type as keyof typeof sectionDefinitions
              ].schema.parse(s.config) as Prisma.InputJsonValue,
              translations: {
                create: s.translations.map((t: any) => ({
                  locale: t.locale,
                  content: t.content,
                })),
              },
            },
          });
        break;
      }
      case "navigation": {
        for (const item of input.items) {
          await reference(tx, "pages", item.pageId, siteId);
          if (!item.pageId && !safeHref(item.url))
            throw new AppError(
              422,
              "Choose a page or a valid external address.",
            );
        }
        const entries = input.items.map((item: any) => ({
          ...item,
          id: item.id || randomUUID(),
        }));
        if (new Set(entries.map((i: any) => i.id)).size !== entries.length)
          throw new AppError(
            422,
            "Navigation entries need distinct identifiers.",
          );
        for (const item of entries)
          if (item.parentId) {
            const parent = entries.find((p: any) => p.id === item.parentId);
            if (!parent || parent.id === item.id || parent.parentId)
              throw new AppError(
                422,
                "Choose a top-level link as the parent. Navigation supports two levels.",
              );
          }
        record = await persist({ key: input.key });
        await tx.navigationItem.deleteMany({
          where: { navigationId: record.id },
        });
        for (const item of [
          ...entries.filter((i: any) => !i.parentId),
          ...entries.filter((i: any) => i.parentId),
        ])
          await tx.navigationItem.create({
            data: {
              id: item.id,
              navigationId: record.id,
              ...dataKeys(item, ["pageId", "url", "enabled", "parentId"]),
              position: entries.findIndex((i: any) => i.id === item.id),
              translations: { create: item.translations },
            },
          });
        break;
      }
      case "users": {
        if (existing) {
          const target = await tx.user.findUniqueOrThrow({
            where: { id: existing.userId },
          });
          if (
            existing.role === "OWNER" &&
            (input.disabled || input.role !== "OWNER") &&
            (await tx.membership.count({
              where: {
                siteId,
                role: "OWNER",
                disabled: false,
                user: { disabled: false },
              },
            })) <= 1
          )
            throw new AppError(422, "Keep at least one active Owner.");
          if (input.email !== target.email)
            throw new AppError(422, "User email cannot be changed here.");
          if (
            input.password &&
            (await tx.membership.count({ where: { userId: target.id } })) > 1
          )
            throw new AppError(
              422,
              "This shared account requires an operator-assisted password reset.",
            );
          await tx.user.update({
            where: { id: target.id },
            data: {
              sessionVersion: { increment: 1 },
              ...(input.password
                ? { password: await bcrypt.hash(input.password, 12) }
                : {}),
            },
          });
          record = await tx.membership.update({
            where: { id: existing.id, version: input.version },
            data: {
              role: input.role,
              disabled: input.disabled,
              version: { increment: 1 },
            },
          });
        } else {
          if (!input.password)
            throw new AppError(
              422,
              "Set an initial password of at least 12 characters.",
            );
          const email = input.email.toLowerCase();
          const other = await tx.user.findUnique({ where: { email } });
          if (other)
            throw new AppError(
              409,
              "This account already exists. Membership must be granted by an operator.",
            );
          const target = await tx.user.create({
            data: { email, password: await bcrypt.hash(input.password, 12) },
          });
          record = await tx.membership.create({
            data: {
              siteId,
              userId: target.id,
              role: input.role,
              disabled: input.disabled,
            },
          });
        }
        break;
      }
    }
    await trackMedia(tx, siteId, resource, record.id, input);
    await tx.site.update({
      where: { id: siteId },
      data: { version: { increment: 1 } },
    });
    const auditFields: Partial<Record<Resource, string[]>> = {
      users: ["role", "disabled"],
      integrations: ["provider", "label", "enabled"],
      profile: ["legalName", "phone", "email", "priceRange", "cuisines"],
      branding: [
        "primaryColor",
        "accentColor",
        "textColor",
        "backgroundColor",
        "surfaceColor",
        "headingFont",
        "bodyFont",
        "radius",
        "logoId",
        "alternativeLogoId",
        "faviconId",
        "socialImageId",
      ],
      locales: ["code", "label", "enabled", "direction"],
      actions: ["name", "type", "enabled", "pageId", "integrationId"],
    };
    const auditKeys = auditFields[resource];
    await tx.auditLog.create({
      data: {
        siteId,
        actorId: user.id,
        action: `${resource}.${existing ? "update" : "create"}`,
        targetType: resource,
        targetId: record.id,
        ...(auditKeys
          ? {
              before: existing ? dataKeys(existing, auditKeys) : undefined,
              after: dataKeys(input, auditKeys),
            }
          : {}),
        ...(resource === "items" && existing
          ? {
              before: {
                price: String(existing.price),
                status: existing.status,
                available: existing.available,
              },
              after: {
                price: input.price,
                status: input.status,
                available: input.available,
              },
            }
          : {}),
      },
    });
    return record;
  };
  const output = execution
    ? await mutate(execution.tx)
    : await db.$transaction(mutate, { timeout: 20000 });
  if (!execution) invalidateSite(siteId);
  return output;
}
export async function publishPage(
  access: Access,
  id: string,
  raw: unknown,
  execution?: CmsExecution,
) {
  if (!permits(access.role, "content"))
    throw new AppError(403, "You cannot publish content.");
  const input = (await import("zod")).z
    .object({
      version: (await import("zod")).z.number().int(),
      locale: (await import("zod")).z.string(),
      operation: (await import("zod")).z.enum([
        "publish",
        "unpublish",
        "archive",
        "duplicate",
        "restore",
      ]),
      revisionId: (await import("zod")).z.string().optional(),
    })
    .parse(raw);
  const { siteId, user } = access;
  let site = access.site;
  const mutate = async (tx: Transaction) => {
    await tx.$queryRaw`SELECT "id" FROM "Site" WHERE "id" = ${siteId} FOR NO KEY UPDATE`;
    site = await tx.site.findUniqueOrThrow({ where: { id: siteId } });
    const page = await tx.page.findFirst({
      where: { id, siteId },
      include: includes.pages,
    });
    if (!page) throw new AppError(404, "Page not found.");
    if (page.version !== input.version)
      throw new AppError(
        409,
        "This page changed. Save/reload before publishing.",
      );
    const full = page as any;
    const translation = full.translations.find(
      (t: any) => t.locale === input.locale,
    );
    if (!translation)
      throw new AppError(422, "Create this language’s page content first.");
    const enabled = await tx.siteLocale.findFirst({
      where: { siteId, code: input.locale, enabled: true },
    });
    if (!enabled)
      throw new AppError(422, "Enable this language before publishing.");
    if (input.operation === "duplicate") {
      const copy = await tx.page.create({
        data: {
          siteId,
          internalName: page.internalName + " (copy)",
          type: "CUSTOM",
        },
      });
      for (const t of full.translations)
        await tx.pageTranslation.create({
          data: {
            ...dataKeys(t, [
              "seoTitle",
              "seoDescription",
              "canonicalUrl",
              "socialImageId",
              "ogTitle",
              "ogDescription",
              "noIndex",
            ]),
            locale: t.locale,
            title: t.title,
            siteId,
            pageId: copy.id,
            slug: (t.slug || "home") + "-copy-" + copy.id.slice(0, 8),
          },
        });
      for (const s of full.sections)
        await tx.pageSection.create({
          data: {
            pageId: copy.id,
            type: s.type,
            position: s.position,
            hidden: s.hidden,
            config: s.config,
            translations: {
              create: s.translations.map((t: any) => ({
                locale: t.locale,
                content: t.content,
              })),
            },
          },
        });
      await trackMedia(tx, siteId, "pages", copy.id, full);
      await tx.auditLog.create({
        data: {
          siteId,
          actorId: user.id,
          action: "page.duplicate",
          targetType: "Page",
          targetId: copy.id,
        },
      });
      return copy;
    }
    if (input.operation === "restore") {
      const revision = await tx.contentRevision.findFirst({
        where: { id: input.revisionId, pageId: id, locale: input.locale },
      });
      if (!revision) throw new AppError(404, "Revision not found.");
      const snapshot: any = revision.snapshot;
      const restored = { ...snapshot.translation };
      for (const key of [
        "seoTitle",
        "seoDescription",
        "canonicalUrl",
        "ogTitle",
        "ogDescription",
      ])
        restored[key] ??= "";
      const translationInput = schemas.pages.shape.translations.parse([
        restored,
      ])[0];
      await tx.pageTranslation.update({
        where: { id: translation.id },
        data: translationInput,
      });
      await tx.pageSection.deleteMany({ where: { pageId: id } });
      for (const s of snapshot.sections)
        await tx.pageSection.create({
          data: {
            pageId: id,
            type: s.type,
            position: s.position,
            hidden: s.hidden,
            config: s.config,
            translations: {
              create: s.translations.map((t: any) => ({
                locale: t.locale,
                content: t.content,
              })),
            },
          },
        });
      await trackMedia(tx, siteId, "pages", id, snapshot);
    } else if (input.operation === "publish") {
      for (const section of full.sections.filter((s: any) => !s.hidden)) {
        const content =
          section.translations.find((t: any) => t.locale === input.locale)
            ?.content ||
          section.translations.find((t: any) => t.locale === site.defaultLocale)
            ?.content;
        if (section.type === "HERO" && !content?.heading?.trim())
          throw new AppError(
            422,
            "Add a heading to each visible Hero section before publishing.",
          );
      }
      if (page.status === "ARCHIVED")
        throw new AppError(
          422,
          "Restore the archived page to draft before publishing.",
        );
      const snapshot = {
        translation: dataKeys(translation, [
          "locale",
          "slug",
          "title",
          "seoTitle",
          "seoDescription",
          "canonicalUrl",
          "socialImageId",
          "ogTitle",
          "ogDescription",
          "noIndex",
        ]),
        sections: full.sections.map((s: any) => ({
          id: s.id,
          type: s.type,
          position: s.position,
          hidden: s.hidden,
          config: s.config,
          translations: s.translations.map((t: any) => ({
            locale: t.locale,
            content: t.content,
          })),
        })),
      };
      const number =
        (
          await tx.contentRevision.aggregate({
            where: { pageId: id, locale: input.locale },
            _max: { number: true },
          })
        )._max.number ?? 0;
      const revision = await tx.contentRevision.create({
        data: {
          pageId: id,
          locale: input.locale,
          number: number + 1,
          snapshot: snapshot as Prisma.InputJsonValue,
          actorId: user.id,
        },
      });
      const ids = mediaIds(snapshot);
      for (const mediaId of ids)
        await tx.mediaReference.create({
          data: {
            mediaId,
            targetType: "revision",
            targetId: revision.id,
            revisionId: revision.id,
          },
        });
      if (
        translation.publishedSlug !== null &&
        translation.publishedSlug !== translation.slug
      ) {
        const fromPath = pathFor(
            translation.publishedSlug,
            input.locale,
            site.defaultLocale,
          ),
          toPath = pathFor(translation.slug, input.locale, site.defaultLocale);
        await tx.redirect.upsert({
          where: { siteId_fromPath: { siteId, fromPath } },
          create: { siteId, fromPath, toPath },
          update: { toPath },
        });
      }
      await tx.pageTranslation.update({
        where: { id: translation.id },
        data: {
          publishedRevisionId: revision.id,
          publishedSlug: translation.slug,
        },
      });
    } else {
      if (page.type === "HOME" || page.type === "MENU")
        throw new AppError(
          422,
          "Essential Home and Menu routes cannot be unpublished or archived.",
        );
      await tx.pageTranslation.updateMany({
        where: {
          pageId: id,
          ...(input.operation === "archive" ? {} : { locale: input.locale }),
        },
        data: { publishedRevisionId: null, publishedSlug: null },
      });
    }
    const live = await tx.pageTranslation.count({
      where: { pageId: id, publishedRevisionId: { not: null } },
    });
    const updated = await tx.page.update({
      where: { id, version: input.version },
      data: {
        version: { increment: 1 },
        status:
          input.operation === "archive"
            ? "ARCHIVED"
            : live
              ? "PUBLISHED"
              : "DRAFT",
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
        action: "page." + input.operation,
        targetType: "Page",
        targetId: id,
        after: { locale: input.locale },
      },
    });
    return updated;
  };
  const result = execution
    ? await mutate(execution.tx)
    : await db.$transaction(mutate);
  if (!execution) invalidateSite(siteId);
  return result;
}
