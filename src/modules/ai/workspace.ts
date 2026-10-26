import { z } from "zod";
import { schemas } from "@/modules/cms";
import { templateSchema, slideSchema } from "@/modules/signage";
import { safeHref } from "@/modules/security";
export const workspaceResources = [
  "profile",
  "branding",
  "locations",
  "categories",
  "items",
  "tags",
  "locales",
  "integrations",
  "actions",
  "pages",
  "navigation",
  "media",
  "templates",
  "banners",
  "slides",
] as const;
export const workspaceResourceSchema = z.enum(workspaceResources);
export type WorkspaceResource = z.infer<typeof workspaceResourceSchema>;
export const bannerDraftSchema = z
  .object({
    templateId: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
    menuCategoryId: z.string().nullable().optional(),
    menuItemId: z.string().nullable().optional(),
    sourceLocale: z.string().min(1),
    version: z.number().optional(),
  })
  .refine(
    (v) => !(v.menuCategoryId && v.menuItemId),
    "Choose a category or a dish, not both.",
  );
export const workspaceSchemas = {
  ...schemas,
  media: z.object({ alt: z.string().max(2000), caption: z.string().max(2000) }),
  templates: templateSchema,
  banners: bannerDraftSchema,
  slides: slideSchema,
};
export const factSchema = z.object({
  field: z.string().max(150),
  evidence: z.string().min(1).max(10000),
});
export const stageSchema = z.object({
  resource: workspaceResourceSchema,
  key: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  recordId: z.string().max(100).nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
  facts: z.array(factSchema).max(100).default([]),
});
export type DraftOperation = {
  id?: string;
  key: string;
  resource: string;
  targetId: string;
  isNew: boolean;
  payload: any;
  baseline?: any;
  baselineHash?: string | null;
  facts?: any;
  manual?: boolean;
  issues?: any;
};
export type DraftIssue = {
  code?: "FACT_REVIEW_REQUIRED";
  field: string;
  message: string;
  severity: "error" | "warning";
};
export const activeRunStates = ["QUEUED", "RUNNING"];
export function draftIssues(
  resource: WorkspaceResource,
  payload: unknown,
): DraftIssue[] {
  const parsed = workspaceSchemas[resource].safeParse(payload);
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
        severity: "error",
      }));
}
/** Reject executable content even when a draft has ordinary validation errors. */
export function assertSafeDraft(value: unknown, depth = 0): void {
  if (depth > 30) throw new Error("Content nesting is too deep.");
  if (
    typeof value === "string" &&
    /<\s*(script|iframe|object|embed)\b|<[^>]*\bon[a-z]+\s*=|javascript\s*:|data\s*:\s*text\/html/i.test(
      value,
    )
  )
    throw new Error("Remove unsafe executable content.");
  if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("Unsupported content key.");
      if (
        [
          "href",
          "url",
          "destination",
          "canonicalUrl",
          "directionsUrl",
        ].includes(key) &&
        typeof item === "string" &&
        item &&
        !safeHref(item) &&
        !["destination"].includes(key)
      )
        throw new Error("Use a safe destination URL.");
      assertSafeDraft(item, depth + 1);
    }
}
export function dependencyOrder(
  operations: DraftOperation[],
): DraftOperation[] {
  const byId = new Map(operations.map((op) => [op.targetId, op]));
  const result: DraftOperation[] = [];
  const visiting = new Set<string>(),
    done = new Set<string>();
  function visit(op: DraftOperation) {
    if (done.has(op.key)) return;
    if (visiting.has(op.key))
      throw new Error(
        "Circular dependencies: link pages through actions after creating their page records.",
      );
    visiting.add(op.key);
    const walk = (v: any, key = "") => {
      if (typeof v === "string" && v !== op.targetId && /Id$|Ids$/.test(key)) {
        const other = byId.get(v);
        if (other) visit(other);
      } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
      else if (v && typeof v === "object")
        Object.entries(v).forEach(([k, x]) => walk(x, k));
    };
    // Page records are first created without sections to support page/action cycles.
    if (op.resource !== "pages") walk(op.payload);
    if (op.resource !== "locales")
      operations.filter((x) => x.resource === "locales").forEach(visit);
    visiting.delete(op.key);
    done.add(op.key);
    result.push(op);
  }
  operations.forEach(visit);
  return result;
}
export function labelDraft(op: DraftOperation): string {
  return (
    op.payload?.internalName ||
    op.payload?.translations?.find((t: any) => t.name || t.title || t.label)
      ?.name ||
    op.payload?.translations?.[0]?.title ||
    op.payload?.translations?.[0]?.label ||
    op.payload?.name ||
    op.payload?.label ||
    op.payload?.alt ||
    op.payload?.key ||
    op.key
  );
}

export function structurallyEditable(payload: any): boolean {
  for (const key of [
    "translations",
    "sections",
    "variants",
    "items",
    "hours",
    "exceptions",
    "socials",
    "cuisines",
    "strings",
    "fields",
    "bannerIds",
    "tagIds",
    "imageIds",
  ])
    if (payload[key] !== undefined && !Array.isArray(payload[key]))
      return false;
  if (payload.translations?.some((t: any) => !t || typeof t !== "object"))
    return false;
  if (
    payload.sections?.some(
      (s: any) =>
        !s ||
        !s.config ||
        typeof s.config !== "object" ||
        !Array.isArray(s.translations) ||
        !s.translations.every(
          (t: any) => t && t.content && typeof t.content === "object",
        ),
    )
  )
    return false;
  return true;
}
