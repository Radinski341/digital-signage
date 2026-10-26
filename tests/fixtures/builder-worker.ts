/** Synthetic provider for browser tests. Never connects to a non-test database or OpenAI. */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith("_test"))
  throw new Error("A dedicated *_test database is required.");
process.env.DATABASE_URL = testUrl;
process.env.DIRECT_DATABASE_URL = testUrl;
process.env.OPENAI_API_KEY = "mock-provider-never-sent";
async function main() {
  const { builderTick } = await import("../../src/server/ai/worker");
  const { db } = await import("../../src/server/db");
  let stop = false;
  process.on("SIGTERM", () => {
    stop = true;
  });
  process.on("SIGINT", () => {
    stop = true;
  });
  const generate = async (body: any) => {
    const context = JSON.parse(body.input[0].content);
    const stamp = context.brief.match(/TEST-(\d+)/)?.[1] || "fixture";
    if (context.brief.includes("RESUME-CHECK")) {
      const continued = body.input.some(
        (v: any) => v.type === "function_call_output",
      );
      return {
        status: "completed",
        usage: { input_tokens: 20, output_tokens: 10 },
        output: continued
          ? [
              {
                type: "message",
                role: "assistant",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      message: "Resumed the saved proposal.",
                      questions: [],
                    }),
                  },
                ],
              },
            ]
          : [
              {
                type: "function_call",
                name: "stage_categories",
                call_id: "resumed-category",
                arguments: JSON.stringify({
                  records: [
                    {
                      key: "continued",
                      payload: {
                        slug: "continued-" + stamp,
                        translations: [
                          { locale: "en", name: "Continued category " + stamp },
                        ],
                      },
                    },
                  ],
                }),
              },
            ],
      };
    }
    const calls = body.input.filter((v: any) => v.type === "function_call");
    const pageReads = calls.filter(
      (c: any) =>
        c.name === "read_records" &&
        JSON.parse(c.arguments).resource === "pages",
    );
    const step = calls.length - Math.max(0, pageReads.length - 1);
    const result = (name: string) => {
      const c = calls.filter((v: any) => v.name === name).at(-1);
      const r = body.input.find(
        (v: any) =>
          v.type === "function_call_output" && v.call_id === c?.call_id,
      );
      return r ? JSON.parse(r.output) : null;
    };
    const staged = (name: string, index = 0) =>
      result("stage_" + name)?.results[index]?.targetId;
    const translations = (en: any, bg: any) => [
      { locale: "en", ...en },
      { locale: "bg", ...bg },
    ];
    const content = (heading: string, locale = "en") => ({
      locale,
      content: { heading, subtitle: "", caption: "", alt: "" },
    });
    const section = (
      type: string,
      heading: string,
      bg: string,
      config: any = {},
    ) => ({
      type,
      config,
      translations: [content(heading), content(bg, "bg")],
    });
    const page = (
      key: string,
      type: string,
      enSlug: string,
      bgSlug: string,
      title: string,
      bgTitle: string,
      sections: any[],
      recordId: string | null = null,
    ) => ({
      key,
      recordId,
      payload: {
        type,
        internalName:
          type === "HOME" ? "Home" : type === "MENU" ? "Menu" : title,
        translations: translations(
          {
            slug: enSlug,
            title,
            seoTitle: title + " | Test restaurant",
            seoDescription:
              "Explore our verified restaurant menu and discover freshly prepared dishes.",
          },
          {
            slug: bgSlug,
            title: bgTitle,
            seoTitle: bgTitle + " | Тест ресторант",
            seoDescription:
              "Разгледайте менюто на ресторанта и открийте нашите прясно приготвени ястия.",
          },
        ),
        sections,
      },
    });
    let name = "",
      args: any = {};
    switch (step) {
      case 0:
        name = "read_records";
        args = { resource: "locales" };
        break;
      case 1:
        name = "stage_locales";
        args = {
          records: [
            {
              key: "bg",
              recordId:
                result("read_records").rows.find((r: any) => r.code === "bg")
                  ?.id || null,
              payload: {
                code: "bg",
                label: "Български",
                enabled: true,
                direction: "ltr",
                isDefault: false,
                strings: [
                  { key: "menu", value: "Меню" },
                  { key: "viewDetails", value: "Вижте подробности" },
                ],
              },
            },
          ],
        };
        break;
      case 2:
        name = "stage_categories";
        args = {
          records: [
            {
              key: "salads",
              payload: {
                slug: "builder-salads-" + stamp,
                enabled: true,
                translations: translations(
                  { name: "AI salads " + stamp },
                  { name: "AI салати " + stamp },
                ),
              },
            },
          ],
        };
        break;
      case 3:
        name = "stage_tags";
        args = {
          records: [
            {
              key: "vegan",
              payload: {
                key: "builder-vegan-" + stamp,
                kind: "DIETARY",
                translations: translations(
                  { name: "Vegan" },
                  { name: "Веган" },
                ),
              },
            },
          ],
        };
        break;
      case 4:
        name = "stage_items";
        args = {
          records: [
            {
              key: "garden",
              payload: {
                categoryId: staged("categories"),
                slug: "builder-garden-" + stamp,
                price: "12.50",
                currency: "EUR",
                status: "DRAFT",
                available: true,
                featured: true,
                imageId: "fixture-dish-0",
                translations: translations(
                  {
                    name: "AI garden salad " + stamp,
                    description: "Tomato and cucumber salad.",
                    detailsDocument: {
                      type: "doc",
                      content: [
                        {
                          type: "heading",
                          attrs: { level: 3 },
                          content: [
                            { type: "text", text: "Fresh from the garden" },
                          ],
                        },
                        {
                          type: "paragraph",
                          content: [
                            {
                              type: "text",
                              text: "Tomato and cucumber",
                              marks: [{ type: "bold" }],
                            },
                          ],
                        },
                      ],
                    },
                  },
                  {
                    name: "AI градинска салата " + stamp,
                    description: "Салата от домати и краставици.",
                    detailsDocument: {
                      type: "doc",
                      content: [
                        {
                          type: "paragraph",
                          content: [
                            {
                              type: "text",
                              text: "Домати и краставици",
                              marks: [{ type: "bold" }],
                            },
                          ],
                        },
                      ],
                    },
                  },
                ),
                variants: [],
                tagIds: [staged("tags")],
                imageIds: [],
              },
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
            },
          ],
        };
        break;
      case 5:
        name = "read_records";
        args = { resource: "pages" };
        break;
      case 6: {
        const rows = pageReads.flatMap(
          (c: any) =>
            JSON.parse(
              body.input.find(
                (v: any) =>
                  v.type === "function_call_output" && v.call_id === c.call_id,
              ).output,
            ).rows,
        );
        if (
          (!rows.some((r: any) => r.type === "HOME") ||
            !rows.some((r: any) => r.type === "MENU")) &&
          result("read_records").nextCursor
        ) {
          name = "read_records";
          args = {
            resource: "pages",
            after: result("read_records").nextCursor,
          };
          break;
        }
        name = "stage_pages";
        args = {
          records: [
            page(
              "home",
              "HOME",
              "",
              "",
              "Restaurant menu",
              "Меню на ресторанта",
              [
                section("MENU_HIGHLIGHTS", "Featured dishes", "Избрани ястия", {
                  itemIds: [staged("items")],
                  limit: 4,
                }),
              ],
              rows.find((r: any) => r.type === "HOME")?.id || null,
            ),
            page(
              "menu",
              "MENU",
              "menu",
              "menu-builder-bg",
              "Our menu",
              "Нашето меню",
              [],
              rows.find((r: any) => r.type === "MENU")?.id || null,
            ),
            page(
              "story",
              "CUSTOM",
              "builder-story-" + stamp,
              "builder-story-bg-" + stamp,
              "AI story " + stamp,
              "AI история " + stamp,
              [
                section("HERO", "From our kitchen", "От нашата кухня", {
                  imageId: "fixture-dish-0",
                  overlay: "dark",
                  variant: "split",
                  align: "left",
                }),
                section(
                  "RICH_TEXT",
                  "Fresh restaurant cooking",
                  "Прясно приготвена храна",
                ),
              ],
            ),
          ],
        };
        break;
      }
      case 7:
        name = "stage_actions";
        args = {
          records: [
            {
              key: "story-cta",
              payload: {
                name: "Read our story",
                type: "PAGE",
                pageId: staged("pages", 2),
                style: "primary",
                enabled: true,
                newTab: false,
                translations: translations(
                  { label: "Read our story" },
                  { label: "Нашата история" },
                ),
              },
            },
          ],
        };
        break;
      case 8:
        name = "read_records";
        args = { resource: "navigation" };
        break;
      case 9:
        name = "stage_navigation";
        args = {
          records: [
            {
              key: "footer-information",
              recordId:
                result("read_records").rows.find(
                  (r: any) => r.name === "footer-info",
                )?.id || null,
              payload: {
                key: "footer-info",
                items: [
                  {
                    pageId: staged("pages", 2),
                    enabled: true,
                    translations: translations(
                      { label: "AI story " + stamp },
                      { label: "AI история " + stamp },
                    ),
                  },
                ],
              },
            },
          ],
        };
        break;
      case 10:
        name = "stage_pages";
        args = {
          records: [
            {
              key: "home",
              recordId: staged("pages", 0),
              payload: {
                sections: [
                  section(
                    "MENU_HIGHLIGHTS",
                    "Featured dishes",
                    "Избрани ястия",
                    { itemIds: [staged("items")], limit: 4 },
                  ),
                  section("CTA", "Meet our kitchen", "Нашата кухня", {
                    actionIds: [staged("actions")],
                  }),
                ],
              },
            },
          ],
        };
        break;
      case 11:
        name = "validate_proposal";
        break;
      default:
        return {
          status: "completed",
          usage: { input_tokens: 100, output_tokens: 50 },
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    message:
                      "Your bilingual pages, menu, dietary label, photographs, navigation and SEO are ready for review. Nothing is live until you accept.",
                    questions: [],
                  }),
                },
              ],
            },
          ],
        };
    }
    return {
      status: "completed",
      usage: { input_tokens: 100, output_tokens: 50 },
      output: [
        {
          type: "function_call",
          name,
          call_id: "fixture-step-" + calls.length,
          arguments: JSON.stringify(args),
        },
      ],
    };
  };
  try {
    while (!stop) {
      if (!(await builderTick(generate)))
        await new Promise((r) => setTimeout(r, 150));
    }
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e.name);
  process.exitCode = 1;
});
