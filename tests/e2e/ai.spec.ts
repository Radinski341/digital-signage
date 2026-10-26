import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email address").fill("owner@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { Origin: process.env.E2E_BASE_URL || "http://localhost:3100" },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("scoped chat asks editable questions, fills multilingual sections and SEO, supports undo and restores history", async ({
  page,
}) => {
  await login(page);
  const suffix = Date.now();
  const name = "AI story " + suffix;
  const slug = "ai-story-" + suffix;
  const localeRows = await (await page.request.get("/api/cms/locales")).json();
  if (!localeRows.rows.some((row: any) => row.code === "bg"))
    await post(page, "/api/cms/locales", {
      code: "bg",
      label: "Bulgarian",
      direction: "ltr",
      enabled: true,
      strings: [],
    });
  const created = await post(page, "/api/cms/pages", {
    internalName: name,
    type: "CUSTOM",
    translations: [{ locale: "en", slug, title: "Original story" }],
    sections: [],
  });
  const conversation = {
    id: "browser-ai-conversation",
    revision: 0,
    scope: "pages",
    recordId: created.id,
  };
  const messages: any[] = [];
  const locales = [
    { code: "en", label: "English" },
    { code: "bg", label: "Bulgarian" },
  ];
  const payload = () => ({
    conversation,
    messages,
    locales,
    defaultLocale: "en",
    nextCursor: null,
    configured: true,
  });
  let capturedAnswers: any[] = [];
  await page.route("**/api/ai/conversations**", async (route) => {
    const req = route.request();
    if (
      req.method() === "GET" ||
      new URL(req.url()).pathname === "/api/ai/conversations"
    )
      return route.fulfill({ json: payload() });
    if (req.method() !== "POST")
      return route.fulfill({ json: { attached: true } });
    const input = req.postDataJSON();
    expect(input.draft.internalName).toBe(name);
    const questions = [
      {
        id: "story",
        question: "What story should this page tell?",
        kind: "multiline",
        options: [],
        required: true,
      },
    ];
    const userBody = input.answers.length
      ? {
          message: "",
          answers: input.answers.map((a: any) => ({
            ...a,
            question: questions[0].question,
          })),
        }
      : { message: input.message };
    capturedAnswers = input.answers;
    const changes = input.answers.length
      ? [
          {
            field: "translations",
            value: [
              {
                locale: "en",
                slug,
                title: "From our kitchen",
                seoTitle: "Our kitchen story",
                seoDescription:
                  "A welcoming introduction to our restaurant kitchen.",
                canonicalUrl: "",
                ogTitle: "From our kitchen",
                ogDescription: "Get to know our restaurant.",
                noIndex: false,
              },
              {
                locale: "bg",
                slug: "nashata-kuhnya-" + suffix,
                title: "От нашата кухня",
                seoTitle: "Нашата кухня",
                seoDescription: "Добре дошли в нашата кухня.",
              },
            ],
          },
          {
            field: "sections",
            value: [
              {
                id: "browser-ai-hero",
                type: "HERO",
                config: {},
                hidden: false,
                translations: [
                  {
                    locale: "en",
                    content: { heading: "Welcome to our kitchen" },
                  },
                  { locale: "bg", content: { heading: "Добре дошли" } },
                ],
              },
              {
                id: "browser-ai-text",
                type: "RICH_TEXT",
                config: {},
                hidden: false,
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
                              { type: "text", text: "Prepared with care." },
                            ],
                          },
                        ],
                      },
                    },
                  },
                  {
                    locale: "bg",
                    content: {
                      body: {
                        type: "doc",
                        content: [
                          {
                            type: "paragraph",
                            content: [
                              { type: "text", text: "Приготвено с внимание." },
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
        ]
      : [];
    const message = {
      id: "assistant-" + conversation.revision,
      role: "assistant",
      body: {
        message: input.answers.length
          ? "I filled this page in English and Bulgarian. Review and save."
          : "Tell me about your restaurant before I write its story.",
        questions: input.answers.length ? [] : questions,
        changes,
      },
    };
    messages.push({ id: input.key, role: "user", body: userBody }, message);
    conversation.revision++;
    await route.fulfill({
      json: { message, userBody, revision: conversation.revision },
    });
  });
  async function edit() {
    await page.goto("/admin/pages");
    await page.getByRole("searchbox", { name: "Search content" }).fill(name);
    await page.getByRole("button", { name, exact: true }).click();
    await page
      .getByRole("button", { name: "AI assistant", exact: true })
      .click();
  }
  await edit();
  await page.getByRole("checkbox", { name: "Bulgarian", exact: true }).check();
  await page
    .getByRole("textbox", { name: "Message to assistant" })
    .fill(
      "Create a professional story page in English and Bulgarian, with SEO.",
    );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Answer: What story should this page tell?" })
    .fill("Our kitchen prepares each dish with care. Keep the tone welcoming.");
  await page.getByRole("button", { name: "Send answers", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("From our kitchen");
  await expect(
    page.getByRole("textbox", { name: "SEO title", exact: true }),
  ).toHaveValue("Our kitchen story");
  await expect(
    page.getByRole("table", { name: "Your answers", exact: true }),
  ).toContainText("Our kitchen prepares each dish with care.");
  expect(capturedAnswers).toEqual([
    {
      questionId: "story",
      answer:
        "Our kitchen prepares each dish with care. Keep the tone welcoming.",
    },
  ]);
  const untouched = await (
    await page.request.get("/api/cms/pages/" + created.id)
  ).json();
  expect(untouched.rows[0].translations[0].title).toBe("Original story");
  await page
    .getByRole("button", { name: "Undo these changes", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Original story");
  await page
    .getByRole("textbox", { name: "Message to assistant" })
    .fill("Please keep the welcoming version.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Original story");
  // Reopening restores the private transcript, but never reapplies its previous patches.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await edit();
  await expect(
    page.getByRole("table", { name: "Your answers", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Original story");
  const violations = (
    await new AxeBuilder({ page }).include(".admin-dialog").analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(violations).toEqual([]);
});

test("mobile assistant switches between editor and chat, while provider errors leave the form unchanged", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const category = await post(page, "/api/cms/categories", {
    slug: "ai-mobile-" + Date.now(),
    enabled: true,
    translations: [{ locale: "en", name: "AI mobile category " + Date.now() }],
  });
  const name = category.translations?.[0]?.name;
  // saveResource returns the base record; retrieve the translated name when needed.
  const loaded = await (
    await page.request.get("/api/cms/categories/" + category.id)
  ).json();
  const label = name || loaded.rows[0].translations[0].name;
  await page.route("**/api/ai/conversations**", async (route) => {
    if (
      route.request().method() === "POST" &&
      new URL(route.request().url()).pathname !== "/api/ai/conversations"
    )
      return route.fulfill({
        status: 502,
        json: {
          error:
            "AI assistance is temporarily unavailable. Your form is unchanged.",
        },
      });
    return route.fulfill({
      json: {
        conversation: { id: "mobile-chat", revision: 0 },
        messages: [],
        locales: [{ code: "en", label: "English" }],
        defaultLocale: "en",
        configured: true,
      },
    });
  });
  await page.goto("/admin/categories");
  await page.getByRole("searchbox", { name: "Search content" }).fill(label);
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: "AI assistant", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message to assistant" })
    .fill("Improve the category description.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue(label);
  await page.getByRole("button", { name: "AI chat", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Message to assistant" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("AI updates an already mounted rich text editor and Undo restores its content", async ({
  page,
}) => {
  await login(page);
  const suffix = Date.now();
  const name = "AI rich text " + suffix;
  const created = await post(page, "/api/cms/pages", {
    internalName: name,
    type: "CUSTOM",
    translations: [{ locale: "en", slug: "ai-rich-" + suffix, title: name }],
    sections: [
      {
        type: "RICH_TEXT",
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
                    content: [{ type: "text", text: "Original paragraph." }],
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  });
  await page.route("**/api/ai/conversations**", async (route) => {
    const request = route.request();
    if (
      request.method() !== "POST" ||
      new URL(request.url()).pathname === "/api/ai/conversations"
    )
      return route.fulfill({
        json: {
          conversation: {
            id: "rich-conversation",
            revision: 0,
            recordId: created.id,
          },
          messages: [],
          locales: [{ code: "en", label: "English" }],
          defaultLocale: "en",
          configured: true,
        },
      });
    const input = request.postDataJSON();
    const sections = input.draft.sections;
    sections[0].translations[0].content.body.content[0].content[0].text =
      "A welcoming paragraph from the assistant.";
    return route.fulfill({
      json: {
        revision: 1,
        userBody: { message: input.message },
        message: {
          id: "rich-message",
          role: "assistant",
          body: {
            message: "I updated this section.",
            questions: [],
            changes: [{ field: "sections", value: sections }],
          },
        },
      },
    });
  });
  await page.goto("/admin/pages");
  await page.getByRole("searchbox", { name: "Search content" }).fill(name);
  await page.getByRole("button", { name, exact: true }).click();
  await page
    .getByRole("button", { name: "Rich text Add content", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Formatted content" }),
  ).toContainText("Original paragraph.");
  await page.getByRole("button", { name: "AI assistant", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message to assistant" })
    .fill("Rewrite this paragraph in a welcoming tone.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Formatted content" }),
  ).toContainText("A welcoming paragraph from the assistant.");
  await page
    .getByRole("button", { name: "Undo these changes", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Formatted content" }),
  ).toContainText("Original paragraph.");
});

test("invalid AI draft text reaches the form and can be corrected before saving", async ({
  page,
}) => {
  await login(page);
  const suffix = Date.now();
  const name = "AI editable draft " + suffix;
  const category = await post(page, "/api/cms/categories", {
    slug: "ai-draft-" + suffix,
    enabled: true,
    translations: [{ locale: "en", name }],
  });
  await page.route("**/api/ai/conversations**", async (route) => {
    const request = route.request();
    if (
      request.method() !== "POST" ||
      new URL(request.url()).pathname === "/api/ai/conversations"
    )
      return route.fulfill({
        json: {
          conversation: { id: "draft-conversation", revision: 0 },
          messages: [],
          locales: [{ code: "en", label: "English" }],
          defaultLocale: "en",
          configured: true,
        },
      });
    const input = request.postDataJSON();
    return route.fulfill({
      json: {
        revision: 1,
        userBody: { message: input.message },
        message: {
          id: "draft-message",
          role: "assistant",
          body: {
            message: "Here is your editable draft.",
            changes: [
              { field: "slug", value: "A slug to correct" },
              {
                field: "translations",
                value: [
                  {
                    locale: "en",
                    name,
                    description: "Freshly prepared dishes to enjoy together.",
                  },
                ],
              },
            ],
            warnings: [
              {
                field: "slug",
                message: "Use lowercase letters, numbers and hyphens.",
              },
            ],
            unapplied: [
              {
                field: "imageId",
                text: "Image suggestion omitted",
                reason: "Images remain under staff control.",
              },
            ],
          },
        },
      },
    });
  });
  await page.goto("/admin/categories");
  await page.getByRole("searchbox", { name: "Search content" }).fill(name);
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "AI assistant", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message to assistant" })
    .fill("Write a category introduction.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByLabel("URL identifier")).toHaveValue(
    "A slug to correct",
  );
  await expect(
    page.getByText("Draft needs correction before saving", { exact: true }),
  ).toBeVisible();
  await page.getByText("imageId: generated text available to copy").click();
  await expect(
    page.getByRole("textbox", { name: "Generated draft for imageId" }),
  ).toHaveValue("Image suggestion omitted");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByLabel("URL identifier").fill("corrected-ai-draft-" + suffix);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await (
    await page.request.get("/api/cms/categories/" + category.id)
  ).json();
  expect(saved.rows[0].slug).toBe("corrected-ai-draft-" + suffix);
  expect(saved.rows[0].translations[0].description).toBe(
    "Freshly prepared dishes to enjoy together.",
  );
});
