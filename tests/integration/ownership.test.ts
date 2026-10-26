import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
afterAll(() => db.$disconnect());
describe("migration and ownership invariants", () => {
  it("backfilled all existing signage and configured an initial site", async () => {
    const site = await db.site.findUniqueOrThrow({
      where: { key: "uzbek-bg" },
    });
    expect(site.name).toBe("UZBEK BG");
    expect(
      await db.siteLocale.count({ where: { siteId: site.id, code: "en" } }),
    ).toBe(1);
    expect(await db.template.count({ where: { siteId: site.id } })).toBe(
      await db.template.count(),
    );
  });
  it("allows the same template key in separate sites and refuses orphan ownership", async () => {
    const site = await db.site.create({
      data: { key: "test-" + crypto.randomUUID(), name: "Second restaurant" },
    });
    try {
      await db.template.create({
        data: { siteId: site.id, key: "hero-dish", name: "Independent" },
      });
      await expect(
        db.template.create({
          data: { siteId: "missing-site", key: "bad", name: "Bad" },
        }),
      ).rejects.toThrow();
    } finally {
      await db.template.deleteMany({ where: { siteId: site.id } });
      await db.site.delete({ where: { id: site.id } });
    }
  });
});
