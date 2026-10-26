import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
let worker: ChildProcess;
test.beforeAll(() => {
  if (
    !process.env.TEST_DATABASE_URL ||
    !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test")
  )
    throw new Error(
      "AI builder browser checks require TEST_DATABASE_URL ending in _test.",
    );
  worker = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/builder-worker.ts"],
    { cwd: process.cwd(), env: process.env, stdio: "ignore" },
  );
});
test.afterAll(async () => {
  if (worker && !worker.killed) {
    worker.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (worker.exitCode !== null) return resolve();
      worker.once("exit", () => resolve());
      setTimeout(() => {
        worker.kill("SIGKILL");
        resolve();
      }, 5000).unref();
    });
  }
});
test("one brief produces a bilingual connected site, private previews, editable dishes and atomic publication", async ({
  page,
}) => {
  test.setTimeout(120000);
  const stamp = Date.now();
  await page.goto("/admin/login");
  await page.getByLabel("Email address").fill("designer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/ai-builder");
  await page.getByRole("button", { name: "New update request" }).click();
  const create = page.getByRole("dialog", {
    name: "Update your website",
  });
  await create.getByLabel("Request name").fill("Whole-site browser " + stamp);
  await create
    .getByLabel("Requested changes and restaurant facts")
    .fill(
      `TEST-${stamp}. Build Home, Menu and a story page in English and Bulgarian. Garden salad price 12.50 EUR, confirmed vegan. Ingredients: tomato and cucumber. Use the photographs already in our library.`,
    );
  await create
    .getByLabel("Website languages (codes separated by commas)")
    .fill("en, bg");
  await create.getByRole("button", { name: "Prepare updates" }).click();
  await expect(
    page.getByText(
      "Your bilingual pages, menu, dietary label, photographs, navigation and SEO are ready for review. Nothing is live until you accept.",
    ),
  ).toBeVisible({ timeout: 90000 });
  await expect(
    page.getByRole("button", { name: "Accept and publish all" }),
  ).toBeEnabled();
  const before = await (await page.request.get("/menu")).text();
  expect(before).not.toContain("AI garden salad " + stamp);
  const frame = page.frameLocator(
    'iframe[title="Private website proposal preview"]',
  );
  await expect(
    frame.getByText("AI garden salad " + stamp, { exact: true }).first(),
  ).toBeVisible();
  await frame
    .getByRole("link", {
      name: "View details: AI garden salad " + stamp,
      exact: true,
    })
    .first()
    .click();
  await expect(
    frame.getByRole("heading", {
      name: "AI garden salad " + stamp,
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    frame.getByText("Private dish proposal · Not live", { exact: true }),
  ).toBeVisible();
  expect(
    (await page.request.get("/dishes/builder-garden-" + stamp)).status(),
  ).toBe(404);
  await page
    .locator("iframe")
    .evaluate((iframe: HTMLIFrameElement) =>
      iframe.contentWindow?.location.assign(iframe.src),
    );
  await frame
    .getByRole("link", { name: "Read our story", exact: true })
    .click();
  await expect(
    frame.getByRole("heading", { name: "From our kitchen" }),
  ).toBeVisible();
  expect(
    await page
      .locator("iframe")
      .evaluate(
        (iframe: HTMLIFrameElement) => iframe.contentWindow?.location.pathname,
      ),
  ).toMatch(/^\/preview\/site\//);
  const dish = page.locator(".ai-builder-group article").filter({
    has: page.getByText("AI garden salad " + stamp, { exact: true }),
  });
  await dish.getByRole("button", { name: "Review / edit" }).click();
  const edit = page.getByRole("dialog", {
    name: "Review AI garden salad " + stamp,
  });
  await edit.getByLabel("Price", { exact: true }).fill("12,99");
  await edit
    .getByRole("button", { name: "Save to proposal", exact: true })
    .click();
  await expect(edit).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept and publish all" }),
  ).toBeDisabled();
  await dish.getByRole("button", { name: "Review / edit" }).click();
  await edit.getByLabel("Price", { exact: true }).fill("12.99");
  await edit
    .getByRole("button", { name: "Save to proposal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Accept and publish all" }),
  ).toBeEnabled();
  const violations = (
    await new AxeBuilder({ page }).include(".ai-builder-layout").analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(violations).toEqual([]);
  await page.getByRole("button", { name: "Accept and publish all" }).click();
  await expect(page.getByText(/Published \d+ records on/)).toBeVisible({
    timeout: 30000,
  });
  const publicHtml = await (await page.request.get("/menu")).text();
  expect(publicHtml).toContain("AI garden salad " + stamp);
  expect(publicHtml).toContain("12.99");
  const localized = await (
    await page.request.get("/bg/menu-builder-bg")
  ).text();
  expect(localized).toContain("AI градинска салата " + stamp);
  expect(localized).toContain("<title>Нашето меню | Тест ресторант</title>");
});
test("central agent rejects unauthenticated requests and private whole-site previews", async ({
  request,
  page,
}) => {
  expect((await request.get("/api/ai/workspaces")).status()).toBe(401);
  const response = await request.post("/api/ai/workspaces", {
    headers: { Origin: process.env.E2E_BASE_URL || "http://localhost:3100" },
    data: { title: "Unauthorized", brief: "Do not create", locales: ["en"] },
  });
  expect(response.status()).toBe(401);
  await page.goto("/preview/site/not-public");
  expect(await page.locator(".public-site").count()).toBe(0);
});

test("an existing budget-stopped run resumes its original proposal and retains usage", async ({
  page,
}) => {
  test.setTimeout(60000);
  const stamp = Date.now();
  await page.goto("/admin/login");
  await page.getByLabel("Email address").fill("designer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const origin = process.env.E2E_BASE_URL || "http://localhost:3100";
  const response = await page.request.post("/api/ai/workspaces", {
    headers: { Origin: origin },
    data: {
      title: "Resume saved site " + stamp,
      brief: `RESUME-CHECK TEST-${stamp}. Continue the existing saved proposal.`,
      locales: ["en"],
    },
  });
  expect(response.ok()).toBe(true);
  const w = await response.json();
  const staged = await page.request.post(`/api/ai/workspaces/${w.id}/stage`, {
    headers: { Origin: origin },
    data: {
      revision: 0,
      key: "existing",
      resource: "categories",
      payload: {
        slug: "existing-" + stamp,
        translations: [
          { locale: "en", name: "Keep my existing work " + stamp },
        ],
      },
    },
  });
  expect(staged.ok()).toBe(true);
  const preserved = await staged.json();
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({
    datasources: { db: { url: process.env.TEST_DATABASE_URL! } },
  });
  try {
    const user = await db.user.findUniqueOrThrow({ where: { id: w.ownerId } });
    const request = await db.aiRequest.create({
      data: {
        siteId: w.siteId,
        ownerId: w.ownerId,
        conversationId: w.conversationId,
        key: crypto.randomUUID(),
        model: "gpt-6-luna",
        status: "FAILED",
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const run = await db.aiRun.create({
      data: {
        workspaceId: w.id,
        requestId: request.id,
        sessionVersion: user.sessionVersion,
        state: "FAILED",
        calls: 64,
        inputTokens: 1000000,
        outputTokens: 128000,
        input: [],
        error:
          "This run reached its generation budget. Your proposal is preserved; review it or start a new instruction to continue.",
      },
    });
    await page.goto("/admin/ai-builder");
    await expect(
      page.getByRole("button", { name: "Resume run" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Resume run" }).click();
    await expect(
      page.getByText("Resumed the saved proposal.", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByText("Keep my existing work " + stamp, { exact: true }),
    ).toBeVisible();
    const result = await db.aiRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(result.calls).toBe(66);
    expect(result.budgetStartedCalls).toBe(64);
    expect(result.budgetStartedInputTokens).toBe(1000000);
    expect(result.inputTokens).toBeGreaterThan(1000000);
    expect(
      (
        await db.aiOperation.findUniqueOrThrow({
          where: { workspaceId_key: { workspaceId: w.id, key: "existing" } },
        })
      ).targetId,
    ).toBe(preserved.targetId);
  } finally {
    await db.$disconnect();
  }
});

test("generated prices can be reviewed and published together without editing each dish", async ({
  page,
}) => {
  test.setTimeout(60000);
  const stamp = Date.now();
  await page.goto("/admin/login");
  await page.getByLabel("Email address").fill("designer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const headers = {
    Origin: process.env.E2E_BASE_URL || "http://localhost:3100",
  };
  const created = await page.request.post("/api/ai/workspaces", {
    headers,
    data: {
      title: "Bulk review " + stamp,
      brief: "Prepare a proposed menu for my review.",
      locales: ["en"],
    },
  });
  expect(created.ok()).toBe(true);
  const w = await created.json();
  const staged = await page.request.post(`/api/ai/workspaces/${w.id}/stage`, {
    headers,
    data: {
      revision: 0,
      key: "category",
      resource: "categories",
      payload: {
        slug: "review-" + stamp,
        translations: [{ locale: "en", name: "Review dishes " + stamp }],
      },
    },
  });
  expect(staged.ok()).toBe(true);
  const category = await staged.json();
  const detail = await (
    await page.request.get(`/api/ai/workspaces/${w.id}`)
  ).json();
  const dishResponse = await page.request.post(
    `/api/ai/workspaces/${w.id}/stage`,
    {
      headers,
      data: {
        revision: detail.workspace.revision,
        key: "dish",
        resource: "items",
        payload: {
          categoryId: category.targetId,
          slug: "review-dish-" + stamp,
          price: "18.75",
          currency: "EUR",
          status: "DRAFT",
          available: true,
          featured: false,
          variants: [],
          tagIds: [],
          imageIds: [],
          translations: [{ locale: "en", name: "Proposed dish " + stamp }],
        },
      },
    },
  );
  expect(dishResponse.ok()).toBe(true);
  await dishResponse.json();
  if (!process.env.TEST_DATABASE_URL?.split("?")[0].endsWith("_test"))
    throw new Error("Use an isolated test database.");
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({
    datasources: { db: { url: process.env.TEST_DATABASE_URL } },
  });
  try {
    await db.aiOperation.update({
      where: { workspaceId_key: { workspaceId: w.id, key: "dish" } },
      data: { manual: false, facts: [] },
    });
    await page.goto("/admin/ai-builder");
    const accept = page.getByRole("button", {
      name: "Accept and publish all",
      exact: true,
    });
    await expect(accept).toBeEnabled();
    await accept.click();
    const dialog = page.getByRole("dialog", {
      name: "Review business facts before publishing",
    });
    await expect(
      dialog.getByText("Proposed dish " + stamp, { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText("18.75", { exact: true })).toBeVisible();
    const confirm = dialog.getByRole("button", {
      name: "Confirm and publish all",
    });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    await confirm.click();
    await expect(page.getByText(/Published \d+ records on/)).toBeVisible({
      timeout: 30000,
    });
    const saved = await db.aiWorkspace.findUniqueOrThrow({
      where: { id: w.id },
    });
    expect((saved.receipt as any).businessFactsConfirmed).toBe(true);
  } finally {
    await db.$disconnect();
  }
});
