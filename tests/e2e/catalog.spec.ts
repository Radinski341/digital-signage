import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
let context: BrowserContext;
let categoryId: string;
let menuSlug: string;
let categoryName: string;
let itemName: string;
let itemSlug: string;
let itemId: string;
let locationsSlug: string;
let locationName: string;
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3100";
async function save(page: Page, path: string, data: unknown, method = "POST") {
  const response = await page.request.fetch(path, {
    method,
    headers: { Origin: baseURL },
    data,
  });
  const value = await response.json();
  expect(response.ok(), JSON.stringify(value)).toBe(true);
  return value;
}
test.beforeAll(async ({ browser }) => {
  test.setTimeout(90000);
  context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/admin/login");
  await page.getByLabel("Email address").fill("designer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const configuredLocales = (
    await (await page.request.get("/api/cms/locales")).json()
  ).rows;
  if (
    !configuredLocales.some(
      (entry: any) => entry.code === "bg" && entry.enabled,
    )
  ) {
    await save(page, "/api/cms/locales", {
      code: "bg",
      label: "Български",
      enabled: true,
      direction: "ltr",
      strings: [],
    });
  }
  const suffix = Date.now();
  itemName = "Catalog dish " + suffix;
  locationName = "Test kitchen central " + suffix;
  const category = await save(page, "/api/cms/categories", {
    slug: "catalog-" + suffix,
    enabled: true,
    translations: [
      {
        locale: "en",
        name: "Catalog selection " + suffix,
        description: "Freshly prepared favorites from our kitchen.",
      },
    ],
  });
  categoryId = category.id;
  categoryName = "Catalog selection " + suffix;
  const action = await save(page, "/api/cms/actions", {
    name: "Catalog external action",
    type: "EXTERNAL",
    destination: "https://example.test/order",
    style: "primary",
    enabled: true,
    newTab: false,
    translations: [{ locale: "en", label: "Order this dish" }],
  });
  const milk = await save(page, "/api/cms/tags", {
    key: "milk-" + suffix,
    kind: "ALLERGEN",
    translations: [
      { locale: "en", name: "Milk" },
      { locale: "bg", name: "Мляко" },
    ],
  });
  for (let index = 0; index < 8; index++) {
    const dish = await save(page, "/api/cms/items", {
      categoryId,
      slug: "catalog-item-" + suffix + "-" + index,
      price: (12 + index).toFixed(2),
      currency: "EUR",
      status: "PUBLISHED",
      available: index !== 7,
      featured: false,
      imageId: "fixture-dish-" + (index % 5),
      actionId: index === 0 ? action.id : null,
      translations: [
        {
          locale: "en",
          name: index === 0 ? itemName : itemName + " " + index,
          description: "Test menu photography and card layout.",
          details:
            "Prepared for the isolated browser verification.\n\nA second paragraph with kitchen details.",
          ...(index === 0
            ? {
                detailsDocument: {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          text: "Prepared for the isolated browser verification.",
                          marks: [{ type: "bold" }],
                        },
                      ],
                    },
                    {
                      type: "heading",
                      attrs: { level: 3 },
                      content: [{ type: "text", text: "Taste and serving" }],
                    },
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          text: "A second paragraph with kitchen details.",
                        },
                      ],
                    },
                    {
                      type: "bulletList",
                      content: [
                        {
                          type: "listItem",
                          content: [
                            {
                              type: "paragraph",
                              content: [
                                { type: "text", text: "Prepared to order" },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              }
            : {}),
          seoTitle: index === 0 ? "Dish SEO " + suffix : undefined,
          seoDescription:
            "Discover this dish, portion options and restaurant ordering details.",
        },
        ...(index === 0
          ? [
              {
                locale: "bg",
                name: "Ястие " + suffix,
                description: "Описание на ястието",
                details: "Подробно описание на ястието.",
                detailsDocument: {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          text: "Подробно описание на ястието.",
                          marks: [{ type: "bold" }],
                        },
                      ],
                    },
                  ],
                },
                seoTitle: "Специално ястие " + suffix,
                seoDescription: "Порции, цена и информация за ястието.",
              },
            ]
          : []),
      ],
      variants:
        index === 0
          ? [
              {
                price: "18.00",
                translations: [{ locale: "en", name: "Large portion" }],
              },
            ]
          : [],
      tagIds: index === 0 ? [milk.id] : [],
      imageIds: [],
    });
    if (index === 0) {
      itemSlug = dish.slug;
      itemId = dish.id;
    }
  }
  const pages = (await (await page.request.get("/api/cms/pages")).json()).rows;
  const menu = pages.find((record: any) => record.type === "MENU");
  menuSlug = menu.translations.find(
    (translation: any) => translation.locale === "en",
  ).publishedSlug;
  const menuDraft = await save(
    page,
    "/api/cms/pages/" + menu.id,
    {
      version: menu.version,
      type: "MENU",
      internalName: menu.internalName,
      translations: menu.translations,
      sections: [
        {
          type: "MENU_HIGHLIGHTS",
          config: { categoryIds: [categoryId], itemIds: [], limit: 4 },
          translations: [
            {
              locale: "en",
              content: {
                heading: "Duplicate menu highlights",
                subtitle: "",
                caption: "",
                alt: "",
              },
            },
          ],
        },
      ],
    },
    "PUT",
  );
  await save(page, `/api/pages/${menu.id}/publish`, {
    version: menuDraft.version,
    locale: "en",
    operation: "publish",
  });
  const home = pages.find((record: any) => record.type === "HOME");
  const updated = await save(
    page,
    "/api/cms/pages/" + home.id,
    {
      version: home.version,
      type: "HOME",
      internalName: "Home",
      translations: [
        {
          locale: "en",
          slug: "",
          title: "Restaurant menu",
          seoDescription:
            "Explore our test menu and find restaurant locations.",
        },
      ],
      sections: [
        {
          type: "RICH_TEXT",
          config: {},
          translations: [
            {
              locale: "en",
              content: {
                heading: "CMS content below catalog",
                body: {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          text: "Saved homepage content remains after the structured restaurant menu.",
                        },
                      ],
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    },
    "PUT",
  );
  await save(page, `/api/pages/${home.id}/publish`, {
    version: updated.version,
    locale: "en",
    operation: "publish",
  });
  for (let index = 0; index < 2; index++)
    await save(page, "/api/cms/locations", {
      name: index ? "Test kitchen west " + suffix : locationName,
      address: "Test address " + (index + 1),
      city: "Test city",
      country: "BG",
      latitude: 42.697 + index * 0.02,
      longitude: 23.321 + index * 0.03,
      directionsUrl:
        "https://www.openstreetmap.org/?mlat=42.697&mlon=23.321#map=16/42.697/23.321",
      hours: [],
      exceptions: [],
    });
  locationsSlug = "catalog-locations-" + suffix;
  const locations = await save(page, "/api/cms/pages", {
    internalName: "Catalog locations " + suffix,
    type: "CUSTOM",
    translations: [{ locale: "en", slug: locationsSlug, title: "Locations" }],
    sections: [
      {
        type: "LOCATIONS",
        config: {},
        translations: [{ locale: "en", content: {} }],
      },
    ],
  });
  await save(page, `/api/pages/${locations.id}/publish`, {
    version: locations.version,
    locale: "en",
    operation: "publish",
  });
  const profile = (await (await page.request.get("/api/cms/profile")).json())
    .rows[0];
  await save(
    page,
    "/api/cms/profile/" + profile.id,
    {
      version: profile.version,
      name: "UZBEK BG",
      legalName: "",
      phone: "+359 000 000 000",
      email: "",
      website: "",
      domain: baseURL,
      currency: "EUR",
      timeZone: "Europe/Sofia",
      cuisines: [],
      translations: [
        {
          locale: "en",
          name: "UZBEK BG",
          summary: "Restaurant platform visual test fixture.",
        },
      ],
      socials: [{ label: "Instagram", url: "https://example.test/social" }],
    },
    "PUT",
  );
  const navigation = (
    await (await page.request.get("/api/cms/navigation")).json()
  ).rows.find((record: any) => record.key === "footer-info");
  await save(
    page,
    "/api/cms/navigation/" + navigation.id,
    {
      version: navigation.version,
      key: "footer-info",
      items: [
        {
          pageId: locations.id,
          enabled: true,
          translations: [{ locale: "en", label: "Visitor information" }],
        },
      ],
    },
    "PUT",
  );
  await page.close();
});
test.afterAll(async () => {
  await context?.close();
});

test("homepage is a four-column photo catalog with details and saved content below", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1692, height: 972 });
  await page.goto("/#category-" + categoryId);
  await page.evaluate(() => document.fonts.ready);
  const section = page.locator("#category-" + categoryId);
  await expect(section.locator(".menu-dish")).toHaveCount(8);
  expect(
    (
      await section
        .locator(".menu-dishes")
        .evaluate((node) => getComputedStyle(node).gridTemplateColumns)
    ).split(" "),
  ).toHaveLength(4);
  const html = await (await page.request.get("/")).text();
  expect(html.indexOf(itemName)).toBeLessThan(
    html.indexOf("CMS content below catalog"),
  );
  expect(await page.locator("h1").count()).toBe(1);
  await page
    .getByRole("link", { name: "View details: " + itemName, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp("/dishes/" + itemSlug + "$"));
  await expect(
    page.getByRole("heading", { name: itemName, exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".dish-page")).toContainText("Large portion");
  await expect(
    page.locator(".dish-page-description .prose-content > p"),
  ).toHaveCount(2);
  await expect(page.locator(".dish-page-description h3")).toHaveText(
    "Taste and serving",
  );
  await expect(page.locator(".dish-page-description strong")).toContainText(
    "Prepared for the isolated browser verification.",
  );
  await expect(page.locator(".dish-page-description li")).toContainText(
    "Prepared to order",
  );
  await expect(page.locator(".dish-allergen-list")).toContainText("Milk");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".dish-page").getByRole("link", { name: "Order this dish" }),
  ).toHaveAttribute("href", "https://example.test/order");
  await expect(page.locator(".dish-related .menu-dish")).toHaveCount(4);
  const violations = (
    await new AxeBuilder({ page }).include(".dish-page").analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(violations).toEqual([]);
  await page.getByRole("link", { name: "Back to menu", exact: true }).click();
  await expect(page).not.toHaveURL(/\/dishes\//);
  await mkdir("test-artifacts", { recursive: true });
  await page.screenshot({ path: "test-artifacts/catalog-desktop.png" });
});

test("mobile catalog has two columns, searchable dishes and accessible navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#category-" + categoryId);
  const grid = page.locator("#category-" + categoryId + " .menu-dishes");
  expect(
    (
      await grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns)
    ).split(" "),
  ).toHaveLength(2);
  await page.getByRole("button", { name: "Navigation", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Navigation", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Navigation", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Search the menu", exact: true })
    .click();
  await page.getByRole("searchbox").fill(itemName + " 7");
  await expect(page.locator(".menu-dish")).toHaveCount(1);
  await expect(page.locator(".availability")).toContainText(
    "Currently unavailable",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.screenshot({ path: "test-artifacts/catalog-mobile.png" });
});

// Exercise the actual bundled Leaflet library; only external tile delivery is mocked.
const mapTile =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eee9df"/><path d="M0 64H256M0 192H256M64 0V256M192 0V256" stroke="#fff" stroke-width="10"/></svg>';

test("locations list and map stay synchronized and render server-side addresses", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1692, height: 972 });
  const googleRequests: string[] = [];
  page.on("request", (request) => {
    if (/maps\.(googleapis|gstatic)\.com/.test(request.url()))
      googleRequests.push(request.url());
  });
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: mapTile }),
  );
  await page.goto("/" + locationsSlug);
  await expect(
    page.locator(".location-map-marker", { hasText: locationName }),
  ).toBeVisible();
  await page
    .locator(".locations-list button", { hasText: locationName })
    .click();
  await expect(
    page.locator(".location-map-marker", { hasText: locationName }),
  ).toHaveAttribute("aria-pressed", "true");
  const other = page
    .locator(".location-map-marker")
    .filter({ hasText: "Test kitchen west" })
    .last();
  await other.click();
  await expect(page.locator(".locations-list article.selected")).toContainText(
    "Test kitchen west",
  );
  const html = await (await page.request.get("/" + locationsSlug)).text();
  expect(html).toContain("Test address 1");
  await expect(page.locator(".map-message")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "OpenStreetMap", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Zoom in", exact: true }),
  ).toBeVisible();
  expect(googleRequests).toEqual([]);
  const accessibility = await new AxeBuilder({ page })
    .include(".locations-layout")
    .analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact || ""),
    ),
  ).toEqual([]);
  await page.screenshot({ path: "test-artifacts/locations-desktop.png" });
});

test("map loading failure preserves the location list and directions", async ({
  page,
}) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/" + locationsSlug);
  await expect(page.locator(".map-message")).toContainText(
    "The map is unavailable",
    { timeout: 20000 },
  );
  await expect(page.locator(".locations-list")).toContainText(locationName);
  const accessibility = await new AxeBuilder({ page })
    .include(".locations-layout")
    .analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact || ""),
    ),
  ).toEqual([]);
  await expect(
    page.getByRole("link", { name: "Get directions" }).first(),
  ).toHaveAttribute("href", /^https:/);
});

test("menu page has a sticky desktop category sidebar and mobile swipe navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/" + menuSlug);
  await expect(page.locator(".catalog-menu")).toHaveCount(1);
  await expect(
    page.getByText("Duplicate menu highlights", { exact: true }),
  ).toHaveCount(0);
  const sidebar = page.locator(".menu-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(page.locator(".sidebar-menu .catalog-toolbar")).toBeHidden();
  await expect(sidebar).toHaveCSS("position", "sticky");
  await expect(page.locator("h1")).toHaveCount(1);
  const categoryLink = sidebar.getByRole("link", {
    name: categoryName,
    exact: true,
  });
  await categoryLink.click();
  await expect(categoryLink).toHaveAttribute("aria-current", "location");
  const section = page.locator("#category-" + categoryId);
  await expect(section.locator(".menu-category-heading")).toContainText(
    "Freshly prepared favorites from our kitchen.",
  );
  await expect(section.locator(".menu-category-heading")).toHaveCSS(
    "border-bottom-width",
    "1px",
  );
  await expect(
    section.getByRole("heading", { name: categoryName, exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => Math.round((await section.boundingBox())!.y))
    .toBeGreaterThanOrEqual(60);
  await sidebar
    .getByRole("button", { name: "Search the menu", exact: true })
    .click();
  await page.getByRole("searchbox").fill(itemName + " 7");
  await expect(page.locator(".menu-dish")).toHaveCount(1);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await categoryLink.click();
  const violations = (
    await new AxeBuilder({ page }).include(".sidebar-menu").analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(violations).toEqual([]);
  await page.screenshot({ path: "test-artifacts/menu-sidebar-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".menu-sidebar-categories")).toBeHidden();
  await expect(page.locator(".sidebar-menu .catalog-toolbar")).toBeVisible();
  await expect(page.locator(".sidebar-menu .menu-categories")).toHaveCSS(
    "overflow-x",
    "auto",
  );
  await expect(page.locator("h1")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-artifacts/menu-sidebar-mobile.png" });
});

test("dish pages return complete SSR HTML, SEO, sitemap entries and safe publication responses", async ({
  request,
  browser,
}) => {
  const response = await request.get("/dishes/" + itemSlug);
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain(itemName);
  expect(html).toContain(
    "<strong>Prepared for the isolated browser verification.</strong>",
  );
  expect(html).toContain("dish-allergen-list");
  expect(html).toContain("Milk");
  expect(html).toContain("A second paragraph with kitchen details.");
  expect(html).toContain(
    'rel="canonical" href="' + baseURL + "/dishes/" + itemSlug + '"',
  );
  expect(html).toContain('name="description" content="Discover this dish');
  expect(html).toContain('"@type":"MenuItem"');
  expect(html).toContain('"@type":"BreadcrumbList"');
  expect(html).toContain('"priceCurrency":"EUR"');
  const translated = await request.get("/bg/dishes/" + itemSlug);
  expect(translated.status()).toBe(200);
  const translatedHtml = await translated.text();
  expect(translatedHtml).toContain("Подробно описание на ястието.");
  expect(translatedHtml).toContain("Специално ястие");
  expect(translatedHtml).toContain("Мляко");
  expect(translatedHtml).toMatch(/hrefLang="bg"/i);
  expect(translatedHtml).toContain(baseURL + "/bg/dishes/" + itemSlug);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/dishes/" + itemSlug);
  expect(
    (await request.get("/dishes/nonexistent-" + Date.now())).status(),
  ).toBe(404);
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const plain = await noJs.newPage();
  await plain.goto(baseURL + "/dishes/" + itemSlug);
  await expect(
    plain.getByRole("heading", { level: 1, name: itemName }),
  ).toBeVisible();
  await expect(plain.locator(".dish-related .menu-dish")).toHaveCount(4);
  await plain.setViewportSize({ width: 390, height: 844 });
  expect(
    await plain.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await noJs.close();
  const staff = await context.newPage();
  try {
    const current = (
      await (await staff.request.get("/api/cms/items/" + itemId)).json()
    ).rows[0];
    const payload = {
      ...current,
      categoryId,
      status: "DRAFT",
      variants: current.variants.map((v: any) => ({
        price: String(v.price),
        translations: v.translations,
      })),
      tagIds: [],
      imageIds: [],
    };
    await save(staff, "/api/cms/items/" + itemId, payload, "PUT");
    expect((await request.get("/dishes/" + itemSlug)).status()).toBe(404);
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain(
      "/dishes/" + itemSlug + "<",
    );
    const draft = (
      await (await staff.request.get("/api/cms/items/" + itemId)).json()
    ).rows[0];
    const nextSlug = itemSlug + "-updated";
    await save(
      staff,
      "/api/cms/items/" + itemId,
      {
        ...payload,
        version: draft.version,
        slug: nextSlug,
        status: "PUBLISHED",
      },
      "PUT",
    );
    const redirected = await request.get("/dishes/" + itemSlug, {
      maxRedirects: 0,
    });
    expect(redirected.status()).toBe(308);
    expect(redirected.headers().location).toContain("/dishes/" + nextSlug);
    expect((await request.get("/dishes/" + nextSlug)).status()).toBe(200);
    const category = (
      await (
        await staff.request.get("/api/cms/categories/" + categoryId)
      ).json()
    ).rows[0];
    await save(
      staff,
      "/api/cms/categories/" + categoryId,
      { ...category, enabled: false },
      "PUT",
    );
    expect((await request.get("/dishes/" + nextSlug)).status()).toBe(404);
  } finally {
    await staff.close();
  }
});
