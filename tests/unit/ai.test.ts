import { describe, expect, it } from "vitest";
import {
  AI_MODEL,
  mergeChanges,
  structuredAnswers,
  outputSchema,
} from "@/modules/ai/contracts";
import {
  editableSchemas,
  projectDraft,
  validateChanges,
  validateReferences,
} from "@/modules/ai/scopes";
const change = (field: string, value: unknown) => ({
  field,
  valueJson: JSON.stringify(value),
});
describe("modal assistant boundaries", () => {
  it("pins the requested model and constrains structured output fields", () => {
    expect(AI_MODEL).toBe("gpt-6-luna");
    expect(
      outputSchema(["caption"]).safeParse({
        message: "Done",
        questions: [],
        changes: [change("password", "unsafe")],
      }).success,
    ).toBe(false);
  });
  it("projects only permitted form data", () => {
    expect(
      projectDraft(
        { name: "Brand", password: "secret", logoId: "photo", version: 4 },
        editableSchemas("branding"),
      ),
    ).toEqual({});
    expect(Object.keys(editableSchemas("pages"))).not.toContain("type");
  });
  it("keeps later manual edits and supports undo comparisons", () => {
    expect(
      mergeChanges(
        { caption: "Manual", alt: "Before" },
        { caption: "Before", alt: "Before" },
        [
          { field: "caption", value: "AI" },
          { field: "alt", value: "AI alt" },
        ],
      ),
    ).toEqual({
      next: { caption: "Manual", alt: "AI alt" },
      conflicts: ["caption"],
      applied: [{ field: "alt", value: "AI alt" }],
    });
  });
  it("merges requested translations without erasing another locale", () => {
    const baseline = {
      translations: [
        { locale: "en", name: "Soup", description: "Original" },
        { locale: "bg", name: "Супа", description: "Описание" },
      ],
    };
    const result = validateChanges(
      "categories",
      baseline,
      [
        change("translations", [
          { locale: "en", description: "A warming soup" },
        ]),
      ],
      ["en"],
    );
    expect((result[0].value as any[])[0]).toMatchObject({
      name: "Soup",
      description: "A warming soup",
    });
    expect((result[0].value as any[])[1]).toEqual(baseline.translations[1]);
    expect(() =>
      validateChanges(
        "categories",
        baseline,
        [change("translations", [{ locale: "bg", name: "Changed" }])],
        ["en"],
      ),
    ).toThrow("unrequested");
  });
  it("rejects media changes, unsafe rich text and cross-site references", () => {
    expect(() =>
      validateChanges("items", {}, [change("imageId", "other-image")], ["en"]),
    ).toThrow("protected");
    expect(() =>
      validateChanges(
        "pages",
        {},
        [
          change("sections", [
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
        ],
        ["en"],
      ),
    ).toThrow();
    expect(() =>
      validateReferences([{ field: "categoryId", value: "other-site" }], {
        categoryId: ["own-category"],
      }),
    ).toThrow("restaurant");
  });
  it("preserves social image selections and SEO indexing while editing copy", () => {
    const baseline = {
      translations: [
        {
          locale: "en",
          title: "Story",
          slug: "story",
          noIndex: true,
          socialImageId: "approved-photo",
        },
      ],
    };
    const changes = validateChanges(
      "pages",
      baseline,
      [change("translations", [{ locale: "en", seoTitle: "Our story" }])],
      ["en"],
    );
    expect((changes[0].value as any[])[0]).toMatchObject({
      noIndex: true,
      socialImageId: "approved-photo",
      seoTitle: "Our story",
    });
    expect(() =>
      validateChanges(
        "pages",
        baseline,
        [
          change("translations", [
            { locale: "en", socialImageId: "replacement" },
          ]),
        ],
        ["en"],
      ),
    ).toThrow("Image selections");
  });
  it("serializes Q&A using stored questions and rejects invented questions", () => {
    const questions = [
      {
        id: "price",
        question: "What is the price?",
        kind: "text" as const,
        options: [],
        required: true,
      },
    ];
    expect(
      structuredAnswers(questions, [
        { questionId: "price", answer: "12.50 EUR" },
      ]),
    ).toEqual([
      {
        questionId: "price",
        question: "What is the price?",
        answer: "12.50 EUR",
      },
    ]);
    expect(() => structuredAnswers(questions, [])).toThrow("required");
    expect(() =>
      structuredAnswers(questions, [{ questionId: "password", answer: "bad" }]),
    ).toThrow("Invalid");
  });
  it("validates dynamic banner fields and protects image slots", () => {
    const fields = [
      {
        key: "title",
        label: "Title",
        type: "TEXT",
        required: true,
        isArray: false,
      },
      {
        key: "image",
        label: "Image",
        type: "IMAGE",
        required: false,
        isArray: false,
      },
    ];
    expect(
      validateChanges(
        "banners",
        {},
        [change("title", "Tonight's specials")],
        ["en"],
        fields,
      ),
    ).toEqual([{ field: "title", value: "Tonight's specials" }]);
    expect(() =>
      validateChanges(
        "banners",
        {},
        [change("image", "photo")],
        ["en"],
        fields,
      ),
    ).toThrow("protected");
  });
  it("validates destination values using the action type, including phone/email", () => {
    expect(
      validateChanges(
        "actions",
        { type: "PAGE" },
        [change("type", "PHONE"), change("destination", "+359 123 456")],
        ["en"],
      )[1].value,
    ).toBe("+359 123 456");
    expect(
      validateChanges(
        "actions",
        { type: "EMAIL" },
        [change("destination", "hello@example.test")],
        ["en"],
      )[0].value,
    ).toBe("hello@example.test");
    expect(() =>
      validateChanges(
        "actions",
        { type: "EXTERNAL" },
        [change("destination", "javascript:alert(1)")],
        ["en"],
      ),
    ).toThrow("Unsafe");
  });
  it("preserves unrelated dictionary overrides when translating one phrase", () => {
    const result = validateChanges(
      "locales",
      {
        strings: [
          { key: "menu", value: "Menu" },
          { key: "contact", value: "Contact" },
        ],
      },
      [change("strings", [{ key: "menu", value: "Меню" }])],
      ["en"],
    );
    expect(result[0].value).toEqual([
      { key: "menu", value: "Меню" },
      { key: "contact", value: "Contact" },
    ]);
  });
  it("preserves existing section content and image references when refining one text field", () => {
    const section = {
      id: "hero",
      type: "HERO",
      hidden: false,
      config: { imageId: "approved-photo" },
      translations: [
        {
          locale: "en",
          content: { heading: "Welcome", subtitle: "Original subtitle" },
        },
      ],
    };
    const result = validateChanges(
      "pages",
      { sections: [section] },
      [
        change("sections", [
          {
            id: "hero",
            type: "HERO",
            translations: [
              { locale: "en", content: { subtitle: "A warmer welcome" } },
            ],
          },
        ]),
      ],
      ["en"],
    );
    expect((result[0].value as any[])[0]).toMatchObject({
      config: { imageId: "approved-photo" },
      translations: [
        {
          locale: "en",
          content: { heading: "Welcome", subtitle: "A warmer welcome" },
        },
      ],
    });
  });
});
