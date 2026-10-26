import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/server/ai/model", async (original) => ({
  ...(await original<typeof import("@/server/ai/model")>()),
  generateTurn: vi.fn(),
}));
import { db } from "@/server/db";
import { saveResource, type Access } from "@/server/cms";
import {
  openConversation,
  ownedConversation,
  attachConversation,
  clearConversation,
  runTurn,
} from "@/server/ai/service";
import { generateTurn } from "@/server/ai/model";
let access: Access;
let categoryId: string;
const model = vi.mocked(generateTurn);
beforeAll(async () => {
  const site = await db.site.create({
    data: {
      key: "ai-test-" + crypto.randomUUID(),
      name: "AI test restaurant",
      locales: {
        create: [
          { code: "en", label: "English" },
          { code: "bg", label: "Bulgarian" },
        ],
      },
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
  const category = await db.menuCategory.create({
    data: {
      siteId: site.id,
      slug: "soups",
      translations: { create: { locale: "en", name: "Soups" } },
    },
  });
  categoryId = category.id;
  access = { site, siteId: site.id, user, role: "OWNER" } as Access;
});
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key-never-sent");
  vi.stubEnv("AI_USER_HOURLY_LIMIT", "100");
  vi.stubEnv("AI_SITE_DAILY_LIMIT", "1000");
  model.mockReset();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  if (!access) return;
  await db.aiConversation.deleteMany({ where: { siteId: access.siteId } });
  await db.aiRequest.deleteMany({ where: { siteId: access.siteId } });
  await db.menuCategory.deleteMany({ where: { siteId: access.siteId } });
  await db.siteLocale.deleteMany({ where: { siteId: access.siteId } });
  await db.membership.deleteMany({ where: { siteId: access.siteId } });
  await db.auditLog.deleteMany({ where: { siteId: access.siteId } });
  await db.site.delete({ where: { id: access.siteId } });
  await db.user.delete({ where: { id: access.user.id } });
  await db.$disconnect();
});
const payload = (revision = 0) => ({
  key: crypto.randomUUID(),
  revision,
  message: "Improve the description in English",
  locales: ["en"],
  draft: { translations: [{ locale: "en", name: "Soups", description: "" }] },
});
const response = (
  changes: Array<{ field: string; valueJson: string }> = [],
) => ({
  output: {
    message: "I filled the form. Review and save.",
    questions: [],
    changes,
  },
  inputTokens: 100,
  outputTokens: 40,
});
describe.sequential("persistent modal assistant", () => {
  it("delivers invalid business copy as a draft and keeps save validation enforced", async () => {
    const { conversation } = await openConversation(access, "categories", null);
    model.mockResolvedValue(
      response([
        { field: "slug", valueJson: '"Slug to correct"' },
        {
          field: "translations",
          valueJson: JSON.stringify([
            {
              locale: "en",
              name: "",
              description: "Draft copy that should reach the editor.",
            },
          ]),
        },
      ]),
    );
    const result = (await runTurn(
      access,
      conversation.id,
      payload(),
      async () => access,
    )) as any;
    expect(result.message.body.changes).toHaveLength(2);
    expect(result.message.body.warnings).not.toHaveLength(0);
    const draft = Object.fromEntries(
      result.message.body.changes.map((c: any) => [c.field, c.value]),
    );
    await expect(
      saveResource(access, "categories", { ...draft, enabled: true }),
    ).rejects.toThrow();
    const corrected = await saveResource(access, "categories", {
      ...draft,
      slug: "fixed-" + crypto.randomUUID(),
      enabled: true,
      translations: [{ ...draft.translations[0], name: "Corrected category" }],
    });
    await attachConversation(access, conversation.id, corrected.id);
    expect(
      (await openConversation(access, "categories", corrected.id)).messages,
    ).toHaveLength(2);
  });
  it("isolates history by employee, site and editing permission", async () => {
    const opened = await openConversation(access, "categories", categoryId);
    expect(
      (await openConversation(access, "categories", categoryId)).conversation
        .id,
    ).toBe(opened.conversation.id);
    await expect(
      ownedConversation(
        { ...access, user: { ...access.user, id: "other-user" } } as Access,
        opened.conversation.id,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      ownedConversation(
        { ...access, siteId: "other-site" },
        opened.conversation.id,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      openConversation({ ...access, role: "EDITOR" }, "branding", null),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      openConversation(access, "categories", "foreign-id"),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("returns validated patches without saving content and deduplicates successful turns", async () => {
    const { conversation } = await openConversation(
      access,
      "categories",
      categoryId,
    );
    const input = payload(conversation.revision);
    model.mockResolvedValue(
      response([
        {
          field: "translations",
          valueJson: JSON.stringify([
            {
              locale: "en",
              name: "Soups",
              description: "Warm, comforting bowls.",
            },
          ]),
        },
      ]),
    );
    const first = await runTurn(
      access,
      conversation.id,
      input,
      async () => access,
    );
    expect(
      await runTurn(access, conversation.id, input, async () => access),
    ).toEqual(JSON.parse(JSON.stringify(first)));
    expect(model).toHaveBeenCalledTimes(1);
    const category = await db.menuCategory.findUniqueOrThrow({
      where: { id: categoryId },
      include: { translations: true },
    });
    expect(category.translations[0].description).not.toBe(
      "Warm, comforting bowls.",
    );
    expect(
      (await openConversation(access, "categories", categoryId)).messages,
    ).toHaveLength(2);
  });
  it("stores an answered clarification table as one user Q&A message", async () => {
    const { conversation } = await openConversation(access, "categories", null);
    model.mockResolvedValue({
      ...response(),
      output: {
        ...response().output,
        questions: [
          {
            id: "style",
            question: "What is the tone?",
            kind: "select",
            options: ["Warm", "Formal"],
            required: true,
          },
        ],
      },
    });
    const first = (await runTurn(
      access,
      conversation.id,
      payload(),
      async () => access,
    )) as any;
    model.mockResolvedValue(response());
    await runTurn(
      access,
      conversation.id,
      {
        ...payload(1),
        message: "",
        questionMessageId: first.message.id,
        answers: [{ questionId: "style", answer: "Warm" }],
      },
      async () => access,
    );
    const messages = await db.aiMessage.findMany({
      where: { conversationId: conversation.id, role: "user" },
      orderBy: { createdAt: "asc" },
    });
    expect(messages[1].body).toMatchObject({
      answers: [
        { questionId: "style", question: "What is the tone?", answer: "Warm" },
      ],
    });
  });
  it("rejects unsafe generated fields and unconfigured languages", async () => {
    const { conversation } = await openConversation(access, "categories", null);
    model.mockResolvedValue(
      response([{ field: "siteId", valueJson: '"foreign"' }]),
    );
    const result = (await runTurn(
      access,
      conversation.id,
      payload(),
      async () => access,
    )) as any;
    expect(result.message.body.changes).toEqual([]);
    expect(result.message.body.unapplied[0].field).toBe("siteId");
    expect(
      await db.aiMessage.count({ where: { conversationId: conversation.id } }),
    ).toBe(2);
    model.mockClear();
    await expect(
      runTurn(
        access,
        conversation.id,
        { ...payload(), locales: ["fr"] },
        async () => access,
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(model).not.toHaveBeenCalled();
  });
  it("attaches unsaved chats and clears private content without resetting usage quotas", async () => {
    const { conversation } = await openConversation(access, "media", null);
    const media = await db.mediaAsset.create({
      data: {
        siteId: access.siteId,
        key: "ai-test-" + crypto.randomUUID(),
        url: "https://example.test/photo.webp",
        mime: "image/webp",
        size: 10,
        width: 1,
        height: 1,
        alt: "",
      },
    });
    try {
      await attachConversation(access, conversation.id, media.id);
      expect(
        (await openConversation(access, "media", media.id)).conversation.id,
      ).toBe(conversation.id);
      model.mockResolvedValue(
        response([
          { field: "caption", valueJson: '"A staff-described photograph."' },
        ]),
      );
      await runTurn(
        access,
        conversation.id,
        { ...payload(), draft: { caption: "" } },
        async () => access,
      );
      await clearConversation(access, conversation.id);
      expect(
        await db.aiMessage.count({
          where: { conversationId: conversation.id },
        }),
      ).toBe(0);
      expect(
        await db.aiRequest.findFirst({
          where: {
            key: { not: "" },
            conversationId: null,
            siteId: access.siteId,
            status: "CLEARED",
          },
        }),
      ).toMatchObject({ result: null, inputTokens: 100 });
    } finally {
      await db.mediaAsset.delete({ where: { id: media.id } });
    }
  });
  it("fails closed on revoked permission, unavailable credentials and quota limits", async () => {
    const { conversation } = await openConversation(access, "categories", null);
    model.mockResolvedValue(response());
    await expect(
      runTurn(access, conversation.id, payload(), async () => {
        throw new Error("revoked");
      }),
    ).rejects.toMatchObject({ status: 502 });
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(
      runTurn(access, conversation.id, payload(), async () => access),
    ).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("OPENAI_API_KEY", "test-key-never-sent");
    vi.stubEnv("AI_USER_HOURLY_LIMIT", "1");
    await expect(
      runTurn(access, conversation.id, payload(), async () => access),
    ).rejects.toMatchObject({ status: 429 });
  });
});
