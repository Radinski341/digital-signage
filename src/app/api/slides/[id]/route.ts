import { endpoint } from "@/server/errors";
import { saveSlide, deleteSlide } from "@/server/signage";
export const runtime = "nodejs";
export const PUT = endpoint(
  (req: Request, ctx: { params: Promise<{ id: string }> }) =>
    saveSlide(req, ctx),
);
export const DELETE = endpoint(deleteSlide);

import { playerSlide } from "@/server/signage-rendering";
import { requireAccess } from "@/server/access";
export const GET = endpoint(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const preview = new URL(req.url).searchParams.has("preview");
    const access = preview ? await requireAccess() : null;
    const slide = await playerSlide((await ctx.params).id, access?.siteId);
    if (!slide)
      return Response.json({ error: "Slide not found." }, { status: 404 });
    const etag = `"${slide.version}-${slide.site.version}-${Math.floor(Date.now() / 900000)}"`;
    return Response.json(slide, {
      headers: {
        "Cache-Control": "no-store",
        ETag: etag,
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  },
);
