import { describe, it, expect } from "vitest";
import {
  assertSafeDraft,
  dependencyOrder,
  draftIssues,
} from "@/modules/ai/workspace";
import { factualIssues } from "@/server/ai/workspaces";
describe("whole-site proposal contracts", () => {
  it("orders references while allowing a page to link to its own CTA", () => {
    const ops = [
      {
        key: "home",
        resource: "pages",
        targetId: "home",
        isNew: true,
        payload: { sections: [{ config: { actionIds: ["cta"] } }] },
      },
      {
        key: "item",
        resource: "items",
        targetId: "dish",
        isNew: true,
        payload: { categoryId: "category", actionId: "cta" },
      },
      {
        key: "cta",
        resource: "actions",
        targetId: "cta",
        isNew: true,
        payload: { pageId: "home" },
      },
      {
        key: "category",
        resource: "categories",
        targetId: "category",
        isNew: true,
        payload: {},
      },
    ];
    const ordered = dependencyOrder(ops).map((o) => o.key);
    expect(ordered.indexOf("category")).toBeLessThan(ordered.indexOf("item"));
    expect(ordered.indexOf("cta")).toBeLessThan(ordered.indexOf("item"));
  });
  it("retains ordinary draft validation issues but rejects executable values", () => {
    expect(
      draftIssues("categories", { slug: "Invalid Slug", translations: [] }),
    ).toContainEqual(
      expect.objectContaining({ field: "slug", severity: "error" }),
    );
    expect(() =>
      assertSafeDraft({
        translations: [{ description: "Incomplete but editable" }],
      }),
    ).not.toThrow();
    expect(() =>
      assertSafeDraft({ body: { attrs: { href: "javascript:alert(1)" } } }),
    ).toThrow();
    expect(() =>
      assertSafeDraft({ description: "Onions = 20 g. Serve warm." }),
    ).not.toThrow();
    expect(() =>
      assertSafeDraft({ caption: '<img src="x" onerror="alert(1)">' }),
    ).toThrow();

    expect(() =>
      assertSafeDraft(JSON.parse('{"__proto__":{"polluted":true}}')),
    ).toThrow();
  });
  it("requires quoted evidence for a generated price and dietary assignment", () => {
    const op = {
      key: "dish",
      resource: "items",
      targetId: "dish",
      isNew: true,
      payload: { price: "12.50", tagIds: ["vegan"] },
      facts: [],
    };
    expect(
      factualIssues(op, "Garden salad 12.50 EUR confirmed vegan"),
    ).toHaveLength(2);
    expect(
      factualIssues(
        {
          ...op,
          facts: [
            {
              field: "price",
              evidence: "Garden salad 12.50 EUR confirmed vegan",
            },
            {
              field: "tagIds",
              evidence: "Garden salad 12.50 EUR confirmed vegan",
            },
          ],
        },
        "garden salad 12.50 eur confirmed vegan",
      ),
    ).toHaveLength(0);
    expect(
      factualIssues(
        { ...op, facts: [{ field: "price", evidence: "A fabricated source" }] },
        "verified restaurant menu",
      ),
    ).toHaveLength(2);
  });
  it("preserves unchanged business facts and accepts explicitly reviewed edits", () => {
    expect(
      factualIssues(
        {
          key: "dish",
          resource: "items",
          targetId: "dish",
          isNew: false,
          baseline: { price: "12.50", tagIds: ["milk"] },
          payload: { price: "12.50", tagIds: ["milk"] },
        },
        "",
      ),
    ).toEqual([]);
    expect(
      factualIssues(
        {
          key: "dish",
          resource: "items",
          targetId: "dish",
          isNew: true,
          manual: true,
          payload: { price: "12.50", tagIds: [] },
        },
        "",
      ),
    ).toEqual([]);
  });
});
