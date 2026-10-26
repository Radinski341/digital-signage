import { createElement, ReactNode } from "react";
import { RichNode, validRichText } from "@/modules/sections/schema";
import { safeHref } from "@/modules/security";
import { asset, PublicContent } from "@/server/public";
export default function RichText({
  document,
  site,
}: {
  document?: RichNode;
  site: PublicContent;
}) {
  if (!document || !validRichText(document)) return null;
  function render(node: RichNode, key: string): ReactNode {
    if (node.type === "text") {
      let text: ReactNode = node.text;
      for (const mark of node.marks ?? []) {
        if (mark.type === "link") {
          const href = safeHref(mark.attrs?.href);
          if (href)
            text = (
              <a
                href={
                  site.previewBase && href.startsWith("/")
                    ? site.previewBase + href
                    : href
                }
                rel="noopener noreferrer"
              >
                {text}
              </a>
            );
        } else {
          const tag = {
            bold: "strong",
            italic: "em",
            underline: "u",
            strike: "s",
          }[mark.type];
          if (tag) text = createElement(tag, {}, text);
        }
      }
      return <span key={key}>{text}</span>;
    }
    if (node.type === "image") {
      const image = asset(site, node.attrs?.mediaId);
      return image ? (
        <figure key={key}>
          <img
            src={image.url}
            width={image.width}
            height={image.height}
            alt={node.attrs?.alt || image.alt}
            loading="lazy"
          />
          {image.caption && <figcaption>{image.caption}</figcaption>}
        </figure>
      ) : null;
    }
    if (node.type === "hardBreak") return <br key={key} />;
    if (node.type === "horizontalRule") return <hr key={key} />;
    const children = node.content?.map((n, i) => render(n, `${key}-${i}`));
    if (node.type === "doc")
      return (
        <div key={key} className="prose-content">
          {children}
        </div>
      );
    const tag =
      node.type === "heading"
        ? `h${node.attrs?.level || 2}`
        : {
            paragraph: "p",
            bulletList: "ul",
            orderedList: "ol",
            listItem: "li",
            blockquote: "blockquote",
          }[node.type] || "div";
    return createElement(
      tag,
      {
        key,
        style: node.attrs?.textAlign
          ? { textAlign: node.attrs.textAlign }
          : undefined,
      },
      children,
    );
  }
  return render(document, "doc");
}
