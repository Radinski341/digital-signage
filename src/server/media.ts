import { randomUUID } from "node:crypto";
import sharp, { Metadata } from "sharp";
import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import s3 from "@/lib/aws/s3Client";
import { db } from "./db";
import { AppError } from "./errors";
import { httpUrl } from "@/modules/security";
export const imageMimes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export function mediaBase() {
  const base = process.env.MEDIA_PUBLIC_BASE_URL;
  if (!base || !httpUrl.safeParse(base).success)
    throw new AppError(
      503,
      "Public media delivery is not configured. Contact your administrator.",
    );
  return base.replace(/\/$/, "");
}
export async function storeImage(
  siteId: string,
  buffer: Buffer,
  declaredMime: string,
  alt = "",
) {
  if (
    !imageMimes.includes(declaredMime as (typeof imageMimes)[number]) ||
    !buffer.length ||
    buffer.length > MAX_IMAGE_BYTES
  )
    throw new AppError(
      422,
      "Choose a JPEG, PNG, WebP or AVIF image up to 10 MB.",
    );
  const base = mediaBase();
  const image = sharp(buffer, {
    limitInputPixels: 40_000_000,
    animated: false,
    failOn: "warning",
  });
  let meta: Metadata;
  try {
    meta = await image.metadata();
  } catch {
    throw new AppError(422, "This file is not a valid supported image.");
  }
  const expected = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "heif",
  }[declaredMime];
  if (
    meta.format !== expected ||
    !meta.width ||
    !meta.height ||
    meta.width * meta.height > 40_000_000 ||
    (meta.pages ?? 1) > 1
  )
    throw new AppError(
      422,
      "Image content does not match its type or dimensions.",
    );
  const id = randomUUID();
  const key = `sites/${siteId}/media/${id}.webp`;
  const thumbnailKey = `sites/${siteId}/media/${id}-thumb.webp`;
  const output = await image
    .rotate()
    .resize({
      width: 2560,
      height: 2560,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await sharp(output.data)
    .resize({
      width: 480,
      height: 480,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 75 })
    .toBuffer();
  await Promise.all(
    [
      [key, output.data],
      [thumbnailKey, thumb],
    ].map(([Key, Body]) =>
      s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: Key as string,
          Body: Body as Buffer,
          ContentType: "image/webp",
          CacheControl: "public,max-age=31536000,immutable",
        }),
      ),
    ),
  );
  try {
    return await db.mediaAsset.create({
      data: {
        id,
        siteId,
        key,
        url: `${base}/${key}`,
        thumbnailUrl: `${base}/${thumbnailKey}`,
        mime: "image/webp",
        size: output.data.length,
        width: output.info.width,
        height: output.info.height,
        alt,
      },
    });
  } catch (error) {
    await Promise.allSettled(
      [key, thumbnailKey].map((Key) =>
        s3.send(
          new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key }),
        ),
      ),
    );
    throw error;
  }
}
export async function loadStagedImage(key: string) {
  const object = await s3.send(
    new GetObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: key }),
  );
  if (
    !object.Body ||
    !object.ContentLength ||
    object.ContentLength > MAX_IMAGE_BYTES
  )
    throw new AppError(422, "Invalid image size.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > MAX_IMAGE_BYTES) {
      (object.Body as { destroy?: () => void }).destroy?.();
      throw new AppError(422, "Image too large.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
