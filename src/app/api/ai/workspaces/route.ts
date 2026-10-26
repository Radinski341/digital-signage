import { requireAccess } from "@/server/access";
import { endpoint, AppError } from "@/server/errors";
import { db } from "@/server/db";
import { createWorkspace } from "@/server/ai/workspaces";
export const GET = endpoint(async () => {
  const a = await requireAccess();
  return Response.json({
    rows: await db.aiWorkspace.findMany({
      where: { siteId: a.siteId, ownerId: a.user.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        state: true,
        revision: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    configured: !!process.env.OPENAI_API_KEY,
  });
});
export const POST = endpoint(async (request: Request) => {
  const a = await requireAccess("content", request);
  const text = await request.text();
  if (text.length > 70000) throw new AppError(413, "Brief is too large.");
  return Response.json(await createWorkspace(a, JSON.parse(text)), {
    status: 201,
  });
});
