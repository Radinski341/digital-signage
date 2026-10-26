import { z } from "zod";
export const fieldSchema = z.object({
  key: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
    .refine((k) => !["constructor", "prototype", "__proto__"].includes(k)),
  label: z.string().trim().min(1).max(120),
  type: z.enum([
    "TEXT",
    "NUMBER",
    "IMAGE",
    "RICHTEXT",
    "BOOLEAN",
    "SELECT",
    "COLOR",
  ]),
  required: z.boolean().default(false),
  isArray: z.boolean().default(false),
  config: z.record(z.string(), z.unknown()).optional(),
});
export const templateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    fields: z.array(fieldSchema).min(1).max(40),
  })
  .refine(
    (t) => new Set(t.fields.map((f) => f.key)).size === t.fields.length,
    "Field keys must be unique",
  );
export const slideSchema = z.object({
  name: z.string().trim().min(1).max(120),
  speedMs: z.number().int().min(1500).max(3600000).default(8000),
  effect: z.enum(["FADE", "SLIDE"]).default("FADE"),
  bannerIds: z.array(z.string().min(1)).max(200),
  version: z.number().int().positive().optional(),
});
export type DynamicField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  isArray: boolean;
  config?: unknown;
};
export function validateField(field: DynamicField, value: unknown): unknown {
  const config = (field.config ?? {}) as Record<string, any>;
  let schema: z.ZodType;
  if (config.itemSchema && field.isArray) {
    const children: Record<string, z.ZodType> = {};
    for (const [key, definition] of Object.entries(
      config.itemSchema as Record<string, any>,
    )) {
      if (
        !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) ||
        ["constructor", "prototype"].includes(key)
      )
        throw new Error("Invalid field schema");
      const kind =
        typeof definition === "string" ? definition : definition.type;
      children[key] =
        kind === "NUMBER" ? z.number().finite() : z.string().max(20000);
    }
    schema = z.array(z.object(children)).max(100);
  } else {
    switch (field.type) {
      case "NUMBER":
        schema = z.number().finite();
        break;
      case "BOOLEAN":
        schema = z.boolean();
        break;
      case "COLOR":
        schema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
        break;
      case "SELECT":
        schema = z
          .string()
          .refine(
            (v) => Array.isArray(config.options) && config.options.includes(v),
            "Choose an available option",
          );
        break;
      default:
        schema = z.string().max(field.type === "RICHTEXT" ? 100000 : 20000);
    }
    if (field.isArray) schema = z.array(schema).max(100);
  }
  if (
    !field.required &&
    (value === undefined || value === null || value === "")
  )
    return field.isArray ? [] : null;
  if (
    field.required &&
    (value === "" || value == null || (Array.isArray(value) && !value.length))
  )
    throw new Error(`${field.label} is required`);
  return schema.parse(value);
}
