import { endpoint, AppError } from "@/server/errors";
import { requireAccess } from "@/server/access";
import { storeImage } from "@/server/media";
export const runtime = "nodejs";
export const POST = endpoint(async (req: Request) => {
  const { siteId } = await requireAccess("content", req);
  if (Number(req.headers.get("content-length") ?? 0) > 4_000_000)
    throw new AppError(413, "Use the Media Library for larger images.");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError(422, "Choose an image.");
  const media = await storeImage(
    siteId,
    Buffer.from(await file.arrayBuffer()),
    file.type,
  );
  return Response.json({ ...media, url: media.url }, { status: 201 });
});
