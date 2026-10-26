import { z } from "zod";
import { validRichText, sectionDefinitions } from "@/modules/sections/schema";

/** Keep the value editable without enforcing publishing constraints such as lengths/required copy. */
export function draftShape(
  schema: z.ZodType,
  value: unknown,
  previous?: unknown,
): any {
  const root = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as any;
  function shape(rule: any, input: any, old: any, depth: number): any {
    if (depth > 25) throw new Error("Generated content is too deeply nested.");
    if (rule.$ref) rule = root.$defs?.[rule.$ref.split("/").pop()] ?? rule;
    if (input === undefined) {
      if (old !== undefined) return old;
      if (rule.default !== undefined) return rule.default;
      if (rule.type === "array") return [];
      if (rule.type === "object") input = {};
      else return undefined;
    }
    if (rule.anyOf) {
      const options = rule.anyOf;
      const branch =
        options.find(
          (r: any) =>
            r.type ===
            (input === null
              ? "null"
              : Array.isArray(input)
                ? "array"
                : typeof input),
        ) ?? options[0];
      return shape(branch, input, old, depth + 1);
    }
    if (rule.type === "object" || rule.properties) {
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("This field needs an object.");
      if (!rule.properties) return input;
      return Object.fromEntries(
        Object.entries(rule.properties ?? {})
          .map(([key, child]) => [
            key,
            shape(child, input[key], old?.[key], depth + 1),
          ])
          .filter(([, v]) => v !== undefined),
      );
    }
    if (rule.type === "array") {
      if (!Array.isArray(input) || input.length > 500)
        throw new Error("This field needs a bounded list.");
      return input.map((item, index) =>
        shape(
          rule.items ?? {},
          item,
          Array.isArray(old)
            ? (old.find(
                (v: any) =>
                  (v?.id && v.id === item?.id) ||
                  (v?.locale && v.locale === item?.locale),
              ) ?? old[index])
            : undefined,
          depth + 1,
        ),
      );
    }
    if (rule.type === "string" && typeof input !== "string") {
      if (typeof input === "number" || input === null)
        return input === null ? "" : String(input);
      throw new Error("This field needs text.");
    }
    if (rule.type === "number" || rule.type === "integer") {
      if (typeof input !== "number" || !Number.isFinite(input))
        throw new Error("This field needs a number.");
    }
    if (rule.type === "boolean" && typeof input !== "boolean")
      throw new Error("This field needs a checkbox value.");
    return input;
  }
  return shape(root, value, previous, 0);
}

export function assertSafeDraft(value: unknown, key = "", depth = 0) {
  if (depth > 25) throw new Error("Generated content is too deeply nested.");
  if (
    typeof value === "string" &&
    /^(?:href|url|destination|canonicalUrl|website|domain|directionsUrl)$/i.test(
      key,
    )
  ) {
    if (
      /^\s*(?:javascript|data|vbscript|file|blob):/i.test(value) ||
      /[\u0000-\u001f\u007f\\]/.test(value) ||
      /^\s*\/\//.test(value)
    )
      throw new Error("Unsafe link was not applied.");
    try {
      const url = new URL(value);
      if (url.username || url.password)
        throw new Error("Unsafe link was not applied.");
    } catch (error) {
      if ((error as Error).message === "Unsafe link was not applied.")
        throw error;
    }
  }
  if (
    ["body", "detailsDocument"].includes(key) &&
    value != null &&
    !validRichText(value)
  )
    throw new Error("Unsupported rich text was not applied.");
  if (!value || typeof value !== "object") return;
  const node = value as any;
  if (["script", "iframe", "embed"].includes(node.type))
    throw new Error("Unsafe content was not applied.");
  for (const [childKey, child] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(childKey))
      throw new Error("Protected property was not applied.");
    assertSafeDraft(child, childKey, depth + 1);
  }
}

export function normalizeSectionDrafts(value: any[]) {
  return value.map((section) => {
    if (!Object.hasOwn(sectionDefinitions, section.type))
      throw new Error("This section type is not supported by the editor.");
    const definition =
      sectionDefinitions[section.type as keyof typeof sectionDefinitions];
    const config = draftShape(definition.schema, section.config ?? {});
    return {
      ...section,
      config,
      translations: (section.translations ?? []).map((t: any) => ({
        ...t,
        content: {
          ...t.content,
          ...(typeof t.content?.body === "string"
            ? {
                body: {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: t.content.body }],
                    },
                  ],
                },
              }
            : {}),
        },
      })),
    };
  });
}
