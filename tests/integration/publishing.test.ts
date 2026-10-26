import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
import { db } from "@/server/db";
import { saveResource, publishPage, Access } from "@/server/cms";
let access: Access;
let category: any;
let page: any;
beforeAll(async () => {
  const site = await db.site.create({
    data: {
      key: "publishing-test-" + crypto.randomUUID(),
      name: "Test restaurant",
      currency: "EUR",
      timeZone: "Europe/Sofia",
      locales: { create: { code: "en", label: "English" } },
      profile: { create: { cuisines: [] } },
      branding: { create: {} },
    },
  });
  const user = await db.user.create({
    data: {
      email: crypto.randomUUID() + "@example.test",
      password: "not-a-login-hash",
    },
  });
  await db.membership.create({
    data: { siteId: site.id, userId: user.id, role: "OWNER" },
  });
  access = { site, siteId: site.id, user, role: "OWNER" } as Access;
});
afterAll(async () => {
  if (!access) return;
  const { siteId, user } = access;
  await db.auditLog.deleteMany({ where: { siteId } });
  await db.mediaReference.deleteMany({
    where: { revision: { page: { siteId } } },
  });
  await db.pageTranslation.deleteMany({ where: { siteId } });
  await db.contentRevision.deleteMany({ where: { page: { siteId } } });
  await db.page.deleteMany({ where: { siteId } });
  await db.menuItem.deleteMany({ where: { siteId } });
  await db.menuCategory.deleteMany({ where: { siteId } });
  await db.branding.deleteMany({ where: { siteId } });
  await db.restaurantProfile.deleteMany({ where: { siteId } });
  await db.siteLocale.deleteMany({ where: { siteId } });
  await db.membership.deleteMany({ where: { siteId } });
  await db.site.delete({ where: { id: siteId } });
  await db.user.delete({ where: { id: user.id } });
  await db.$disconnect();
});
describe.sequential("publishing and site boundaries", () => {
  it("audits permission changes without retaining passwords", async () => {
    const email = crypto.randomUUID() + "@example.test";
    const password = "SafeTestOnlyPassword42";
    const member = await saveResource(access, "users", {
      email,
      password,
      role: "EDITOR",
      disabled: false,
    });
    try {
      await saveResource(
        access,
        "users",
        { version: member.version, email, role: "ADMIN", disabled: false },
        member.id,
      );
      const audit = await db.auditLog.findFirstOrThrow({
        where: {
          siteId: access.siteId,
          action: "users.update",
          targetId: member.id,
        },
      });
      expect(audit.before).toMatchObject({ role: "EDITOR" });
      expect(audit.after).toMatchObject({ role: "ADMIN" });
      expect(JSON.stringify(audit)).not.toContain(password);
    } finally {
      await db.membership.delete({ where: { id: member.id } });
      await db.user.delete({ where: { id: member.userId } });
    }
  });

  it("creates a structured category and accurate published dish", async () => {
    category = await saveResource(access, "categories", {
      slug: "soups",
      enabled: true,
      position: 0,
      translations: [{ locale: "en", name: "Soups", description: "" }],
    });
    const item = await saveResource(access, "items", {
      categoryId: category.id,
      slug: "soup",
      price: "12.50",
      currency: "EUR",
      status: "PUBLISHED",
      available: true,
      featured: true,
      position: 0,
      translations: [{ locale: "en", name: "Soup" }],
      variants: [],
      tagIds: [],
      imageIds: [],
    });
    expect(item.price.toString()).toBe("12.5");
    await expect(
      saveResource(access, "items", {
        ...item,
        version: item.version,
        price: "12.501",
        translations: [{ locale: "en", name: "Soup" }],
        variants: [],
        tagIds: [],
        imageIds: [],
      }),
    ).rejects.toThrow("decimal");
  });
  it("persists rich dish copy, preserves it for older clients and rejects foreign inline media", async () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Kitchen story" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Prepared with care.",
              marks: [{ type: "bold" }],
            },
          ],
        },
      ],
    };
    const payload = {
      categoryId: category.id,
      slug: "rich-soup",
      price: "12.50",
      currency: "EUR",
      status: "PUBLISHED",
      available: true,
      featured: false,
      translations: [
        { locale: "en", name: "Rich soup", detailsDocument: document },
      ],
      variants: [],
      tagIds: [],
      imageIds: [],
    };
    const saved = await saveResource(access, "items", payload);
    const text = await db.itemTranslation.findUniqueOrThrow({
      where: { itemId_locale: { itemId: saved.id, locale: "en" } },
    });
    expect(text.detailsDocument).toEqual(document);
    expect(text.details).toBe("Kitchen story\n\nPrepared with care.");
    const updated = await saveResource(
      access,
      "items",
      {
        ...payload,
        version: saved.version,
        translations: [
          { locale: "en", name: "Rich soup", details: text.details },
        ],
      },
      saved.id,
    );
    expect(
      (
        await db.itemTranslation.findUniqueOrThrow({
          where: { itemId_locale: { itemId: saved.id, locale: "en" } },
        })
      ).detailsDocument,
    ).toEqual(document);
    await expect(
      saveResource(
        access,
        "items",
        {
          ...payload,
          version: updated.version,
          translations: [
            {
              locale: "en",
              name: "Rich soup",
              detailsDocument: {
                type: "doc",
                content: [
                  { type: "image", attrs: { mediaId: "not-this-sites-media" } },
                ],
              },
            },
          ],
        },
        saved.id,
      ),
    ).rejects.toThrow("Media Library");
    await saveResource(
      access,
      "items",
      {
        ...payload,
        version: updated.version,
        translations: [
          {
            locale: "en",
            name: "Rich soup",
            details: "Edited by an older client.",
          },
        ],
      },
      saved.id,
    );
    expect(
      (
        await db.itemTranslation.findUniqueOrThrow({
          where: { itemId_locale: { itemId: saved.id, locale: "en" } },
        })
      ).detailsDocument,
    ).toBeNull();
  });
  it("does not permit Editors to change sensitive settings through services", async () => {
    await expect(
      saveResource({ ...access, role: "EDITOR" }, "integrations", {
        provider: "Wolt",
        label: "Order",
        url: "https://example.com/order",
        enabled: true,
      }),
    ).rejects.toThrow("permission");
  });
  it("rejects a category owned by a different site", async () => {
    const other = await db.site.findUniqueOrThrow({
      where: { key: "uzbek-bg" },
    });
    const foreign = await db.menuCategory.create({
      data: { siteId: other.id, slug: "test-foreign-" + crypto.randomUUID() },
    });
    try {
      await expect(
        saveResource(access, "items", {
          categoryId: foreign.id,
          slug: "foreign",
          price: "5.00",
          currency: "EUR",
          status: "PUBLISHED",
          available: true,
          featured: false,
          translations: [{ locale: "en", name: "Foreign" }],
          variants: [],
          tagIds: [],
          imageIds: [],
        }),
      ).rejects.toThrow("site");
    } finally {
      await db.menuCategory.delete({ where: { id: foreign.id } });
    }
  });
  it("keeps saved drafts out of the published snapshot and rejects stale saves", async () => {
    const input = {
      internalName: "Story",
      type: "CUSTOM",
      translations: [{ locale: "en", slug: "story", title: "Published story" }],
      sections: [
        {
          type: "HERO",
          hidden: false,
          config: {},
          translations: [
            { locale: "en", content: { heading: "First published heading" } },
          ],
        },
      ],
    };
    page = await saveResource(access, "pages", input);
    await publishPage(access, page.id, {
      version: page.version,
      locale: "en",
      operation: "publish",
    });
    const published = await db.pageTranslation.findUniqueOrThrow({
      where: { pageId_locale: { pageId: page.id, locale: "en" } },
    });
    const snapshot = await db.contentRevision.findUniqueOrThrow({
      where: { id: published.publishedRevisionId! },
    });
    expect(
      (snapshot.snapshot as any).sections[0].translations[0].content.heading,
    ).toBe("First published heading");
    const latest = await db.page.findUniqueOrThrow({ where: { id: page.id } });
    const updated = await saveResource(
      access,
      "pages",
      {
        ...input,
        version: latest.version,
        translations: [
          { locale: "en", slug: "new-story", title: "Unpublished draft" },
        ],
      },
      page.id,
    );
    expect(
      (
        await db.pageTranslation.findUniqueOrThrow({
          where: { id: published.id },
        })
      ).publishedSlug,
    ).toBe("story");
    expect(
      (
        await db.contentRevision.findUniqueOrThrow({
          where: { id: snapshot.id },
        })
      ).snapshot,
    ).toEqual(snapshot.snapshot);
    await expect(
      saveResource(
        access,
        "pages",
        { ...input, version: latest.version },
        page.id,
      ),
    ).rejects.toThrow("Another editor");
    await publishPage(access, page.id, {
      version: updated.version,
      locale: "en",
      operation: "publish",
    });
    expect(
      await db.redirect.findUnique({
        where: {
          siteId_fromPath: { siteId: access.siteId, fromPath: "/story" },
        },
      }),
    ).toMatchObject({ toPath: "/new-story" });
    await db.redirect.deleteMany({ where: { siteId: access.siteId } });
  });
});
