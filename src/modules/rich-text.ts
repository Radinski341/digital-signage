import type { RichNode } from "./sections/schema";

export function textToRichDocument(text = ""): RichNode {
  return {
    type: "doc",
    content: text.trim()
      ? text.split(/\n\s*\n/).map((paragraph) => ({
          type: "paragraph",
          content: paragraph
            .split("\n")
            .flatMap((line, index): RichNode[] => [
              ...(index ? [{ type: "hardBreak" }] : []),
              ...(line ? [{ type: "text", text: line }] : []),
            ]),
        }))
      : [{ type: "paragraph" }],
  };
}
export function richDocumentText(document: RichNode, depth = 0): string {
  if (depth > 20) return "";
  if (!document || typeof document !== "object") return "";
  if (document.type === "text") return document.text || "";
  if (document.type === "hardBreak") return "\n";
  const separator = [
    "doc",
    "bulletList",
    "orderedList",
    "blockquote",
    "listItem",
  ].includes(document.type)
    ? "\n\n"
    : "";
  return (Array.isArray(document.content) ? document.content : [])
    .map((node) => richDocumentText(node, depth + 1))
    .join(separator)
    .trim();
}

/** Keep legacy assistant writing editable when a provider returns text instead of a document. */
export function normalizeDishTranslation(translation: any) {
  if (
    !translation ||
    typeof translation !== "object" ||
    Array.isArray(translation)
  )
    return translation;
  if (typeof translation.detailsDocument === "string")
    return {
      ...translation,
      detailsDocument: textToRichDocument(translation.detailsDocument),
    };
  if (
    !Object.hasOwn(translation, "detailsDocument") &&
    typeof translation.details === "string"
  )
    return {
      ...translation,
      detailsDocument: textToRichDocument(translation.details),
    };
  return translation;
}
