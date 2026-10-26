import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { requireAccess } from "@/server/access";
import { endpoint, AppError } from "@/server/errors";
export const POST = endpoint(async (req: Request) => {
  const { user, siteId } = await requireAccess("content", req);
  const input = z
    .object({
      currentPassword: z.string().max(72),
      newPassword: z
        .string()
        .min(12)
        .refine(
          (p) => Buffer.byteLength(p) <= 72,
          "Use at most 72 UTF-8 bytes",
        ),
    })
    .parse(await req.json());
  if (
    input.newPassword === "Admin123!" ||
    !(await bcrypt.compare(input.currentPassword, user.password))
  )
    throw new AppError(
      422,
      "Current password is incorrect or the new password is unsafe.",
    );
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(input.newPassword, 12),
        sessionVersion: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: {
        siteId,
        actorId: user.id,
        action: "password.change",
        targetType: "User",
        targetId: user.id,
      },
    });
  });
  return Response.json({ message: "Password changed. Please sign in again." });
});
