import { endpoint } from "@/server/errors";
import { requireAccess } from "@/server/access";
import { publishPage } from "@/server/cms";
export const POST = endpoint(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const access = await requireAccess("content", req);
    return Response.json(
      await publishPage(access, (await ctx.params).id, await req.json()),
    );
  },
);
