import { db } from "@/server/db";
import type { Access } from "@/server/cms";
import { reserved } from "@/server/cms";
import { workspaceModels } from "./workspace-data";
import {
  workspaceResources,
  type DraftIssue,
  type WorkspaceResource,
} from "@/modules/ai/workspace";
const references: Record<string, WorkspaceResource> = {
  categoryId: "categories",
  categoryIds: "categories",
  menuCategoryId: "categories",
  menuItemId: "items",
  itemIds: "items",
  actionId: "actions",
  actionIds: "actions",
  imageId: "media",
  imageIds: "media",
  mediaId: "media",
  logoId: "media",
  alternativeLogoId: "media",
  faviconId: "media",
  socialImageId: "media",
  locationId: "locations",
  pageId: "pages",
  integrationId: "integrations",
  templateId: "templates",
  bannerIds: "banners",
  tagIds: "tags",
};
export async function referenceIssues(access: Access, w: any) {
  const issues: Array<DraftIssue & { key: string }> = [];
  const uniqueFields: Partial<Record<WorkspaceResource, string>> = {
    locales: "code",
    tags: "key",
    categories: "slug",
    items: "slug",
    navigation: "key",
  };
  const records = Object.fromEntries(
    await Promise.all(
      workspaceResources.map(async (resource) => [
        resource,
        await (db[workspaceModels[resource]] as any).findMany({
          where: { siteId: access.siteId },
          select: {
            id: true,
            ...(uniqueFields[resource]
              ? { [uniqueFields[resource]!]: true }
              : {}),
          },
        }),
      ]),
    ),
  );
  const catalogs = Object.fromEntries(
    Object.entries(records).map(([resource, rows]) => [
      resource,
      new Set((rows as any[]).map((r) => r.id)),
    ]),
  );
  const proposedUniques = new Map<string, string>();
  for (const op of w.operations) catalogs[op.resource].add(op.targetId);
  const [pages, slugs, locales, tags] = await Promise.all([
    db.page.findMany({
      where: { siteId: access.siteId },
      select: { id: true, type: true, status: true },
    }),
    db.pageTranslation.findMany({
      where: { siteId: access.siteId },
      select: { pageId: true, locale: true, slug: true, publishedSlug: true },
    }),
    db.siteLocale.findMany({
      where: { siteId: access.siteId },
      select: { code: true, enabled: true },
    }),
    db.menuTag.findMany({
      where: { siteId: access.siteId },
      include: { translations: true },
    }),
  ]);
  const enabled = new Set(locales.filter((l) => l.enabled).map((l) => l.code));
  const codes = new Set(locales.map((l) => l.code));
  for (const op of w.operations.filter((o: any) => o.resource === "locales")) {
    codes.add(op.payload.code);
    if (op.payload.enabled) enabled.add(op.payload.code);
    else enabled.delete(op.payload.code);
  }
  for (const locale of w.locales)
    if (!enabled.has(locale))
      issues.push({
        key: "languages",
        field: locale,
        message: `Include an enabled ${locale} language in the proposal.`,
        severity: "error",
      });
  const defaultChanges = w.operations.filter(
    (o: any) => o.resource === "locales" && o.payload.isDefault,
  );
  if (defaultChanges.length > 1)
    issues.push({
      key: "languages",
      field: "default",
      message: "Choose only one default language.",
      severity: "error",
    });
  const proposedSlugs = new Map<string, string>();
  const proposedPages = new Set(
    w.operations
      .filter((o: any) => o.resource === "pages")
      .map((o: any) => o.targetId),
  );
  const proposedTags = [
    ...tags,
    ...w.operations
      .filter((o: any) => o.resource === "tags")
      .map((o: any) => ({ ...o.payload, id: o.targetId })),
  ];
  for (const op of w.operations) {
    const add = (field: string, message: string, code?: DraftIssue["code"]) =>
      issues.push({
        key: op.key,
        field,
        message,
        severity: "error",
        ...(code ? { code } : {}),
      });
    function walk(value: any, key = "", path = "") {
      const resource = references[key];
      if (
        resource &&
        typeof value === "string" &&
        value &&
        !catalogs[resource].has(value)
      )
        add(
          path,
          "Choose an existing or proposed record from this restaurant.",
        );
      if (
        key === "pageId" &&
        value &&
        !proposedPages.has(value) &&
        pages.find((p) => p.id === value)?.status !== "PUBLISHED"
      )
        add(
          path,
          "Include this unpublished destination page in the proposal before linking to it.",
        );
      if (Array.isArray(value))
        value.forEach((v, i) => walk(v, key, path + "." + i));
      else if (value && typeof value === "object")
        Object.entries(value).forEach(([k, v]) =>
          walk(v, k, path ? path + "." + k : k),
        );
    }
    walk(op.payload);
    const uniqueField = uniqueFields[op.resource as WorkspaceResource];
    if (uniqueField && op.payload[uniqueField]) {
      const value = op.payload[uniqueField];
      if (
        records[op.resource].some(
          (r: any) => r.id !== op.targetId && r[uniqueField] === value,
        )
      )
        add(
          uniqueField,
          "This identifier already belongs to another record. Reuse that record or choose a different identifier.",
        );
      const key = op.resource + ":" + value,
        previous = proposedUniques.get(key);
      if (previous && previous !== op.targetId)
        add(uniqueField, "Two proposed records use this identifier.");
      proposedUniques.set(key, op.targetId);
    }
    if (op.resource === "pages") {
      const p = op.payload;
      const existing = pages.find((page) => page.id === op.targetId);
      if (existing?.status === "ARCHIVED")
        add(
          "status",
          "Restore the archived page in the CMS before including it.",
        );
      if (existing && existing.type !== "CUSTOM" && existing.type !== p.type)
        add("type", "Preserve the existing system page type.");
      if (
        op.isNew &&
        p.type !== "CUSTOM" &&
        pages.some((page) => page.type === p.type)
      )
        add(
          "type",
          "Reuse the existing system page instead of creating a duplicate.",
        );
      for (const t of Array.isArray(p.translations) ? p.translations : []) {
        if (!t || typeof t.slug !== "string") continue;
        if (
          reserved.has(t.slug) ||
          codes.has(t.slug) ||
          (p.type === "HOME" ? t.slug !== "" : !t.slug)
        )
          add(
            `translations.${t.locale}.slug`,
            "This URL conflicts with a reserved route.",
          );
        if (
          slugs.some(
            (s) =>
              s.pageId !== op.targetId &&
              s.locale === t.locale &&
              (s.slug === t.slug || s.publishedSlug === t.slug),
          )
        )
          add(
            `translations.${t.locale}.slug`,
            "Another page already uses this URL.",
          );
        const key = t.locale + ":" + t.slug,
          previous = proposedSlugs.get(key);
        if (previous && previous !== op.targetId)
          add(
            `translations.${t.locale}.slug`,
            "Two proposed pages use the same URL.",
          );
        proposedSlugs.set(key, op.targetId);
      }
      for (const [index, s] of (Array.isArray(p.sections)
        ? p.sections
        : []
      ).entries())
        if (s?.type === "HERO" && !s.hidden && Array.isArray(s.translations))
          for (const t of s.translations)
            if (!t.content?.heading?.trim())
              add(
                `sections.${index}.${t.locale}.heading`,
                "Add a heading to this visible hero.",
              );
    }
    if (
      op.resource === "items" &&
      !op.manual &&
      Array.isArray(op.payload.tagIds) &&
      JSON.stringify(op.payload.tagIds) !== JSON.stringify(op.baseline?.tagIds)
    ) {
      const evidence =
        (Array.isArray(op.facts) ? op.facts : [])
          .find((f: any) => f.field === "tagIds")
          ?.evidence?.toLowerCase() || "";
      for (const id of op.payload.tagIds) {
        const tag = proposedTags.find((t) => t.id === id);
        const labels =
          tag?.translations?.map((t: any) => t.name.toLowerCase()) || [];
        if (tag && !labels.some((label: string) => evidence.includes(label)))
          add(
            "tagIds",
            "Quote explicit employee confirmation of each dietary/allergen label; never infer it from photographs or missing information.",
            "FACT_REVIEW_REQUIRED",
          );
      }
    }
  }
  return issues;
}
