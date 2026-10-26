import { describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ unstable_cache: (fn: any) => fn }));
import { validateChanges } from "@/modules/ai/scopes";
import { schemas } from "@/modules/cms";
import { assertSafeDraft } from "@/modules/ai/draft-shape";
import { textToRichDocument, richDocumentText } from "@/modules/rich-text";
const document = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "From our kitchen" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Freshly prepared", marks: [{ type: "bold" }] },
        { type: "text", text: " for your table." },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "A generous portion" }],
            },
          ],
        },
      ],
    },
  ],
};
const item = {
  categoryId: "category",
  slug: "dish",
  price: "10.00",
  currency: "EUR",
  status: "PUBLISHED",
  available: true,
  featured: false,
  translations: [{ locale: "en", name: "Dish", detailsDocument: document }],
  variants: [],
  tagIds: [],
  imageIds: [],
};
describe("rich dish descriptions and allergens", () => {
  it("converts legacy paragraphs and line breaks without losing text", () => {
    const plain = "First paragraph.\nSecond line.\n\nAnother paragraph.";
    const rich = textToRichDocument(plain);
    expect(rich.content).toHaveLength(2);
    expect(richDocumentText(rich)).toBe(plain);
  });
  it("validates structured descriptions and keeps a plain-text compatibility copy", () => {
    const parsed = schemas.items.parse(item);
    expect(parsed.translations[0].detailsDocument).toEqual(document);
    expect(parsed.translations[0].details).toContain("From our kitchen");
    expect(parsed.translations[0].details).toContain("A generous portion");
    expect(parsed.translations[0].details).not.toContain("**");
  });
  it("rejects scripts, unsafe links, malformed nodes and oversized writing", () => {
    for (const content of [
      { type: "doc", content: [{ type: "script", text: "alert(1)" }] },
      { type: "doc", content: "broken" },
      {
        type: "doc",
        content: [
          {
            type: "text",
            text: "unsafe",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      },
    ]) {
      expect(() =>
        schemas.items.parse({
          ...item,
          translations: [
            { locale: "en", name: "Dish", detailsDocument: content },
          ],
        }),
      ).toThrow();
      expect(() => assertSafeDraft({ detailsDocument: content })).toThrow();
    }
    expect(() =>
      schemas.items.parse({
        ...item,
        translations: [
          {
            locale: "en",
            name: "Dish",
            detailsDocument: textToRichDocument("x".repeat(20001)),
          },
        ],
      }),
    ).toThrow("20,000");
  });
  it("retains plain assistant output as editable structured text instead of dropping the form update", () => {
    const changes = validateChanges(
      "items",
      { translations: [{ locale: "en", name: "Dish" }] },
      [
        {
          field: "translations",
          valueJson: JSON.stringify([
            {
              locale: "en",
              name: "Dish",
              detailsDocument: "Useful writing from the assistant.",
            },
          ]),
        },
      ],
      ["en"],
    );
    expect(
      richDocumentText((changes[0].value as any[])[0].detailsDocument),
    ).toBe("Useful writing from the assistant.");
  });
  it("accepts formatted menu writing from the editor assistant without losing other languages", () => {
    const baseline = {
      translations: [
        { locale: "en", name: "Dish", details: "Old description" },
        { locale: "bg", name: "Ястие", details: "Запазено" },
      ],
    };
    const changes = validateChanges(
      "items",
      baseline,
      [
        {
          field: "translations",
          valueJson: JSON.stringify([
            { locale: "en", name: "Dish", detailsDocument: document },
          ]),
        },
      ],
      ["en"],
    );
    expect((changes[0].value as any[])[0].detailsDocument).toEqual(document);
    expect((changes[0].value as any[])[1]).toEqual(baseline.translations[1]);
  });
});
