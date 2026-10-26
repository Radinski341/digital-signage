import { FieldType, PrismaClient } from "@prisma/client";
import { applyReferenceTheme } from "../src/server/reference-theme";
const prisma = new PrismaClient();

async function upsertTemplate({ key, name, description, fields }) {
  const siteId = (
    await prisma.site.findUniqueOrThrow({ where: { key: "uzbek-bg" } })
  ).id;
  const tpl = await prisma.template.upsert({
    where: { siteId_key: { siteId, key } },
    update: {},
    create: { siteId, key, name, description },
  });
  if (await prisma.templateField.count({ where: { templateId: tpl.id } }))
    return tpl;
  await prisma.templateField.createMany({
    data: fields.map((f, i) => ({
      templateId: tpl.id,
      key: f.key,
      label: f.label ?? f.key,
      type: f.type,
      required: !!f.required,
      isArray: !!f.isArray,
      order: f.order ?? i,
      config: f.config ?? {},
    })),
  });
  return prisma.template.findUnique({
    where: { id: tpl.id },
    include: { fields: { orderBy: { order: "asc" } } },
  });
}

async function main() {
  // 1) Hero Dish
  await upsertTemplate({
    key: "hero-dish",
    name: "Hero Dish",
    description: "Full-bleed image with overlay text and price.",
    fields: [
      { key: "image", label: "Image", type: FieldType.IMAGE, required: true },
      { key: "title", label: "Title", type: FieldType.TEXT, required: true },
      { key: "subtitle", label: "Subtitle", type: FieldType.TEXT },
      { key: "description", label: "Description", type: FieldType.RICHTEXT },
      {
        key: "price",
        label: "Price (BGN)",
        type: FieldType.NUMBER,
        required: true,
      },
      { key: "themeColor", label: "Theme Color", type: FieldType.COLOR },
    ],
  });

  // 2) Title + List
  await upsertTemplate({
    key: "title-list",
    name: "Title + Bullet List",
    description: "Headline with a bullet list; optional side image.",
    fields: [
      { key: "title", label: "Title", type: FieldType.TEXT, required: true },
      {
        key: "items",
        label: "Items",
        type: FieldType.TEXT,
        isArray: true,
        required: true,
      },
      { key: "image", label: "Side Image", type: FieldType.IMAGE },
      {
        key: "accent",
        label: "Accent",
        type: FieldType.SELECT,
        config: { options: ["red", "amber", "emerald", "sky"] },
      },
    ],
  });

  // 3) Two Image Promo
  await upsertTemplate({
    key: "two-image-promo",
    name: "Two Image Promo",
    description: "Split screen with two images and central text.",
    fields: [
      {
        key: "leftImage",
        label: "Left Image",
        type: FieldType.IMAGE,
        required: true,
      },
      {
        key: "rightImage",
        label: "Right Image",
        type: FieldType.IMAGE,
        required: true,
      },
      {
        key: "headline",
        label: "Headline",
        type: FieldType.TEXT,
        required: true,
      },
      { key: "subline", label: "Subline", type: FieldType.TEXT },
      { key: "badge", label: "Badge", type: FieldType.TEXT },
    ],
  });

  // 4) Price Board
  await upsertTemplate({
    key: "price-board",
    name: "Price Board",
    description: "Menu board with rows of {name, price}.",
    fields: [
      { key: "title", label: "Title", type: FieldType.TEXT, required: true },
      // store rows as array of objects in data; form builder will handle structure later
      {
        key: "rows",
        label: "Rows",
        type: FieldType.RICHTEXT,
        isArray: true,
        required: true,
        config: { itemSchema: { name: "TEXT", price: "NUMBER" } },
      },
      { key: "note", label: "Footnote", type: FieldType.TEXT },
    ],
  });

  await upsertTemplate({
    key: "menu",
    name: "Menu",
    description: "Three-column menu display with sections and pricing.",
    fields: [
      {
        key: "description",
        label: "Restaurant Name",
        type: FieldType.TEXT,
        required: true,
      },
      {
        key: "title",
        label: "Menu Title",
        type: FieldType.TEXT,
        required: true,
      },
      {
        key: "firstListTitle",
        label: "First Section Title",
        type: FieldType.TEXT,
        required: true,
      },
      {
        key: "firstList",
        label: "First Section Items",
        type: FieldType.TEXT,
        required: true,
        isArray: true,
        config: {
          itemSchema: {
            name: { type: "TEXT", label: "Item Name", required: true },
            price: { type: "NUMBER", label: "Price", required: true },
          },
        },
      },
      {
        key: "secondListTitle",
        label: "Second Section Title",
        type: FieldType.TEXT,
        required: true,
      },
      {
        key: "secondList",
        label: "Second Section Items",
        type: FieldType.TEXT,
        required: true,
        isArray: true,
        config: {
          itemSchema: {
            name: { type: "TEXT", label: "Item Name", required: true },
            price: { type: "NUMBER", label: "Price", required: true },
          },
        },
      },
      {
        key: "thirdListTitle",
        label: "Third Section Title",
        type: FieldType.TEXT,
        required: true,
      },
      {
        key: "thirdList",
        label: "Third Section Items",
        type: FieldType.TEXT,
        required: true,
        isArray: true,
        config: {
          itemSchema: {
            name: { type: "TEXT", label: "Item Name", required: true },
            price: { type: "NUMBER", label: "Price", required: true },
          },
        },
      },
    ],
  });

  const site = await prisma.site.findUniqueOrThrow({
    where: { key: "uzbek-bg" },
  });
  for (const [type, internalName, slug] of [
    ["HOME", "Home", ""],
    ["MENU", "Menu", "menu"],
    ["ABOUT", "About us", "about"],
    ["CONTACT", "Contact", "contact"],
  ]) {
    if (await prisma.page.findFirst({ where: { siteId: site.id, type } }))
      continue;
    await prisma.page.create({
      data: {
        siteId: site.id,
        type,
        internalName,
        translations: {
          create: { siteId: site.id, locale: "en", slug, title: internalName },
        },
        sections: {
          create: [
            {
              type: "HERO",
              position: 0,
              config: {
                imageId: null,
                actionIds: [],
                align: "left",
                overlay: "dark",
                variant: "full",
              },
              translations: {
                create: {
                  locale: "en",
                  content: {
                    heading: internalName,
                    subtitle: "",
                    caption: "",
                    alt: "",
                  },
                },
              },
            },
            ...(type === "CONTACT"
              ? [
                  {
                    type: "CONTACT",
                    position: 1,
                    config: { locationId: null },
                    translations: {
                      create: {
                        locale: "en",
                        content: {
                          heading: "Visit us",
                          subtitle: "",
                          caption: "",
                          alt: "",
                        },
                      },
                    },
                  },
                  {
                    type: "OPENING_HOURS",
                    position: 2,
                    config: { locationId: null },
                    translations: {
                      create: {
                        locale: "en",
                        content: {
                          heading: "Opening hours",
                          subtitle: "",
                          caption: "",
                          alt: "",
                        },
                      },
                    },
                  },
                ]
              : []),
          ],
        },
      },
    });
  }
  for (const key of ["header", "footer", "footer-info"])
    await prisma.navigation.upsert({
      where: { siteId_key: { siteId: site.id, key } },
      update: {},
      create: { siteId: site.id, key },
    });
  await applyReferenceTheme(prisma, site.id, { branding: false });
  console.log(
    "Templates and draft system pages ready. Configure an Owner with npm run owner:setup.",
  );
}
main().finally(() => prisma.$disconnect());
