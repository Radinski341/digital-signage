import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error(
    "Fixtures require an explicitly named isolated *_test database.",
  );
if (!process.env.E2E_PASSWORD || process.env.E2E_PASSWORD.length < 12)
  throw new Error("Set E2E_PASSWORD to a temporary test password.");
const db = new PrismaClient({ datasources: { db: { url } } });
async function main() {
  try {
    await db.loginWindow.deleteMany();
    const site = await db.site.findUniqueOrThrow({
      where: { key: "uzbek-bg" },
    });
    await db.site.update({
      where: { id: site.id },
      data: {
        currency: "EUR",
        timeZone: "Europe/Sofia",
        domain: "http://localhost:3100",
      },
    });
    for (const [email, role] of [
      ["owner@example.test", "OWNER"],
      ["designer@example.test", "OWNER"],
      ["editor@example.test", "EDITOR"],
    ] as const) {
      const user = await db.user.upsert({
        where: { email },
        create: {
          email,
          password: await bcrypt.hash(process.env.E2E_PASSWORD!, 12),
        },
        update: {
          password: await bcrypt.hash(process.env.E2E_PASSWORD!, 12),
          disabled: false,
        },
      });
      await db.membership.upsert({
        where: { siteId_userId: { siteId: site.id, userId: user.id } },
        create: { siteId: site.id, userId: user.id, role },
        update: { role },
      });
    }
    // An optimized, deterministic local image verifies the editor workflow without external storage credentials.
    await mkdir("public/test-fixtures", { recursive: true });
    await sharp("public/images/menu-background.png")
      .resize(640, 360)
      .webp({ quality: 80 })
      .toFile("public/test-fixtures/restaurant.webp");
    const mediaId = "fixture-media";
    await db.mediaAsset.upsert({
      where: { id: mediaId },
      create: {
        id: mediaId,
        siteId: site.id,
        key: "fixture-media-key",
        url: "http://localhost:3100/test-fixtures/restaurant.webp",
        mime: "image/webp",
        size: 1000,
        width: 640,
        height: 360,
        alt: "Test restaurant photograph",
      },
      update: {
        url: "http://localhost:3100/test-fixtures/restaurant.webp",
        mime: "image/webp",
        width: 640,
        height: 360,
      },
    });
    const source = await sharp("public/images/menu-background.png").metadata();
    const segment = Math.floor(source.width! / 5);
    for (let index = 0; index < 5; index++) {
      await sharp("public/images/menu-background.png")
        .extract({
          left: index * segment,
          top: 0,
          width: segment,
          height: segment,
        })
        .resize(800, 800)
        .webp({ quality: 85 })
        .toFile(`public/test-fixtures/dish-${index}.webp`);
      await db.mediaAsset.upsert({
        where: { id: `fixture-dish-${index}` },
        update: {},
        create: {
          id: `fixture-dish-${index}`,
          siteId: site.id,
          key: `fixture-dish-${index}`,
          url: `http://localhost:3100/test-fixtures/dish-${index}.webp`,
          mime: "image/webp",
          size: 1000,
          width: 800,
          height: 800,
          alt: "Repository food photograph " + (index + 1),
        },
      });
    }
    console.log("Isolated browser fixtures ready.");
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Setup failed");
  process.exitCode = 1;
});
