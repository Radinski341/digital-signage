import { z } from "zod";
import { safeHref } from "@/modules/security";
export type RichNode = {
  type: string;
  text?: string;
  attrs?: Record<string, any>;
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
  content?: RichNode[];
};
const nodes = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "hardBreak",
  "horizontalRule",
  "image",
]);
const marks = new Set(["bold", "italic", "underline", "strike", "link"]);
export function validRichText(value: unknown): value is RichNode {
  let count = 0;
  function visit(node: any, depth: number): boolean {
    if (
      !node ||
      typeof node !== "object" ||
      ++count > 5000 ||
      depth > 20 ||
      !nodes.has(node.type)
    )
      return false;
    if (
      node.type === "text" &&
      (typeof node.text !== "string" || node.text.length > 100000)
    )
      return false;
    if (
      node.type === "image" &&
      (typeof node.attrs?.mediaId !== "string" || !node.attrs.mediaId)
    )
      return false;
    if (node.type === "heading" && ![2, 3, 4].includes(node.attrs?.level))
      return false;
    if (
      node.attrs?.textAlign &&
      !["left", "center", "right"].includes(node.attrs.textAlign)
    )
      return false;
    if (
      node.marks &&
      (!Array.isArray(node.marks) ||
        node.marks.some(
          (m: any) =>
            !marks.has(m.type) ||
            (m.type === "link" && !safeHref(m.attrs?.href)),
        ))
    )
      return false;
    return (
      !node.content ||
      (Array.isArray(node.content) &&
        node.content.every((n: any) => visit(n, depth + 1)))
    );
  }
  return visit(value, 0) && (value as RichNode).type === "doc";
}
export const richTextSchema = z.custom<RichNode>(
  validRichText,
  "Unsupported or unsafe rich text.",
);
const text = z.string().max(10000).default("");
export const sectionContentSchema = z.object({
  heading: text,
  subtitle: text,
  body: richTextSchema.optional(),
  caption: text,
  alt: text,
});
const refs = z.array(z.string().min(1)).max(100).default([]);
const image = z.string().nullable().optional();
export const sectionDefinitions = {
  HERO: {
    label: "Hero",
    schema: z.object({
      imageId: image,
      actionIds: refs,
      align: z.enum(["left", "center"]).default("left"),
      overlay: z.enum(["none", "light", "dark"]).default("dark"),
      variant: z.enum(["full", "split"]).default("full"),
    }),
  },
  RICH_TEXT: {
    label: "Rich text",
    schema: z.object({ width: z.enum(["normal", "wide"]).default("normal") }),
  },
  IMAGE_TEXT: {
    label: "Image + text",
    schema: z.object({
      imageId: image,
      actionIds: refs,
      placement: z.enum(["left", "right"]).default("left"),
    }),
  },
  IMAGE: { label: "Image", schema: z.object({ imageId: image }) },
  GALLERY: {
    label: "Gallery",
    schema: z.object({
      imageIds: refs,
      variant: z.enum(["grid", "carousel"]).default("grid"),
    }),
  },
  CTA: { label: "Call to action", schema: z.object({ actionIds: refs }) },
  MENU_HIGHLIGHTS: {
    label: "Menu highlights",
    schema: z.object({
      itemIds: refs,
      categoryIds: refs,
      limit: z.number().int().min(1).max(24).default(6),
    }),
  },
  OPENING_HOURS: {
    label: "Opening hours",
    schema: z.object({ locationId: image }),
  },
  CONTACT: {
    label: "Contact / location",
    schema: z.object({ locationId: image }),
  },
  LOCATIONS: {
    label: "Locations and map",
    schema: z.object({ locationId: image }),
  },
  SOCIAL_LINKS: { label: "Social links", schema: z.object({}) },
  DIVIDER: {
    label: "Spacer / divider",
    schema: z.object({
      size: z.enum(["small", "medium", "large"]).default("medium"),
      line: z.boolean().default(true),
    }),
  },
} as const;
export type SectionType = keyof typeof sectionDefinitions;
export const sectionSchema = z
  .object({
    id: z.string().optional(),
    type: z.enum(
      Object.keys(sectionDefinitions) as [SectionType, ...SectionType[]],
    ),
    hidden: z.boolean().default(false),
    config: z.record(z.string(), z.unknown()),
    translations: z
      .array(z.object({ locale: z.string(), content: sectionContentSchema }))
      .max(50),
  })
  .superRefine((section, ctx) => {
    const result = sectionDefinitions[section.type].schema.safeParse(
      section.config,
    );
    if (!result.success)
      for (const issue of result.error.issues)
        ctx.addIssue({
          code: "custom",
          path: ["config", ...issue.path],
          message: issue.message,
        });
  });
export function mediaIds(value: unknown): string[] {
  const found = new Set<string>();
  function visit(v: any) {
    if (!v || typeof v !== "object") return;
    for (const [key, item] of Object.entries(v)) {
      if (
        (key === "imageId" ||
          key === "mediaId" ||
          key === "socialImageId" ||
          key.endsWith("LogoId") ||
          key === "logoId" ||
          key === "faviconId") &&
        typeof item === "string" &&
        item
      )
        found.add(item);
      else if (key === "imageIds" && Array.isArray(item))
        item.forEach((id) => typeof id === "string" && found.add(id));
      else visit(item);
    }
  }
  visit(value);
  return [...found];
}
