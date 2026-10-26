import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const password = process.env.E2E_PASSWORD!;
async function login(page: any, email = "owner@example.test") {
  await page.goto("/admin/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20000 });
}
async function post(page: any, path: string, body: any, method = "POST") {
  const response = await page.request.fetch(path, {
    method,
    headers: { Origin: process.env.E2E_BASE_URL || "http://localhost:3100" },
    data: body,
  });
  const result = await response.json();
  expect(response.ok(), JSON.stringify(result)).toBe(true);
  return result;
}
test("unauthenticated mutations and private reads fail safely", async ({
  request,
}) => {
  const read = await request.get("/api/banners");
  expect(read.status()).toBe(401);
  const write = await request.post("/api/templates", {
    headers: { Origin: "http://localhost:3100" },
    data: { name: "Unauthorized", fields: [] },
  });
  expect(write.status()).toBe(401);
  const forged = await request.post("/api/cms/categories", {
    headers: { Origin: "https://evil.example" },
    data: {},
  });
  expect(forged.status()).toBe(403);
  const ai = await request.post("/api/ai/conversations", {
    headers: { Origin: "http://localhost:3100" },
    data: { scope: "pages", recordId: null },
  });
  expect(ai.status()).toBe(401);
});
test("staff can create a category and publish a photographed dish through the UI", async ({
  page,
}) => {
  const suffix = Date.now();
  const categoryName = "Browser soups " + suffix;
  const dishName = "Browser soup " + suffix;
  const dishSlug = "browser-soup-" + suffix;
  await login(page);
  await page.goto("/admin/categories");
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(categoryName);
  await page.getByLabel("URL identifier").fill("browser-soups-" + Date.now());
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/admin/menu");
  await page.getByRole("button", { name: "Add dish", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(dishName);
  await page.getByLabel("URL identifier").fill(dishSlug);
  await page
    .getByLabel("Category", { exact: true })
    .selectOption({ label: categoryName });
  await page.getByLabel("Price", { exact: true }).fill("12.50");
  const richDescription = page.getByRole("textbox", {
    name: "Dish description",
    exact: true,
  });
  await richDescription.fill("A carefully prepared dish from our kitchen.");
  await richDescription.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page
    .getByLabel("Publication", { exact: true })
    .selectOption("PUBLISHED");
  await page.getByRole("button", { name: "Choose image", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search images" })
    .fill("Test restaurant photograph");
  await page
    .getByRole("button", { name: "Test restaurant photograph", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Save & update live menu", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search content" }).fill(dishName);
  await expect(
    page.getByRole("button", { name: dishName, exact: true }),
  ).toBeVisible();
  const pages = await (await page.request.get("/api/cms/pages")).json();
  const menu = pages.rows.find((p: any) => p.type === "MENU");
  await post(page, `/api/pages/${menu.id}/publish`, {
    version: menu.version,
    locale: "en",
    operation: "publish",
  });
  const html = await (await page.request.get("/menu")).text();
  expect(html).toContain(dishName);
  const dishHtml = await (await page.request.get("/dishes/" + dishSlug)).text();
  expect(dishHtml).toContain(
    "<strong>A carefully prepared dish from our kitchen.</strong>",
  );
  expect(html).toContain("12.50");
  await page.goto("/menu");
  await expect(
    page.getByRole("heading", { name: dishName, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Search the menu", exact: true })
    .click();
  await page.getByRole("searchbox").fill("no-such-dish");
  await expect(page.getByText("No dishes found")).toBeVisible();
});
test("page drafts stay private, previews work and publication returns server-rendered HTML", async ({
  page,
}) => {
  await login(page);
  const suffix = Date.now();
  const slug = "browser-story-" + suffix;
  const input = {
    internalName: "Browser story " + suffix,
    type: "CUSTOM",
    translations: [
      {
        locale: "en",
        slug,
        title: "Our browser story",
        seoTitle: "A story from our kitchen",
        seoDescription: "A test of server-rendered published content.",
      },
    ],
    sections: [
      {
        type: "HERO",
        hidden: false,
        config: {},
        translations: [
          { locale: "en", content: { heading: "Our kitchen story" } },
        ],
      },
      {
        type: "RICH_TEXT",
        hidden: false,
        config: {},
        translations: [
          {
            locale: "en",
            content: {
              body: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "Freshly prepared every morning." },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  };
  const created = await post(page, "/api/cms/pages", input);
  expect((await page.request.get("/" + slug)).status()).toBe(404);
  await page.goto(`/admin/preview/${created.id}`);
  await expect(
    page.getByRole("heading", { name: "Our kitchen story" }),
  ).toBeVisible();
  await post(page, `/api/pages/${created.id}/publish`, {
    version: created.version,
    locale: "en",
    operation: "publish",
  });
  const published = await (await page.request.get("/" + slug)).text();
  expect(published).toContain("Freshly prepared every morning.");
  expect(published).toContain("A story from our kitchen");
  expect(published).toContain("application/ld+json");
  const current = (
    await (await page.request.get("/api/cms/pages/" + created.id)).json()
  ).rows[0];
  await post(
    page,
    "/api/cms/pages/" + created.id,
    {
      ...input,
      version: current.version,
      translations: [
        { locale: "en", slug, title: "Unpublished changed title" },
      ],
    },
    "PUT",
  );
  expect(await (await page.request.get("/" + slug)).text()).not.toContain(
    "Unpublished changed title",
  );
  await page.goto("/admin/pages");
  await page
    .getByRole("searchbox", { name: "Search content" })
    .fill(input.internalName);
  await page
    .getByRole("button", { name: input.internalName, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Page sections" }),
  ).toBeVisible();
});
test("Editors are forbidden from changing permissions and integrations", async ({
  page,
}) => {
  await login(page, "editor@example.test");
  const response = await page.request.post("/api/cms/integrations", {
    headers: { Origin: "http://localhost:3100" },
    data: {
      provider: "Unsafe",
      label: "Unsafe",
      url: "https://example.com",
      enabled: true,
    },
  });
  expect(response.status()).toBe(403);
  expect((await page.request.get("/api/cms/users")).status()).toBe(403);
  expect(
    (
      await page.request.post("/api/ai/conversations", {
        headers: { Origin: "http://localhost:3100" },
        data: { scope: "integrations", recordId: null },
      })
    ).status(),
  ).toBe(403);
});
test("localization, unsafe content rejection and signage use shared menu data", async ({
  page,
}) => {
  await login(page);
  const suffix = Date.now();
  const bgName = "Общо ястие " + suffix;
  const locales = (await (await page.request.get("/api/cms/locales")).json())
    .rows;
  if (!locales.some((l: any) => l.code === "bg"))
    await post(page, "/api/cms/locales", {
      code: "bg",
      label: "Български",
      enabled: true,
      direction: "ltr",
      strings: [
        { key: "menu", value: "Меню" },
        { key: "search", value: "Търсене в менюто" },
      ],
    });
  const category = await post(page, "/api/cms/categories", {
    slug: "shared-" + suffix,
    enabled: true,
    translations: [
      { locale: "en", name: "Shared dishes" },
      { locale: "bg", name: "Общи ястия" },
    ],
  });
  let item = await post(page, "/api/cms/items", {
    categoryId: category.id,
    slug: "shared-dish-" + suffix,
    price: "15.00",
    currency: "EUR",
    status: "PUBLISHED",
    available: true,
    featured: false,
    translations: [
      { locale: "en", name: "Shared dish" },
      { locale: "bg", name: bgName },
    ],
    variants: [],
    tagIds: [],
    imageIds: [],
  });
  const templates = (await (await page.request.get("/api/templates")).json())
    .templates;
  const template = templates.find((t: any) => t.key === "price-board");
  const bannerResponse = await page.request.post("/api/banners", {
    headers: { Origin: "http://localhost:3100" },
    multipart: {
      templateId: template.id,
      sourceMode: "CATEGORY",
      menuCategoryId: category.id,
      sourceLocale: "bg",
    },
  });
  expect(bannerResponse.ok()).toBe(true);
  const banner = await bannerResponse.json();
  await post(page, `/api/signage/banners/${banner.id}/publish`, {
    version: banner.version,
    operation: "publish",
  });
  const slide = await post(page, "/api/slides", {
    name: "Shared display",
    speedMs: 2000,
    effect: "FADE",
    bannerIds: [banner.id],
  });
  await post(page, `/api/signage/slides/${slide.id}/publish`, {
    version: slide.version,
    operation: "publish",
  });
  const first = await page.request.get("/api/slides/" + slide.id);
  const firstData = await first.json();
  expect(firstData.items[0].banner).not.toHaveProperty("publicationSnapshot");
  expect(firstData.items[0].banner.data.rows[0].price).toBe("15");
  expect(firstData.items[0].banner.data.rows[0].name).toBe(bgName);
  item = await post(
    page,
    "/api/cms/items/" + item.id,
    {
      ...item,
      version: item.version,
      price: "16.50",
      translations: [
        { locale: "en", name: "Shared dish" },
        { locale: "bg", name: bgName },
      ],
      variants: [],
      tagIds: [],
      imageIds: [],
    },
    "PUT",
  );
  const second = await page.request.get("/api/slides/" + slide.id);
  expect(second.headers().etag).not.toBe(first.headers().etag);
  expect((await second.json()).items[0].banner.data.rows[0].price).toBe("16.5");
  await page.goto("/slide/" + slide.id);
  await expect(page.getByText(bgName)).toBeVisible();
  await post(
    page,
    "/api/cms/items/" + item.id,
    {
      ...item,
      version: item.version,
      available: false,
      translations: [
        { locale: "en", name: "Shared dish" },
        { locale: "bg", name: bgName },
      ],
      variants: [],
      tagIds: [],
      imageIds: [],
    },
    "PUT",
  );
  expect(
    (await (await page.request.get("/api/slides/" + slide.id)).json()).items,
  ).toHaveLength(0);
  const pageRows = (await (await page.request.get("/api/cms/pages")).json())
    .rows;
  const menu = pageRows.find((p: any) => p.type === "MENU");
  const localizedMenu = await post(
    page,
    "/api/cms/pages/" + menu.id,
    {
      ...menu,
      version: menu.version,
      translations: [
        { locale: "en", slug: "menu", title: "Menu" },
        {
          locale: "bg",
          slug: "menyu",
          title: "Меню",
          seoTitle: "Меню на ресторанта",
        },
      ],
    },
    "PUT",
  );
  await post(page, `/api/pages/${menu.id}/publish`, {
    version: localizedMenu.version,
    locale: "bg",
    operation: "publish",
  });
  await page.goto("/bg/menyu");
  await expect(
    page.getByRole("heading", { name: bgName, exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "bg");
  await expect(page).toHaveTitle("Меню на ресторанта");
  expect(await (await page.request.get("/bg/menyu")).text()).toMatch(
    /hreflang=/i,
  );
  const unsafe = await page.request.post("/api/cms/actions", {
    headers: { Origin: "http://localhost:3100" },
    data: {
      name: "Unsafe",
      type: "EXTERNAL",
      destination: "javascript:alert(1)",
      style: "primary",
      enabled: true,
      newTab: false,
      translations: [{ locale: "en", label: "Unsafe" }],
    },
  });
  expect(unsafe.status()).toBe(422);
});
test("admin and mobile public layouts have no serious automated accessibility violations", async ({
  page,
}) => {
  await login(page);
  const admin = await new AxeBuilder({ page }).analyze();
  expect(
    admin.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/menu");
  await expect(page.locator("main")).toBeVisible();
  const publicResult = await new AxeBuilder({ page }).analyze();
  expect(
    publicResult.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("external ordering actions disappear when their provider is disabled", async ({
  page,
}) => {
  await login(page);
  const suffix = Date.now();
  const integration = await post(page, "/api/cms/integrations", {
    provider: "Wolt",
    label: "Order test",
    url: "https://example.com/store",
    enabled: true,
  });
  const action = await post(page, "/api/cms/actions", {
    name: "Order action " + suffix,
    type: "ORDERING",
    integrationId: integration.id,
    style: "primary",
    enabled: true,
    newTab: false,
    translations: [{ locale: "en", label: "Order browser test" }],
  });
  const story = await post(page, "/api/cms/pages", {
    internalName: "Ordering " + suffix,
    type: "CUSTOM",
    translations: [
      { locale: "en", slug: "ordering-" + suffix, title: "Ordering test" },
    ],
    sections: [
      {
        type: "CTA",
        config: { actionIds: [action.id] },
        translations: [{ locale: "en", content: { heading: "Order a meal" } }],
      },
    ],
  });
  await post(page, `/api/pages/${story.id}/publish`, {
    version: story.version,
    locale: "en",
    operation: "publish",
  });
  await page.goto("/ordering-" + suffix);
  await expect(
    page.getByRole("link", { name: "Order browser test" }).first(),
  ).toBeVisible();
  await post(
    page,
    "/api/cms/integrations/" + integration.id,
    { ...integration, version: integration.version, enabled: false },
    "PUT",
  );
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Order browser test" }),
  ).toHaveCount(0);
});

test("mobile staff navigation keeps focus in the drawer and restores it on Escape", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const open = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  await open.click();
  const drawer = page.getByRole("dialog", { name: "Restaurant navigation" });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Close navigation", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.getByRole("button", { name: "Sign out" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(open).toBeFocused();
});
