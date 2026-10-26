import { db } from "@/server/db";
import type { Access } from "@/server/cms";
import { getPublicContent, pagePath } from "@/server/public";
import {
  workspaceSchemas,
  type WorkspaceResource,
} from "@/modules/ai/workspace";
import { ownedWorkspace, json } from "./workspace-data";
export async function projectWorkspace(access: Access, id: string) {
  const workspace = await ownedWorkspace(access, id);
  const [site, records, tags, media, templates, banners, slides, integrations] =
    await Promise.all([
      getPublicContent(access.siteId, true),
      db.page.findMany({
        where: { siteId: access.siteId },
        include: { translations: true },
      }),
      db.menuTag.findMany({
        where: { siteId: access.siteId },
        include: { translations: true },
      }),
      db.mediaAsset.findMany({
        where: { siteId: access.siteId },
      }),
      db.template.findMany({
        where: { siteId: access.siteId },
        include: { fields: { orderBy: { order: "asc" } } },
      }),
      db.banner.findMany({ where: { siteId: access.siteId } }),
      db.slide.findMany({
        where: { siteId: access.siteId },
        include: { items: { orderBy: { order: "asc" } } },
      }),
      db.orderingIntegration.findMany({ where: { siteId: access.siteId } }),
    ]);
  if (!site) throw new Error("Restaurant not found.");
  const revisions = await db.contentRevision.findMany({
    where: {
      id: {
        in: records.flatMap((p) =>
          p.translations.flatMap((t) =>
            t.publishedRevisionId ? [t.publishedRevisionId] : [],
          ),
        ),
      },
    },
  });
  const pages: any[] = records.flatMap((page) => {
    const translations = page.translations
      .filter((t) => t.publishedRevisionId)
      .map((t) => ({
        ...(
          revisions.find((r) => r.id === t.publishedRevisionId)?.snapshot as any
        )?.translation,
        publishedSlug: t.publishedSlug,
        publishedRevisionId: t.publishedRevisionId,
        sections:
          (
            revisions.find((r) => r.id === t.publishedRevisionId)
              ?.snapshot as any
          )?.sections || [],
      }));
    return translations.length
      ? [
          {
            id: page.id,
            type: page.type,
            internalName: page.internalName,
            translations,
          },
        ]
      : [];
  });
  const collections: any = {
    ...site,
    pages,
    tags: json(tags),
    media: json(media),
    templates: json(templates),
    banners: json(banners),
    slides: json(slides),
    integrations: json(integrations),
  };
  const invalid: string[] = [];
  for (const op of workspace.operations) {
    const parsed = workspaceSchemas[op.resource as WorkspaceResource].safeParse(
      op.payload,
    );
    if (!parsed.success) {
      invalid.push(op.key);
      continue;
    }
    const p: any = json(parsed.data),
      r = { ...p, id: op.targetId, siteId: access.siteId };
    if (op.resource === "locales" && p.isDefault)
      collections.defaultLocale = p.code;
    if (op.resource === "profile") {
      collections.profile = { ...site.profile, ...r };
      Object.assign(collections, {
        name: p.name,
        currency: p.currency,
        timeZone: p.timeZone,
        domain: p.domain,
      });
    } else if (op.resource === "branding")
      collections.branding = { ...site.branding, ...r };
    else {
      const key = op.resource;
      const list = collections[key] || [];
      const previous = list.find((v: any) => v.id === op.targetId);
      if (key === "media") Object.assign(r, previous);
      if (key === "media") Object.assign(r, p);
      if (key === "pages")
        r.translations = p.translations.map((t: any) => ({
          ...t,
          publishedSlug: t.slug,
          publishedRevisionId: `proposal-${op.id}`,
          sections: p.sections.map((s: any, position: number) => ({
            ...s,
            position,
          })),
        }));
      if (key === "items")
        Object.assign(r, {
          status: "PUBLISHED",
          tags: p.tagIds.map((tagId: string) => ({ tagId })),
          images: p.imageIds.map((mediaId: string) => ({ mediaId })),
        });
      if (key === "locations") {
        r.hours = p.hours.map((h: any, position: number) => ({
          ...h,
          position,
        }));
        r.exceptions = p.exceptions;
      }
      if (key === "navigation")
        r.items = p.items.map((item: any, position: number) => ({
          ...item,
          id: item.id || `${op.targetId}-${position}`,
          position,
        }));
      if (key === "templates") {
        r.key = previous?.key || `proposal-${op.targetId}`;
        r.fields = p.fields;
      }
      if (key === "slides")
        r.items = p.bannerIds.map((bannerId: string, order: number) => ({
          bannerId,
          order,
        }));
      collections[key] = [...list.filter((v: any) => v.id !== op.targetId), r];
    }
  }
  collections.items = collections.items
    .filter((i: any) => i.status === "PUBLISHED")
    .map((item: any) => ({
      ...item,
      tags: (item.tags || [])
        .map((v: any) => ({
          ...v,
          tag: collections.tags.find((t: any) => t.id === v.tagId),
        }))
        .filter((v: any) => v.tag),
    }));
  collections.categories = collections.categories
    .filter((c: any) => c.enabled)
    .sort((a: any, b: any) => a.position - b.position);
  collections.locales = collections.locales.filter((l: any) => l.enabled);
  collections.navigation = collections.navigation.map((n: any) => ({
    ...n,
    items: n.items
      .filter((i: any) => i.enabled)
      .map((i: any) => ({
        ...i,
        page: collections.pages.find((p: any) => p.id === i.pageId),
      })),
  }));
  collections.actions = collections.actions
    .filter((a: any) => a.enabled)
    .map((a: any) => ({
      ...a,
      page: collections.pages.find((p: any) => p.id === a.pageId),
      integration:
        collections.integrations?.find((p: any) => p.id === a.integrationId) ||
        a.integration,
    }));
  // getPublicContent includes integrations on actions; load all only for projection resolution.
  collections.previewBase = `/preview/site/${id}`;
  return {
    workspace,
    site: collections,
    pages: collections.pages as any[],
    invalid,
  };
}
export function proposalPagePath(site: any, page: any, locale: string) {
  const translation =
    page.translations.find((t: any) => t.locale === locale) ||
    page.translations.find((t: any) => t.locale === site.defaultLocale);
  return translation
    ? site.previewBase +
        pagePath(translation.slug, translation.locale, site.defaultLocale)
    : null;
}
