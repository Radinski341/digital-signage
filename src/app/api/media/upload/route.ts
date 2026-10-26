import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import s3 from "@/lib/aws/s3Client";
import { db } from "@/server/db";
import { requireAccess } from "@/server/access";
import { endpoint, AppError } from "@/server/errors";
import { imageMimes, MAX_IMAGE_BYTES, mediaBase } from "@/server/media";
const schema = z.object({
  mime: z.enum(imageMimes),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES),
  filename: z.string().max(250),
});
export const POST = endpoint(async (req: Request) => {
  const { siteId, user } = await requireAccess("content", req);
  mediaBase();
  const body = schema.parse(await req.json());
  const ext = body.filename.split(".").pop()?.toLowerCase();
  const types: Record<string, string[]> = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "image/avif": ["avif"],
  };
  if (!ext || !types[body.mime].includes(ext))
    throw new AppError(422, "File extension does not match its image type.");
  const key = `staging/${siteId}/${randomUUID()}`;
  const intent = await db.uploadIntent.create({
    data: {
      siteId,
      actorId: user.id,
      key,
      mime: body.mime,
      size: body.size,
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  const post = await createPresignedPost(s3, {
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: key,
    Expires: 600,
    Conditions: [
      ["content-length-range", 1, body.size],
      ["eq", "$Content-Type", body.mime],
    ],
    Fields: { "Content-Type": body.mime },
  });
  return Response.json({ intentId: intent.id, ...post });
});
