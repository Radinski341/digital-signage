import { describe, expect, it } from "vitest";
import { prepareDraftChanges } from "@/server/ai/draft-output";
const raw = (field: string, value: unknown) => ({
  field,
  valueJson: JSON.stringify(value),
});
const input = {
  scope: "categories" as const,
  draft: {},
  locales: ["en"],
  fields: [],
  allowedFields: ["translations", "slug"],
  references: {},
  translationOnly: false,
};
describe("editable AI draft delivery", () => {
  it("passes incomplete and overlong text to the form with actionable warnings", () => {
    const result = prepareDraftChanges({
      ...input,
      raw: [
        raw("translations", [
          {
            locale: "en",
            name: "",
            description: "Long description. ".repeat(150),
          },
        ]),
        raw("slug", "A Slug To Fix"),
      ],
    });
    expect(result.changes).toHaveLength(2);
    expect((result.changes[0].value as any[])[0].description).toContain(
      "Long description.",
    );
    expect(result.changes[1].value).toBe("A Slug To Fix");
    expect(result.warnings.map((warning) => warning.field)).toEqual(
      expect.arrayContaining(["translations", "slug"]),
    );
    expect(result.unapplied).toEqual([]);
  });
  it("preserves useful fields when another field is protected or structurally malformed", () => {
    const result = prepareDraftChanges({
      ...input,
      raw: [
        raw("siteId", "foreign-site"),
        raw("translations", "This is useful copy in the wrong structure."),
        raw("slug", "soups"),
      ],
    });
    expect(result.changes).toEqual([{ field: "slug", value: "soups" }]);
    expect(result.unapplied).toHaveLength(2);
    expect(result.unapplied[1].text).toContain("useful copy");
  });
  it("keeps decimal price text editable, without accepting unsafe URLs or cross-site references", () => {
    const result = prepareDraftChanges({
      ...input,
      scope: "items",
      allowedFields: ["price", "categoryId"],
      references: { categoryId: ["own-category"] },
      raw: [raw("price", "12,50 EUR"), raw("categoryId", "foreign-category")],
    });
    expect(result.changes).toEqual([{ field: "price", value: "12,50 EUR" }]);
    expect(result.warnings[0].field).toBe("price");
    expect(result.unapplied[0].field).toBe("categoryId");
    const unsafe = prepareDraftChanges({
      ...input,
      scope: "actions",
      allowedFields: ["destination", "name"],
      raw: [raw("destination", "javascript:alert(1)"), raw("name", "Call us")],
    });
    expect(unsafe.changes).toEqual([{ field: "name", value: "Call us" }]);
    expect(unsafe.unapplied[0].field).toBe("destination");
  });
  it("normalizes plain-text section bodies and preserves missing image configuration", () => {
    const result = prepareDraftChanges({
      ...input,
      scope: "pages",
      allowedFields: ["sections"],
      raw: [
        raw("sections", [
          {
            type: "RICH_TEXT",
            translations: [
              {
                locale: "en",
                content: { body: "A carefully written restaurant story." },
              },
            ],
          },
        ]),
      ],
    });
    expect(result.unapplied).toEqual([]);
    expect(
      (result.changes[0].value as any[])[0].translations[0].content.body,
    ).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ text: "A carefully written restaurant story." }],
        },
      ],
    });
  });
  it("makes unquoted scalar text available directly in the field", () => {
    const result = prepareDraftChanges({
      ...input,
      scope: "media",
      allowedFields: ["caption"],
      raw: [{ field: "caption", valueJson: "A welcoming dining room." }],
    });
    expect(result.changes).toEqual([
      { field: "caption", value: "A welcoming dining room." },
    ]);
  });
  it("recovers wrapped and double-encoded arrays from model output", () => {
    const sections = [
      {
        type: "RICH_TEXT",
        config: {},
        translations: [{ locale: "en", content: { heading: "Our story" } }],
      },
    ];
    for (const value of [{ sections }, JSON.stringify(sections), sections[0]]) {
      const result = prepareDraftChanges({
        ...input,
        scope: "pages",
        allowedFields: ["sections"],
        raw: [raw("sections", value)],
      });
      expect(result.unapplied).toEqual([]);
      expect((result.changes[0].value as any[])[0].type).toBe("RICH_TEXT");
    }
  });
  it("recovers incomplete inner JSON without discarding generated section text", () => {
    const valueJson =
      '[{"type":"RICH_TEXT","config":{},"translations":[{"locale":"en","content":{"heading":"Our story"}}]}';
    const result = prepareDraftChanges({
      ...input,
      scope: "pages",
      allowedFields: ["sections"],
      raw: [{ field: "sections", valueJson }],
    });
    expect(result.unapplied).toEqual([]);
    expect(
      (result.changes[0].value as any[])[0].translations[0].content.heading,
    ).toBe("Our story");
    expect(result.warnings[0].message).toContain("Recovered");
  });
  it("preserves malformed banner lists as copyable text rather than crashing the editor", () => {
    const result = prepareDraftChanges({
      ...input,
      scope: "banners",
      allowedFields: ["dishes"],
      fields: [
        {
          key: "dishes",
          label: "Dishes",
          type: "TEXT",
          isArray: true,
          required: true,
        },
      ],
      raw: [raw("dishes", "Soup, salad and bread")],
    });
    expect(result.changes).toEqual([]);
    expect(result.unapplied[0].text).toBe("Soup, salad and bread");
  });
  it("keeps unsafe rich text and changed image selections out of the form", () => {
    const result = prepareDraftChanges({
      ...input,
      scope: "pages",
      allowedFields: ["sections", "internalName"],
      raw: [
        raw("sections", [
          {
            type: "RICH_TEXT",
            config: {},
            translations: [
              {
                locale: "en",
                content: {
                  body: {
                    type: "doc",
                    content: [{ type: "script", text: "alert(1)" }],
                  },
                },
              },
            ],
          },
        ]),
        raw("internalName", "New page"),
      ],
    });
    expect(result.changes).toEqual([
      { field: "internalName", value: "New page" },
    ]);
    expect(result.unapplied[0].field).toBe("sections");
  });
});
