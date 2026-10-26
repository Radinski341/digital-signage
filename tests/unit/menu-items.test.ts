import { describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ unstable_cache: (fn: any) => fn }));
import {
  dishDescription,
  dishLocales,
  dishPath,
  relatedDishes,
} from "@/modules/menu-items";
import { dishMetadata, dishStructuredData } from "@/server/menu-items";
const site: any = {
  name: "Example kitchen",
  defaultLocale: "en",
  domain: "https://restaurant.example",
  media: [],
  locales: [
    { code: "en", enabled: true },
    { code: "bg", enabled: true },
    { code: "fr", enabled: false },
  ],
};
const item: any = {
  id: "dish",
  slug: "garden-salad",
  categoryId: "salads",
  price: "12.50",
  currency: "EUR",
  available: false,
  translations: [
    {
      locale: "en",
      name: "Garden salad",
      description: "Fresh salad",
      details: "Kitchen story",
      seoTitle: "Our garden salad",
    },
    { locale: "bg", name: "Салата", description: "Прясна салата" },
  ],
  variants: [],
  tags: [],
};
describe("public dish pages", () => {
  it("uses stable locale-aware paths and only enabled, translated alternates", () => {
    expect(dishPath(item.slug, "en", "en")).toBe("/dishes/garden-salad");
    expect(dishPath(item.slug, "bg", "en")).toBe("/bg/dishes/garden-salad");
    expect(dishLocales(item, site)).toEqual(["en", "bg"]);
  });
  it("uses edited SEO with description defaults and canonical fallback for untranslated locales", () => {
    const metadata = dishMetadata(site, item, "en");
    expect(metadata.title).toBe("Our garden salad");
    expect(metadata.description).toBe("Fresh salad");
    expect(metadata.alternates?.canonical).toBe(
      "https://restaurant.example/dishes/garden-salad",
    );
    expect(dishMetadata(site, item, "de").alternates?.canonical).toBe(
      metadata.alternates?.canonical,
    );
    expect(dishDescription({ details: "A long\n story" })).toBe("A long story");
    expect(dishDescription({ details: "x".repeat(300) })?.length).toBe(160);
  });
  it("ranks available dishes from the same category first and excludes self/drafts", () => {
    const other = (
      id: string,
      categoryId: string,
      available = true,
      status = "PUBLISHED",
    ) => ({ ...item, id, categoryId, available, status });
    expect(
      relatedDishes(item, [
        item,
        other("other", "soups"),
        other("near", "salads"),
        other("hidden", "salads", true, "DRAFT"),
        other("sold", "salads", false),
      ]).map((d) => d.id),
    ).toEqual(["near", "other"]);
  });
  it("uses accurate decimal prices and availability without fabricated claims", () => {
    const schema = dishStructuredData(site, item, "bg");
    expect(schema.name).toBe("Салата");
    expect(schema.offers[0]).toMatchObject({
      price: "12.50",
      priceCurrency: "EUR",
      availability: "https://schema.org/OutOfStock",
    });
    expect(schema).not.toHaveProperty("aggregateRating");
    expect(schema).not.toHaveProperty("suitableForDiet");
  });
});
