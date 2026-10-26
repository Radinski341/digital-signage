import { describe, it, expect } from "vitest";
import {
  sectionDefinitions,
  sectionSchema,
  validRichText,
  mediaIds,
} from "@/modules/sections/schema";
import { schemas } from "@/modules/cms";
describe("structured content", () => {
  it("every registered section has validated defaults", () => {
    for (const [type, definition] of Object.entries(sectionDefinitions)) {
      const config = definition.schema.parse({});
      expect(
        sectionSchema.safeParse({ type, config, translations: [] }).success,
      ).toBe(true);
    }
  });
  it("rejects unsafe and excessively nested rich text", () => {
    expect(
      validRichText({
        type: "doc",
        content: [{ type: "script", text: "bad" }],
      }),
    ).toBe(false);
    expect(
      validRichText({
        type: "doc",
        content: [
          {
            type: "text",
            text: "click",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      }),
    ).toBe(false);
    expect(
      validRichText({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { src: "https://untrusted.example/image.png" },
          },
        ],
      }),
    ).toBe(false);
    let node: any = { type: "paragraph" };
    for (let i = 0; i < 30; i++) node = { type: "blockquote", content: [node] };
    expect(validRichText({ type: "doc", content: [node] })).toBe(false);
  });
  it("tracks nested gallery and rich-text media", () =>
    expect(
      mediaIds({
        config: { imageIds: ["one", "two"], imageId: "one" },
        content: { body: { type: "image", attrs: { mediaId: "three" } } },
      }),
    ).toEqual(["one", "two", "three"]));
  it("requires reference destinations for internal and ordering actions", () => {
    const base = {
      name: "Order",
      type: "ORDERING",
      destination: "",
      style: "primary",
      enabled: true,
      newTab: false,
      translations: [{ locale: "en", label: "Order" }],
    };
    expect(schemas.actions.safeParse(base).success).toBe(false);
    expect(
      schemas.actions.safeParse({ ...base, integrationId: "provider" }).success,
    ).toBe(true);
    expect(
      schemas.actions.safeParse({
        ...base,
        type: "EXTERNAL",
        destination: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });
  it("rejects invalid locale identifiers and currencies", () => {
    expect(
      schemas.locales.safeParse({
        code: "not a language",
        label: "Invalid",
        enabled: true,
        direction: "ltr",
        strings: [],
      }).success,
    ).toBe(false);
  });
});
