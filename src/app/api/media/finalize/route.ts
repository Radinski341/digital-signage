import { z } from "zod";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import s3 from "@/lib/aws/s3Client";
import { db } from "@/server/db";
import { requireAccess } from "@/server/access";
import { endpoint, AppError } from "@/server/errors";
import { loadStagedImage, storeImage } from "@/server/media";
export const POST = endpoint(async (req: Request) => {
  const { siteId, user } = await requireAccess("content", req);
  const input = z
    .object({ intentId: z.string(), alt: z.string().max(500).default("") })
    .parse(await req.json());
  const intent = await db.uploadIntent.findFirst({
    where: {
      id: input.intentId,
      siteId,
      actorId: user.id,
      state: "PENDING",
      expiresAt: { gt: new Date() },
    },
  });
  if (!intent)
    throw new AppError(
      409,
      "Upload expired or already processed. Please upload again.",
    );
  const claimed = await db.uploadIntent.updateMany({
    where: { id: intent.id, state: "PENDING" },
    data: { state: "PROCESSING" },
  });
  if (!claimed.count)
    throw new AppError(409, "Upload is already being processed.");
  try {
    const buffer = await loadStagedImage(intent.key);
    if (buffer.length !== intent.size)
      throw new AppError(422, "Upload size does not match.");
    const asset = await storeImage(siteId, buffer, intent.mime, input.alt);
    await db.uploadIntent.update({
      where: { id: intent.id },
      data: { state: "COMPLETE" },
    });
    return Response.json(asset, { status: 201 });
  } catch (e) {
    await db.uploadIntent.update({
      where: { id: intent.id },
      data: { state: "FAILED" },
    });
    throw e;
  } finally {
    await s3
      .send(
        new DeleteObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: intent.key,
        }),
      )
      .catch(() => {});
  }
});
