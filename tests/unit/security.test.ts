import { describe, expect, it } from "vitest";
import {
  safeHref,
  permits,
  slugify,
  localize,
  formatPrice,
} from "@/modules/security";
import { sanitizeLegacyHtml } from "@/server/content";
import { templateSchema, slideSchema, validateField } from "@/modules/signage";
describe("content safety", () => {
  it.each([
    "javascript:alert(1)",
    "//evil.example",
    "/\\evil",
    "data:text/html,x",
    "https://user:password@example.com",
    "java\nscript:x",
  ])("rejects unsafe address %s", (value) =>
    expect(safeHref(value)).toBeNull(),
  );
  it.each([
    "/menu",
    "https://example.com/order",
    "tel:+359123456",
    "mailto:hello@example.com",
  ])("accepts address %s", (value) => expect(safeHref(value)).toBe(value));
  it("removes executable legacy content", () => {
    const html = sanitizeLegacyHtml(
      '<p onclick="x()">Hello<script>alert(1)</script><a href="javascript:alert(1)">Go</a><img src=x onerror=x()></p>',
    );
    expect(html).not.toMatch(/onclick|script|onerror|javascript|<img/);
    expect(html).toContain("Hello");
  });
  it("fails closed for unknown roles", () => {
    expect(permits("guest", "content")).toBe(false);
    expect(permits("EDITOR", "users")).toBe(false);
    expect(permits("EDITOR", "content")).toBe(true);
    expect(permits("OWNER", "users")).toBe(true);
  });
  it("normalizes slugs", () =>
    expect(slugify("  Summer Café 2026! ")).toBe("summer-cafe-2026"));
  it("falls back only to the selected default", () => {
    const values = [
      { locale: "en", name: "Soup" },
      { locale: "bg", name: "Супа" },
    ];
    expect(localize(values, "ar", "en")?.name).toBe("Soup");
    expect(localize(values, "bg", "en")?.name).toBe("Супа");
    expect(localize(values, "ar", "fr")).toBeUndefined();
  });
  it("formats currency using its own fraction rules", () => {
    expect(formatPrice("12.50", "EUR", "en")).toContain("12.50");
    expect(formatPrice("12", "JPY", "en")).not.toContain(".00");
  });
});
describe("dynamic template validation", () => {
  it("rejects duplicate and prototype field names", () => {
    const field = { key: "title", label: "Title", type: "TEXT" };
    expect(
      templateSchema.safeParse({ name: "Test", fields: [field, field] })
        .success,
    ).toBe(false);
    expect(
      templateSchema.safeParse({
        name: "Test",
        fields: [{ ...field, key: "constructor" }],
      }).success,
    ).toBe(false);
  });
  it("validates legacy object array schemas", () => {
    const field = {
      key: "rows",
      label: "Rows",
      type: "RICHTEXT",
      required: true,
      isArray: true,
      config: { itemSchema: { name: "TEXT", price: "NUMBER" } },
    };
    expect(validateField(field, [{ name: "Soup", price: 2 }])).toEqual([
      { name: "Soup", price: 2 },
    ]);
    expect(() =>
      validateField(field, [{ name: "Soup", price: "NaN" }]),
    ).toThrow();
  });
  it("rejects malformed playback timing and effects", () => {
    expect(
      slideSchema.safeParse({ name: "TV", bannerIds: [], speedMs: -10 })
        .success,
    ).toBe(false);
    expect(
      slideSchema.safeParse({ name: "TV", bannerIds: [], effect: "SCRIPT" })
        .success,
    ).toBe(false);
  });
});
