import sanitize from "sanitize-html";
import { safeHref } from "@/modules/security";
export function sanitizeLegacyHtml(value: unknown) {
  return sanitize(String(value ?? ""), {
    allowedTags: [
      "p",
      "br",
      "h2",
      "h3",
      "h4",
      "strong",
      "em",
      "u",
      "ul",
      "ol",
      "li",
      "blockquote",
      "a",
    ],
    allowedAttributes: { a: ["href", "title"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_, attrs) => ({
        tagName: "a",
        attribs: (safeHref(attrs.href)
          ? { href: attrs.href, rel: "noopener noreferrer" }
          : {}) as Record<string, string>,
      }),
    },
  });
}
