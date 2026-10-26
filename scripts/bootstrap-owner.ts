import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline/promises";
const db = new PrismaClient();
async function hiddenPassword() {
  if (!process.stdin.isTTY)
    throw new Error(
      "Use BOOTSTRAP_PASSWORD in a private environment for non-interactive setup.",
    );
  process.stdout.write("New password (input hidden): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let password = "";
  try {
    return await new Promise<string>((resolve, reject) => {
      const read = (chunk: Buffer) => {
        for (const c of chunk.toString()) {
          if (c === "\r" || c === "\n") {
            process.stdin.off("data", read);
            resolve(password);
            return;
          }
          if (c === "\u0003") {
            process.stdin.off("data", read);
            reject(new Error("Setup cancelled."));
            return;
          }
          if (c === "\u007f" || c === "\b") password = password.slice(0, -1);
          else if (c >= " ") password += c;
        }
      };
      process.stdin.on("data", read);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write("\n");
  }
}
async function main() {
  try {
    const terminal = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const email = (
      process.env.BOOTSTRAP_EMAIL ?? (await terminal.question("Owner email: "))
    )
      .trim()
      .toLowerCase();
    terminal.close();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("Valid email required.");
    const password = process.env.BOOTSTRAP_PASSWORD ?? (await hiddenPassword());
    if (
      password.length < 12 ||
      Buffer.byteLength(password) > 72 ||
      password === "Admin123!"
    )
      throw new Error("Use 12 or more characters, at most 72 UTF-8 bytes.");
    const sites = await db.site.findMany({ take: 2 });
    const site = process.env.SITE_ID
      ? await db.site.findUnique({ where: { id: process.env.SITE_ID } })
      : sites.length === 1
        ? sites[0]
        : null;
    if (!site)
      throw new Error(
        "Run migrations and set SITE_ID when more than one site exists.",
      );
    const hash = await bcrypt.hash(password, 12);
    await db.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email },
        create: { email, password: hash },
        update: {
          password: hash,
          disabled: false,
          sessionVersion: { increment: 1 },
        },
      });
      await tx.membership.upsert({
        where: { siteId_userId: { siteId: site.id, userId: user.id } },
        create: { siteId: site.id, userId: user.id, role: "OWNER" },
        update: { role: "OWNER", disabled: false },
      });
      await tx.auditLog.create({
        data: {
          siteId: site.id,
          actorId: user.id,
          action: "owner.bootstrap",
          targetType: "User",
          targetId: user.id,
        },
      });
    });
    console.log("Owner configured. No password was stored in logs.");
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Setup failed");
  process.exitCode = 1;
});
