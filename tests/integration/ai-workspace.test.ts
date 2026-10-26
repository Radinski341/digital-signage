import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: any) => fn,
}));
import { db } from "@/server/db";
import type { Access } from "@/server/cms";
import {
  createWorkspace,
  stageOperation,
  ownedWorkspace,
  queueRun,
  cancelRun,
  proposalIssues,
  resumeBuilderRun,
} from "@/server/ai/workspaces";
import { applyWorkspace } from "@/server/ai/workspace-publish";
import { projectWorkspace } from "@/server/ai/workspace-preview";
import {
  builderTick,
  claimBuilderRun,
  processBuilderRun,
} from "@/server/ai/worker";
let access: Access;
const sites: string[] = [];
beforeAll(async () => {
  const site = await db.site.create({
    data: {
      key: "builder-" + crypto.randomUUID(),
      name: "Builder test",
      currency: "EUR",
      timeZone: "Europe/Sofia",
      locales: { create: { code: "en", label: "English" } },
      profile: {
        create: {
          cuisines: [],
          translations: { create: { locale: "en", name: "Builder test" } },
        },
      },
      branding: { create: {} },
    },
  });
  const user = await db.user.create({
    data: {
      email: crypto.randomUUID() + "@example.test",
      password: "not-a-login-password",
    },
  });
  await db.membership.create({
    data: { siteId: site.id, userId: user.id, role: "OWNER" },
  });
  access = { site, siteId: site.id, user, role: "OWNER" } as Access;
  sites.push(site.id);
});
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key-never-sent");
  vi.stubEnv("AI_BUILDER_MAX_CALLS", "3200");
  vi.stubEnv("AI_BUILDER_MAX_INPUT_TOKENS", "50000000");
  vi.stubEnv("AI_BUILDER_MAX_OUTPUT_TOKENS", "6400000");
  vi.stubEnv("AI_USER_HOURLY_LIMIT", "1000");
  vi.stubEnv("AI_SITE_DAILY_LIMIT", "1000");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  if (!access) return;
  for (const siteId of sites) {
    await db.aiWorkspace.deleteMany({ where: { siteId } });
    await db.aiRequest.deleteMany({ where: { siteId } });
    await db.aiConversation.deleteMany({ where: { siteId } });
    await db.mediaReference.deleteMany({ where: { media: { siteId } } });
    await db.contentRevision.deleteMany({ where: { page: { siteId } } });
    await db.navigationItem.deleteMany({ where: { navigation: { siteId } } });
    await db.navigation.deleteMany({ where: { siteId } });
    await db.slide.deleteMany({ where: { siteId } });
    await db.banner.deleteMany({ where: { siteId } });
    await db.template.deleteMany({ where: { siteId } });
    await db.action.deleteMany({ where: { siteId } });
    await db.menuItem.deleteMany({ where: { siteId } });
    await db.menuTag.deleteMany({ where: { siteId } });
    await db.menuCategory.deleteMany({ where: { siteId } });
    await db.page.deleteMany({ where: { siteId } });
    await db.auditLog.deleteMany({ where: { siteId } });
    await db.branding.deleteMany({ where: { siteId } });
    await db.restaurantProfile.deleteMany({ where: { siteId } });
    await db.siteLocale.deleteMany({ where: { siteId } });
    await db.redirect.deleteMany({ where: { siteId } });
    await db.membership.deleteMany({ where: { siteId } });
    await db.site.delete({ where: { id: siteId } });
  }
  await db.user.delete({ where: { id: access.user.id } });
  await db.$disconnect();
});
async function workspace() {
  return createWorkspace(access, {
    title: "Complete site",
    brief: "Garden salad price 12.50 EUR, confirmed vegan. Use English.",
    locales: ["en"],
  });
}
async function category(w: any, key = "salads") {
  return stageOperation(
    access,
    w.id,
    {
      resource: "categories",
      key,
      payload: {
        slug: key + "-" + crypto.randomUUID().slice(0, 8),
        enabled: true,
        translations: [{ locale: "en", name: "Salads" }],
      },
    },
    { manual: true },
  );
}
async function complete(w: any) {
  const c = await category(w);
  const dish = await stageOperation(access, w.id, {
    resource: "items",
    key: "dish",
    payload: {
      categoryId: c.targetId,
      slug: "garden-" + crypto.randomUUID().slice(0, 8),
      price: "12.50",
      currency: "EUR",
      status: "DRAFT",
      available: true,
      featured: true,
      translations: [
        { locale: "en", name: "Garden salad", description: "A garden salad" },
      ],
      variants: [],
      tagIds: [],
      imageIds: [],
    },
    facts: [
      {
        field: "price",
        evidence: "Garden salad price 12.50 EUR, confirmed vegan.",
      },
    ],
  });
  const page = await stageOperation(access, w.id, {
    resource: "pages",
    key: "story",
    payload: {
      type: "CUSTOM",
      internalName: "Our kitchen",
      translations: [
        {
          locale: "en",
          slug: "kitchen-" + crypto.randomUUID().slice(0, 8),
          title: "Our kitchen",
          seoDescription: "Fresh restaurant cooking",
        },
      ],
      sections: [
        {
          type: "MENU_HIGHLIGHTS",
          config: { itemIds: [dish.targetId] },
          translations: [
            {
              locale: "en",
              content: {
                heading: "Our menu",
                subtitle: "",
                caption: "",
                alt: "",
              },
            },
          ],
        },
      ],
    },
  });
  return { c, dish, page };
}
describe("central website staging and publication", () => {
  it("stages linked content and previews dishes without changing live CMS rows", async () => {
    const w = await workspace();
    const { dish, page } = await complete(w);
    expect(
      await db.menuItem.findUnique({ where: { id: dish.targetId } }),
    ).toBeNull();
    expect(
      await db.page.findUnique({ where: { id: page.targetId } }),
    ).toBeNull();
    const p = await projectWorkspace(access, w.id);
    expect(
      p.site.items.find((i: any) => i.id === dish.targetId)?.translations[0]
        .name,
    ).toBe("Garden salad");
    expect(p.pages.some((x) => x.id === page.targetId)).toBe(true);
  });
  it("publishes every record atomically and replays acceptance without duplicates", async () => {
    const w = await workspace();
    const { dish, page } = await complete(w);
    const ready = await ownedWorkspace(access, w.id);
    const input = { revision: ready.revision, key: crypto.randomUUID() };
    const receipt: any = await applyWorkspace(access, w.id, input, {
      invalidate: false,
    });
    expect(receipt.records).toHaveLength(3);
    expect(
      (await db.menuItem.findUniqueOrThrow({ where: { id: dish.targetId } }))
        .status,
    ).toBe("PUBLISHED");
    expect(
      (
        await db.pageTranslation.findFirstOrThrow({
          where: { pageId: page.targetId },
        })
      ).publishedRevisionId,
    ).toBeTruthy();
    expect(
      await applyWorkspace(access, w.id, input, { invalidate: false }),
    ).toEqual(receipt);
    expect(
      await db.auditLog.count({
        where: { targetId: w.id, action: "ai.batch.publish" },
      }),
    ).toBe(1);
  });
  it("requires explicit bulk factual review and records confirmation in the receipt", async () => {
    const w = await workspace();
    const { dish } = await complete(w);
    await db.aiOperation.update({
      where: { workspaceId_key: { workspaceId: w.id, key: "dish" } },
      data: { facts: [], manual: false },
    });
    const ready = await ownedWorkspace(access, w.id);
    expect(await proposalIssues(access, ready)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "price",
          code: "FACT_REVIEW_REQUIRED",
        }),
      ]),
    );
    const input = { revision: ready.revision, key: crypto.randomUUID() };
    await expect(
      applyWorkspace(access, w.id, input, { invalidate: false }),
    ).rejects.toThrow("business facts");
    expect(
      await db.menuItem.findUnique({ where: { id: dish.targetId } }),
    ).toBeNull();
    const receipt: any = await applyWorkspace(
      access,
      w.id,
      { ...input, confirmBusinessFacts: true },
      { invalidate: false },
    );
    expect(receipt.businessFactsConfirmed).toBe(true);
    expect(
      (
        await db.auditLog.findFirstOrThrow({
          where: { targetId: w.id, action: "ai.batch.publish" },
        })
      ).after,
    ).toEqual(receipt);
  });
  it("bulk fact confirmation cannot bypass invalid fields or foreign references", async () => {
    for (const payload of [
      { price: "invalid" },
      { categoryId: crypto.randomUUID() },
    ]) {
      const w = await workspace();
      const { dish } = await complete(w);
      await db.aiOperation.update({
        where: { workspaceId_key: { workspaceId: w.id, key: "dish" } },
        data: {
          facts: [],
          manual: false,
          payload: {
            ...((await ownedWorkspace(access, w.id)).operations.find(
              (op: any) => op.key === "dish",
            ).payload as any),
            ...payload,
          },
        },
      });
      const ready = await ownedWorkspace(access, w.id);
      await expect(
        applyWorkspace(
          access,
          w.id,
          {
            revision: ready.revision,
            key: crypto.randomUUID(),
            confirmBusinessFacts: true,
          },
          { invalidate: false },
        ),
      ).rejects.toThrow("highlighted fields");
      expect(
        await db.menuItem.findUnique({ where: { id: dish.targetId } }),
      ).toBeNull();
    }
  });
  it("rolls back all writes and revisions when any operation fails", async () => {
    const w = await workspace();
    const { c, dish, page } = await complete(w);
    const ready = await ownedWorkspace(access, w.id);
    await expect(
      applyWorkspace(
        access,
        w.id,
        { revision: ready.revision, key: crypto.randomUUID() },
        {
          invalidate: false,
          afterRecord: (index) => {
            if (index === 1) throw new Error("injected failure");
          },
        },
      ),
    ).rejects.toThrow("injected failure");
    expect(
      await db.menuCategory.findUnique({ where: { id: c.targetId } }),
    ).toBeNull();
    expect(
      await db.menuItem.findUnique({ where: { id: dish.targetId } }),
    ).toBeNull();
    expect(
      await db.page.findUnique({ where: { id: page.targetId } }),
    ).toBeNull();
    expect((await ownedWorkspace(access, w.id)).state).not.toBe("APPLIED");
  });
  it("rejects stale CMS edits and unauthorized site references", async () => {
    const existing = await db.menuCategory.create({
      data: {
        siteId: access.siteId,
        slug: "concurrent-" + crypto.randomUUID(),
        translations: { create: { locale: "en", name: "Original" } },
      },
    });
    const w = await workspace();
    await stageOperation(access, w.id, {
      resource: "categories",
      recordId: existing.id,
      key: "existing",
      payload: { translations: [{ locale: "en", name: "Proposed" }] },
    });
    await db.menuCategory.update({
      where: { id: existing.id },
      data: { version: { increment: 1 } },
    });
    const ready = await ownedWorkspace(access, w.id);
    await expect(
      applyWorkspace(
        access,
        w.id,
        { revision: ready.revision, key: crypto.randomUUID() },
        { invalidate: false },
      ),
    ).rejects.toThrow("changed in the CMS");
    await expect(
      stageOperation(access, w.id, {
        resource: "categories",
        key: "foreign",
        recordId: "not-this-site",
        payload: {},
      }),
    ).rejects.toThrow("does not belong");
  });
  it("protects manual edits and retains invalid ordinary drafts", async () => {
    const w = await workspace();
    const c = await category(w);
    const result: any = await stageOperation(access, w.id, {
      resource: "categories",
      key: "salads",
      payload: { translations: [{ locale: "en", name: "Overwritten" }] },
    });
    expect(result.skipped).toBe(true);
    const current = await ownedWorkspace(access, w.id);
    await stageOperation(
      access,
      w.id,
      {
        resource: "categories",
        key: "salads",
        recordId: c.targetId,
        payload: { slug: "Invalid Slug" },
      },
      { manual: true, revision: current.revision },
    );
    const next = await ownedWorkspace(access, w.id);
    expect(next.operations[0].payload.slug).toBe("Invalid Slug");
    expect(
      (await proposalIssues(access, next)).some((i) => i.field === "slug"),
    ).toBe(true);
  });
  it("enforces ownership, settings permissions and explicit signage inclusion", async () => {
    const w = await workspace();
    await expect(
      ownedWorkspace(
        { ...access, user: { ...access.user, id: "another-user" } },
        w.id,
      ),
    ).rejects.toThrow("not found");
    const brand = await db.branding.findUniqueOrThrow({
      where: { siteId: access.siteId },
    });
    await expect(
      stageOperation({ ...access, role: "EDITOR" }, w.id, {
        resource: "branding",
        key: "brand",
        recordId: brand.id,
        payload: { radius: 20 },
      }),
    ).rejects.toThrow("cannot edit");
    await expect(
      stageOperation(access, w.id, {
        resource: "templates",
        key: "tv",
        payload: { name: "TV", fields: [] },
      }),
    ).rejects.toThrow("signage enabled");
  });
  it("runs tool steps durably with the fixed model and one quota reservation", async () => {
    const w = await workspace();
    await queueRun(access, w.id, {
      revision: w.revision,
      key: crypto.randomUUID(),
      message: "Create a category",
    });
    const generate = vi.fn(async (body: any) => {
      expect(body.model).toBe("gpt-6-luna");
      expect(body.store).toBe(false);
      return body.input.some((i: any) => i.type === "function_call_output")
        ? {
            status: "completed",
            usage: { input_tokens: 20, output_tokens: 10 },
            output: [
              {
                type: "message",
                role: "assistant",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      message: "Your category is ready to review.",
                      questions: [],
                    }),
                  },
                ],
              },
            ],
          }
        : {
            status: "completed",
            usage: { input_tokens: 20, output_tokens: 10 },
            output: [
              {
                type: "function_call",
                name: "stage_categories",
                call_id: "stage-once",
                arguments: JSON.stringify({
                  records: [
                    {
                      key: "generated",
                      payload: {
                        slug: "generated-" + w.id,
                        translations: [
                          { locale: "en", name: "Generated category" },
                        ],
                      },
                    },
                  ],
                }),
              },
            ],
          };
    });
    await builderTick(generate);
    const checkpoint = await db.aiRun.findFirstOrThrow({
      where: { workspaceId: w.id },
    });
    expect(checkpoint.state).toBe("QUEUED");
    expect(
      await db.aiToolEvent.count({ where: { runId: checkpoint.id } }),
    ).toBe(1);
    await builderTick(generate);
    expect((await ownedWorkspace(access, w.id)).state).toBe("READY");
    expect(
      await db.aiRequest.count({ where: { conversationId: w.conversationId } }),
    ).toBe(1);
    expect(
      await db.menuCategory.findFirst({
        where: { siteId: access.siteId, slug: "generated-" + w.id },
      }),
    ).toBeNull();
  });
  it("deduplicates queued instructions and fences a cancelled worker", async () => {
    const w = await workspace();
    const raw = {
      revision: w.revision,
      key: crypto.randomUUID(),
      message: "Create another category",
    };
    const run = await queueRun(access, w.id, raw);
    expect((await queueRun(access, w.id, raw)).id).toBe(run.id);
    const claimed = await claimBuilderRun();
    expect(claimed?.id).toBe(run.id);
    const current = await ownedWorkspace(access, w.id);
    await cancelRun(access, w.id, current.revision);
    await processBuilderRun(claimed, async () => ({
      status: "completed",
      output: [],
    }));
    expect(
      (await db.aiRun.findUniqueOrThrow({ where: { id: run.id } })).state,
    ).toBe("CANCELLED");
    expect((await ownedWorkspace(access, w.id)).operations).toHaveLength(0);
  });
  it("recovers an expired worker lease and rejects revoked initiating access", async () => {
    const w = await workspace();
    const run = await queueRun(access, w.id, {
      revision: w.revision,
      key: crypto.randomUUID(),
      message: "Prepare content",
    });
    const first = await claimBuilderRun();
    expect(first?.id).toBe(run.id);
    await db.aiRun.update({
      where: { id: run.id },
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });
    const recovered = await claimBuilderRun();
    expect(recovered?.leaseToken).not.toBe(first?.leaseToken);
    await db.user.update({
      where: { id: access.user.id },
      data: { sessionVersion: { increment: 1 } },
    });
    const generate = vi.fn();
    await processBuilderRun(recovered, generate);
    expect(generate).not.toHaveBeenCalled();
    expect(
      (await db.aiRun.findUniqueOrThrow({ where: { id: run.id } })).state,
    ).toBe("FAILED");
    await db.user.update({
      where: { id: access.user.id },
      data: { sessionVersion: access.user.sessionVersion },
    });
  });
});

describe("whole-site publication safeguards", () => {
  it("reports broken references and rejects unsupported dietary inference before acceptance", async () => {
    const w = await workspace();
    const { dish } = await complete(w);
    const tag = await stageOperation(access, w.id, {
      resource: "tags",
      key: "milk",
      payload: {
        key: "milk-" + w.id,
        kind: "ALLERGEN",
        translations: [{ locale: "en", name: "Milk" }],
      },
    });
    await stageOperation(access, w.id, {
      resource: "items",
      key: "dish",
      recordId: dish.targetId,
      payload: { tagIds: [tag.targetId], imageId: "foreign-photo" },
      facts: [
        {
          field: "price",
          evidence: "Garden salad price 12.50 EUR, confirmed vegan.",
        },
        {
          field: "tagIds",
          evidence: "Garden salad price 12.50 EUR, confirmed vegan.",
        },
      ],
    });
    const issues = await proposalIssues(
      access,
      await ownedWorkspace(access, w.id),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        key: "dish",
        field: "tagIds",
        severity: "error",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        key: "dish",
        field: "imageId",
        severity: "error",
      }),
    );
  });
  it("publishes explicitly included banners and slides in the same batch", async () => {
    const w = await createWorkspace(access, {
      title: "Signage",
      brief: "A welcome banner",
      locales: ["en"],
      includeSignage: true,
    });
    const template = await stageOperation(access, w.id, {
      resource: "templates",
      key: "template",
      payload: {
        name: "Welcome",
        fields: [
          {
            key: "title",
            label: "Heading",
            type: "TEXT",
            required: true,
            isArray: false,
          },
        ],
      },
    });
    const banner = await stageOperation(access, w.id, {
      resource: "banners",
      key: "welcome",
      payload: {
        templateId: template.targetId,
        data: { title: "Welcome to our kitchen" },
        sourceLocale: "en",
      },
    });
    const slide = await stageOperation(access, w.id, {
      resource: "slides",
      key: "playlist",
      payload: {
        name: "Welcome playlist",
        effect: "FADE",
        speedMs: 8000,
        bannerIds: [banner.targetId],
      },
    });
    const ready = await ownedWorkspace(access, w.id);
    await applyWorkspace(
      access,
      w.id,
      { revision: ready.revision, key: crypto.randomUUID() },
      { invalidate: false },
    );
    expect(
      (await db.banner.findUniqueOrThrow({ where: { id: banner.targetId } }))
        .status,
    ).toBe("PUBLISHED");
    expect(
      (await db.slide.findUniqueOrThrow({ where: { id: slide.targetId } }))
        .status,
    ).toBe("PUBLISHED");
  });
});

describe("publication recovery and language routing", () => {
  it("retries a failed post-commit cache refresh without duplicating content", async () => {
    const { revalidateTag } = await import("next/cache");
    const w = await workspace();
    const { dish } = await complete(w);
    const ready = await ownedWorkspace(access, w.id);
    const input = { revision: ready.revision, key: crypto.randomUUID() };
    vi.mocked(revalidateTag).mockImplementationOnce(() => {
      throw new Error("cache unavailable");
    });
    await expect(applyWorkspace(access, w.id, input)).rejects.toThrow(
      "Content was published",
    );
    expect(
      (await ownedWorkspace(access, w.id)).receipt.cacheRefreshPending,
    ).toBe(true);
    expect(
      (await db.menuItem.findUniqueOrThrow({ where: { id: dish.targetId } }))
        .status,
    ).toBe("PUBLISHED");
    const receipt: any = await applyWorkspace(access, w.id, input);
    expect(receipt.cacheRefreshPending).toBe(false);
    expect(
      await db.auditLog.count({
        where: { action: "ai.batch.publish", targetId: w.id },
      }),
    ).toBe(1);
  });
  it("switches the default language after publishing all required translations", async () => {
    const w = await createWorkspace(access, {
      title: "Default Bulgarian",
      brief:
        "Translate our existing pages into Bulgarian and make it the default.",
      locales: ["en", "bg"],
    });
    await stageOperation(access, w.id, {
      resource: "locales",
      key: "bulgarian",
      payload: {
        code: "bg",
        label: "Български",
        enabled: true,
        direction: "ltr",
        isDefault: true,
        strings: [],
      },
    });
    const live = await db.page.findMany({
      where: { siteId: access.siteId, status: "PUBLISHED" },
      include: {
        translations: true,
        sections: {
          include: { translations: true },
          orderBy: { position: "asc" },
        },
      },
    });
    for (const page of live) {
      const en = page.translations.find((t) => t.locale === "en")!;
      await stageOperation(
        access,
        w.id,
        {
          resource: "pages",
          key: "translated-" + page.id,
          recordId: page.id,
          payload: {
            type: page.type,
            internalName: page.internalName,
            translations: [
              {
                locale: "en",
                slug: en.slug,
                title: en.title,
                seoDescription: "Restaurant kitchen",
              },
              {
                locale: "bg",
                slug: "bg-" + en.slug,
                title: "Нашата кухня",
                seoDescription: "Научете повече за нашата кухня.",
              },
            ],
            sections: page.sections.map((s) => ({
              ...s,
              translations: [
                ...s.translations,
                {
                  locale: "bg",
                  content: {
                    ...(s.translations[0]?.content as any),
                    heading: "Нашето меню",
                  },
                },
              ],
            })),
          },
        },
        { manual: true },
      );
    }
    const ready = await ownedWorkspace(access, w.id);
    expect(
      (await proposalIssues(access, ready)).filter(
        (i) => i.severity === "error",
      ),
    ).toEqual([]);
    const preview = await projectWorkspace(access, w.id);
    expect(preview.site.defaultLocale).toBe("bg");
    await applyWorkspace(
      access,
      w.id,
      { revision: ready.revision, key: crypto.randomUUID() },
      { invalidate: false },
    );
    expect(
      (await db.site.findUniqueOrThrow({ where: { id: access.siteId } }))
        .defaultLocale,
    ).toBe("bg");
    expect(
      await db.pageTranslation.count({
        where: {
          siteId: access.siteId,
          locale: "bg",
          publishedRevisionId: { not: null },
        },
      }),
    ).toBe(live.length);
  });
});

describe("mutation-time role checks", () => {
  it("rejects a stale Owner access object after a role downgrade without relying on session revocation", async () => {
    const site = await db.site.findUniqueOrThrow({
      where: { id: access.siteId },
    });
    const freshAccess = { ...access, site };
    const w = await createWorkspace(freshAccess, {
      title: "Role change",
      brief: "Update brand radius",
      locales: [site.defaultLocale],
    });
    const brand = await db.branding.findUniqueOrThrow({
      where: { siteId: access.siteId },
    });
    await db.membership.update({
      where: {
        siteId_userId: { siteId: access.siteId, userId: access.user.id },
      },
      data: { role: "EDITOR" },
    });
    try {
      await expect(
        stageOperation(freshAccess, w.id, {
          resource: "branding",
          key: "brand",
          recordId: brand.id,
          payload: { radius: 20 },
        }),
      ).rejects.toThrow("cannot edit");
      expect((await ownedWorkspace(freshAccess, w.id)).operations).toHaveLength(
        0,
      );
    } finally {
      await db.membership.update({
        where: {
          siteId_userId: { siteId: access.siteId, userId: access.user.id },
        },
        data: { role: "OWNER" },
      });
    }
  });
});

describe("resumable generation allowances", () => {
  it("resumes a previously exhausted run with its staged records and checkpoint intact", async () => {
    const site = await db.site.findUniqueOrThrow({
      where: { id: access.siteId },
    });
    const actor = { ...access, site };
    const w = await createWorkspace(actor, {
      title: "Old stopped run",
      brief: "Continue the existing proposal without recreating it.",
      locales: [site.defaultLocale],
    });
    const record = await stageOperation(
      actor,
      w.id,
      {
        resource: "categories",
        key: "preserved",
        payload: {
          slug: "preserved-" + w.id,
          translations: [
            { locale: site.defaultLocale, name: "Preserved category" },
          ],
        },
      },
      { manual: true },
    );
    const before = await ownedWorkspace(actor, w.id);
    const run = await queueRun(actor, w.id, {
      revision: before.revision,
      key: crypto.randomUUID(),
      message: "Continue from the saved proposal.",
    });
    const checkpoint = [
      { role: "user", content: "Saved continuation instruction" },
    ];
    await db.aiRun.update({
      where: { id: run.id },
      data: {
        state: "FAILED",
        calls: 3200,
        inputTokens: 50000000,
        outputTokens: 6400000,
        error: "This run reached its generation budget.",
        input: checkpoint,
      },
    });
    await db.aiWorkspace.update({
      where: { id: w.id },
      data: { state: "DRAFT" },
    });
    const current = await ownedWorkspace(actor, w.id);
    await resumeBuilderRun(actor, w.id, current.revision);
    const resumed = await db.aiRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(resumed.input).toEqual(checkpoint);
    expect(resumed.calls).toBe(3200);
    expect(resumed.inputTokens).toBe(50000000);
    expect(resumed.budgetStartedCalls).toBe(3200);
    expect(resumed.budgetStartedInputTokens).toBe(50000000);
    expect(resumed.budgetStartedOutputTokens).toBe(6400000);
    const generate = vi.fn(async () => ({
      status: "completed",
      usage: { input_tokens: 10, output_tokens: 10 },
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                message: "Continued your existing proposal.",
                questions: [],
              }),
            },
          ],
        },
      ],
    }));
    await builderTick(generate);
    expect(generate).toHaveBeenCalledOnce();
    expect(
      (await db.aiRun.findUniqueOrThrow({ where: { id: run.id } })).calls,
    ).toBe(3201);
    expect((await ownedWorkspace(actor, w.id)).operations[0].targetId).toBe(
      record.targetId,
    );
  });
  it("compacts long transcripts into a checkpoint instead of blocking continuation", async () => {
    const site = await db.site.findUniqueOrThrow({
      where: { id: access.siteId },
    });
    const actor = { ...access, site };
    const w = await createWorkspace(actor, {
      title: "Long conversation",
      brief: "Keep my saved work and finish.",
      locales: [site.defaultLocale],
    });
    const run = await queueRun(actor, w.id, {
      revision: w.revision,
      key: crypto.randomUUID(),
      message: "Continue my saved site.",
    });
    await db.aiRun.update({
      where: { id: run.id },
      data: { input: [{ role: "user", content: "x".repeat(2000100) }] },
    });
    const generate = vi.fn(async (body: any) => {
      expect(JSON.stringify(body.input).length).toBeLessThan(300000);
      expect(
        body.input.some(
          (m: any) =>
            m.role === "developer" && m.content.includes("checkpoint"),
        ),
      ).toBe(true);
      return {
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  message: "Continued using saved context.",
                  questions: [],
                }),
              },
            ],
          },
        ],
      };
    });
    await builderTick(generate);
    expect(generate).toHaveBeenCalledOnce();
    expect((await ownedWorkspace(actor, w.id)).state).toBe("READY");
  });
  it("resumes a cancelled job under freshly authenticated access", async () => {
    const site = await db.site.findUniqueOrThrow({
      where: { id: access.siteId },
    });
    const actor = { ...access, site };
    const w = await createWorkspace(actor, {
      title: "Cancelled job",
      brief: "Resume later.",
      locales: [site.defaultLocale],
    });
    const run = await queueRun(actor, w.id, {
      revision: w.revision,
      key: crypto.randomUUID(),
      message: "Prepare the site.",
    });
    await cancelRun(actor, w.id, (await ownedWorkspace(actor, w.id)).revision);
    const user = await db.user.update({
      where: { id: access.user.id },
      data: { sessionVersion: { increment: 1 } },
    });
    try {
      await resumeBuilderRun(
        { ...actor, user: { ...actor.user, ...user } },
        w.id,
        (await ownedWorkspace(actor, w.id)).revision,
      );
      expect(
        (await db.aiRun.findUniqueOrThrow({ where: { id: run.id } }))
          .sessionVersion,
      ).toBe(user.sessionVersion);
      await cancelRun(
        { ...actor, user: { ...actor.user, ...user } },
        w.id,
        (await ownedWorkspace(actor, w.id)).revision,
      );
    } finally {
      await db.user.update({
        where: { id: access.user.id },
        data: { sessionVersion: access.user.sessionVersion },
      });
    }
  });
});
