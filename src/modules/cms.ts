import { z } from "zod";
import { colorSchema, httpUrl, slugSchema } from "./security";
import { richDocumentText } from "./rich-text";
import { richTextSchema, sectionSchema } from "./sections/schema";
const optionalText = z.string().max(2000).default("");
const ref = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().min(1).nullable().optional(),
);
const locale = z
  .string()
  .max(35)
  .refine((v) => {
    try {
      return Intl.getCanonicalLocales(v)[0] === v;
    } catch {
      return false;
    }
  }, "Use a canonical locale such as en or bg");
const version = z.number().int().positive().optional();
const translations = <T extends z.ZodRawShape>(shape: T) =>
  z
    .array(z.object({ locale, ...shape }))
    .min(1)
    .max(50)
    .refine(
      (v) =>
        new Set(v.map((t) => (t as { locale: string }).locale)).size ===
        v.length,
      "Duplicate languages",
    );
const name = z.string().trim().min(1).max(200);
const price = z
  .string()
  .regex(
    /^\d{1,15}(?:\.\d{1,4})?$/,
    "Enter a nonnegative price, up to four decimal places",
  );
const currency = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine(
    (v) => Intl.supportedValuesOf("currency").includes(v),
    "Choose a supported currency",
  );
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const interval = z
  .object({ opens: clock, closes: clock, nextDay: z.boolean().default(false) })
  .refine(
    (v) => (v.nextDay ? v.closes <= v.opens : v.closes > v.opens),
    "Closing must follow opening; use next day for overnight hours",
  );
export const schemas = {
  profile: z.object({
    version,
    name,
    legalName: optionalText,
    phone: optionalText,
    email: z.union([z.literal(""), z.email()]).default(""),
    website: z.union([z.literal(""), httpUrl]).default(""),
    priceRange: optionalText,
    cuisines: z
      .array(z.string().max(100))
      .max(30)
      .transform((values) => values.map((v) => v.trim()).filter(Boolean)),
    currency,
    timeZone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Choose an IANA time zone"),
    domain: z.union([z.literal(""), httpUrl]).default(""),
    translations: translations({
      name,
      summary: optionalText,
      description: z.string().max(20000).default(""),
    }),
    socials: z.array(z.object({ label: name, url: httpUrl })).max(20),
  }),
  branding: z.object({
    version,
    primaryColor: colorSchema,
    accentColor: colorSchema,
    textColor: colorSchema,
    backgroundColor: colorSchema,
    surfaceColor: colorSchema,
    headingFont: z.enum(["serif", "system", "montserrat"]),
    bodyFont: z.enum(["serif", "system", "montserrat"]),
    radius: z.number().int().min(0).max(32),
    logoId: ref,
    alternativeLogoId: ref,
    faviconId: ref,
    socialImageId: ref,
  }),
  locations: z.object({
    version,
    name,
    address: name,
    city: name,
    postalCode: optionalText,
    country: z.string().regex(/^[A-Z]{2}$/),
    phone: optionalText,
    email: z.union([z.literal(""), z.email()]).default(""),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    directionsUrl: z.union([z.literal(""), httpUrl]).default(""),
    position: z.number().int().min(0).default(0),
    hours: z
      .array(
        interval.and(z.object({ weekday: z.number().int().min(0).max(6) })),
      )
      .max(56),
    exceptions: z
      .array(
        z.object({
          date: z.iso.date(),
          label: optionalText,
          closed: z.boolean(),
          intervals: z.array(interval).max(8),
        }),
      )
      .max(366),
  }),
  categories: z.object({
    version,
    slug: slugSchema,
    enabled: z.boolean().default(true),
    position: z.number().int().min(0).default(0),
    imageId: ref,
    translations: translations({ name, description: optionalText }),
  }),
  items: z.object({
    version,
    categoryId: z.string().min(1),
    slug: slugSchema,
    price,
    currency,
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
    available: z.boolean(),
    featured: z.boolean(),
    position: z.number().int().min(0).default(0),
    imageId: ref,
    actionId: ref,
    translations: translations({
      name,
      description: optionalText,
      details: z.string().max(20000).default(""),
      detailsDocument: z.preprocess(
        (value) => (value === null ? undefined : value),
        richTextSchema
          .refine(
            (value) => richDocumentText(value).length <= 20000,
            "Keep the dish description within 20,000 characters.",
          )
          .optional(),
      ),
      seoTitle: optionalText,
      seoDescription: optionalText,
    }).transform((rows) =>
      rows.map((row) =>
        row.detailsDocument
          ? { ...row, details: richDocumentText(row.detailsDocument) }
          : row,
      ),
    ),
    variants: z
      .array(z.object({ price, translations: translations({ name }) }))
      .max(30),
    tagIds: z.array(z.string()).max(100),
    imageIds: z.array(z.string()).max(20),
  }),
  tags: z.object({
    version,
    key: slugSchema,
    kind: z.enum(["DIETARY", "ALLERGEN"]),
    translations: translations({ name }),
  }),
  locales: z.object({
    version,
    code: locale,
    label: name,
    enabled: z.boolean(),
    direction: z.enum(["ltr", "rtl"]),
    isDefault: z.boolean().default(false),
    strings: z
      .array(
        z.object({
          key: z.string().regex(/^[a-z][a-zA-Z0-9.]{0,80}$/),
          value: z.string().min(1).max(1000),
        }),
      )
      .max(300),
  }),
  integrations: z.object({
    version,
    provider: name,
    label: name,
    url: httpUrl,
    enabled: z.boolean(),
    logoId: ref,
  }),
  actions: z
    .object({
      version,
      name,
      type: z.enum([
        "PAGE",
        "EXTERNAL",
        "PHONE",
        "EMAIL",
        "DIRECTIONS",
        "ORDERING",
      ]),
      destination: optionalText,
      pageId: ref,
      integrationId: ref,
      style: z.enum(["primary", "secondary", "text"]),
      icon: z.enum(["none", "phone", "map", "order", "arrow"]).default("none"),
      enabled: z.boolean(),
      newTab: z.boolean(),
      translations: translations({ label: name }),
    })
    .superRefine((a, ctx) => {
      if (a.type === "PAGE" && !a.pageId)
        ctx.addIssue({
          code: "custom",
          message: "Select a page",
          path: ["pageId"],
        });
      if (a.type === "ORDERING" && !a.integrationId)
        ctx.addIssue({
          code: "custom",
          message: "Select an ordering provider",
          path: ["integrationId"],
        });
      if (a.type === "EXTERNAL" && !httpUrl.safeParse(a.destination).success)
        ctx.addIssue({
          code: "custom",
          message: "Use an HTTP or HTTPS URL",
          path: ["destination"],
        });
      if (
        a.type === "PHONE" &&
        a.destination &&
        !/^\+?[\d ().-]+$/.test(a.destination)
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid phone number",
          path: ["destination"],
        });
      if (
        a.type === "EMAIL" &&
        a.destination &&
        !z.email().safeParse(a.destination).success
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid email",
          path: ["destination"],
        });
      if (
        a.type === "DIRECTIONS" &&
        a.destination &&
        !httpUrl.safeParse(a.destination).success
      )
        ctx.addIssue({
          code: "custom",
          message: "Use an HTTP or HTTPS URL",
          path: ["destination"],
        });
    }),
  pages: z.object({
    version,
    internalName: name,
    type: z.enum(["HOME", "MENU", "ABOUT", "CONTACT", "CUSTOM"]),
    translations: translations({
      slug: z
        .string()
        .max(100)
        .refine(
          (v) => v === "" || slugSchema.safeParse(v).success,
          "Use lowercase letters, numbers and hyphens",
        ),
      title: name,
      seoTitle: optionalText,
      seoDescription: z.string().max(500).default(""),
      canonicalUrl: z.union([z.literal(""), httpUrl]).default(""),
      socialImageId: ref,
      ogTitle: optionalText,
      ogDescription: optionalText,
      noIndex: z.boolean().default(false),
    }),
    sections: z.array(sectionSchema).max(100),
  }),
  navigation: z.object({
    version,
    key: z.enum(["header", "footer", "footer-info"]),
    items: z
      .array(
        z.object({
          id: z.string().optional(),
          pageId: ref,
          url: z.union([z.literal(""), httpUrl]).default(""),
          parentId: ref,
          enabled: z.boolean(),
          translations: translations({ label: name }),
        }),
      )
      .max(100),
  }),
  users: z.object({
    version,
    email: z.email(),
    role: z.enum(["OWNER", "ADMIN", "EDITOR"]),
    disabled: z.boolean().default(false),
    password: z
      .string()
      .min(12)
      .max(72)
      .refine(
        (v) => new TextEncoder().encode(v).length <= 72,
        "Use at most 72 UTF-8 bytes",
      )
      .optional(),
  }),
} as const;
export type Resource = keyof typeof schemas;
