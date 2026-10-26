import { normalizeDishTranslation } from "@/modules/rich-text";
import { z } from "zod";
import { schemas, type Resource } from "@/modules/cms";
import {
  templateSchema,
  slideSchema,
  validateField,
  type DynamicField,
} from "@/modules/signage";
import { mediaIds } from "@/modules/sections/schema";
import { safeHref, httpUrl } from "@/modules/security";
import { type AiChange, type AiScope, sameValue } from "./contracts";
import {
  assertSafeDraft,
  draftShape,
  normalizeSectionDrafts,
} from "./draft-shape";

const excluded = new Set([
  "version",
  "status",
  "imageId",
  "imageIds",
  "logoId",
  "alternativeLogoId",
  "faviconId",
  "socialImageId",
  "enabled",
  "isDefault",
  "position",
]);
export function editableSchemas(
  scope: AiScope,
  fields: DynamicField[] = [],
): Record<string, z.ZodType> {
  if (scope === "media")
    return { alt: z.string().max(500), caption: z.string().max(2000) };
  if (scope === "banners")
    return Object.fromEntries(
      fields
        .filter((f) => f.type !== "IMAGE")
        .map((f) => [f.key, z.unknown().transform((v) => validateField(f, v))]),
    );
  const shape =
    scope === "templates"
      ? templateSchema.shape
      : scope === "slides"
        ? slideSchema.shape
        : schemas[scope as Resource].shape;
  // Identity and activation are controlled explicitly by the employee, never inferred by AI.
  return Object.fromEntries(
    Object.entries(shape).filter(
      ([key]) =>
        !excluded.has(key) &&
        !(scope === "pages" && key === "type") &&
        !(scope === "navigation" && key === "key"),
    ),
  );
}

export function projectDraft(
  draft: Record<string, unknown>,
  validators: Record<string, z.ZodType>,
) {
  return Object.fromEntries(
    Object.keys(validators)
      .filter((key) => Object.hasOwn(draft, key))
      .map((key) => [key, draft[key]]),
  );
}

function imageReferences(value: unknown): string[] {
  const refs = [...mediaIds(value)];
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "IMAGE" && node.key)
      refs.push("IMAGE_FIELD:" + JSON.stringify(node));
    for (const [key, child] of Object.entries(node)) {
      if ((key === "imageIds" || key === "gallery") && Array.isArray(child))
        refs.push(...(child.filter((v) => typeof v === "string") as string[]));
      if (node.type === "image")
        refs.push("INLINE_IMAGE:" + JSON.stringify(node));
      visit(child);
    }
  };
  visit(value);
  return refs.sort();
}

function mergeTranslations(before: any[], after: any[], locales: string[]) {
  if (!Array.isArray(after)) throw new Error("Translations must be a list.");
  if (after.some((t) => !locales.includes(t.locale)))
    throw new Error("The assistant changed an unrequested language.");
  const merged = before.map((old) => ({
    ...old,
    ...(after.find((t) => t.locale === old.locale) ?? {}),
  }));
  return [
    ...merged,
    ...after.filter((t) => !before.some((old) => old.locale === t.locale)),
  ];
}

export function validateChanges(
  scope: AiScope,
  baseline: Record<string, any>,
  raw: Array<{ field: string; valueJson: string }>,
  locales: string[],
  fields: DynamicField[] = [],
  draftWarnings?: Array<{ field: string; message: string }>,
): AiChange[] {
  const validators = editableSchemas(scope, fields);
  if (new Set(raw.map((c) => c.field)).size !== raw.length)
    throw new Error("Duplicate generated fields.");
  const destinationType =
    scope === "actions"
      ? JSON.parse(
          raw.find((c) => c.field === "type")?.valueJson ??
            JSON.stringify(baseline.type ?? "PAGE"),
        )
      : null;
  return raw.map(({ field, valueJson }) => {
    if (!Object.hasOwn(validators, field))
      throw new Error("The assistant attempted to change a protected field.");
    let value = JSON.parse(valueJson);
    const old = baseline[field];
    const parse = (schema: z.ZodType, candidate: any) => {
      const parsed = schema.safeParse(candidate);
      if (parsed.success) return parsed.data;
      if (!draftWarnings) throw parsed.error;
      for (const issue of parsed.error.issues.slice(0, 12))
        draftWarnings.push({
          field,
          message: `${issue.path.join(".") || field}: ${issue.message}`,
        });
      return draftShape(schema, candidate, old);
    };
    if (scope === "actions" && field === "destination" && value) {
      const valid =
        destinationType === "PHONE"
          ? typeof value === "string" && /^\+?[\d ().-]+$/.test(value)
          : destinationType === "EMAIL"
            ? z.email().safeParse(value).success
            : ["EXTERNAL", "DIRECTIONS"].includes(destinationType)
              ? httpUrl.safeParse(value).success
              : Boolean(safeHref(value));
      if (!valid && !draftWarnings)
        throw new Error("Unsafe action destination.");
      if (!valid)
        draftWarnings!.push({
          field,
          message: "Correct this destination before saving.",
        });
    }
    if (field === "translations") {
      // Validate only translations being edited: unrelated incomplete drafts remain untouched.
      if (!Array.isArray(value))
        throw new Error("Translations must be a list.");
      const submitted = parse(
        validators[field],
        value.map((t: any) => ({
          ...(old ?? []).find((v: any) => v.locale === t.locale),
          ...(scope === "items" ? normalizeDishTranslation(t) : t),
        })),
      ) as any[];
      value = mergeTranslations(old ?? [], submitted, locales);
    } else if (scope === "locales" && field === "strings") {
      const entries = parse(validators[field], value) as Array<{
        key: string;
        value: string;
      }>;
      if (new Set(entries.map((entry) => entry.key)).size !== entries.length)
        throw new Error("Duplicate dictionary keys.");
      value = [
        ...new Map(
          [...(old ?? []), ...entries].map((entry: any) => [entry.key, entry]),
        ).values(),
      ];
    } else if (scope === "pages" && field === "sections") {
      if (!Array.isArray(value)) throw new Error("Sections must be a list.");
      value = parse(
        validators[field],
        value.map((section: any) => {
          const previous = (old ?? []).find(
            (s: any) => s.id && s.id === section.id,
          );
          return {
            ...previous,
            ...section,
            config: { ...previous?.config, ...section.config },
            translations: section.translations?.map((translation: any) => {
              const original = previous?.translations?.find(
                (t: any) => t.locale === translation.locale,
              );
              return {
                ...original,
                ...translation,
                content: { ...original?.content, ...translation.content },
              };
            }),
          };
        }),
      );
      if (draftWarnings) value = normalizeSectionDrafts(value);
      value = value.map((section: any) => {
        const previous = (old ?? []).find(
          (s: any) => s.id && s.id === section.id,
        );
        section.translations = mergeTranslations(
          previous?.translations ?? [],
          section.translations,
          locales,
        );
        return section;
      });
      // Changing structure must not silently erase unrequested translations.
      if (
        (old ?? []).some(
          (s: any) =>
            s.translations?.some((t: any) => !locales.includes(t.locale)) &&
            !value.some((n: any) => n.id === s.id),
        )
      )
        throw new Error("Keep existing sections that contain other languages.");
    } else {
      value = parse(validators[field], value);
    }
    assertSafeDraft(value, field);
    if (!sameValue(imageReferences(old), imageReferences(value)))
      throw new Error("Image selections must remain unchanged.");
    if (scope === "templates" && field === "fields") {
      // Template definitions can describe image slots, but cannot introduce arbitrary rendering code.
      const merged = { name: baseline.name || "Template", fields: value };
      parse(templateSchema, merged);
    }
    return { field, value };
  });
}

/** Every generated reference must come from this site's explicitly supplied catalogue. */
export function validateReferences(
  changes: AiChange[],
  references: Record<string, string[]>,
) {
  const visit = (value: any, key = "") => {
    if (value == null || value === "") return;
    if (Object.hasOwn(references, key)) {
      const ids = Array.isArray(value) ? value : [value];
      if (ids.some((id) => !references[key].includes(id)))
        throw new Error("Choose an existing reference from this restaurant.");
    }
    if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value)) visit(v, k);
  };
  changes.forEach((c) => visit(c.value, c.field));
}
