import { z } from "zod";
import { requireAccess } from "@/server/access";
import { endpoint, AppError } from "@/server/errors";
import {
  ownedConversation,
  conversationMessages,
  attachConversation,
  clearConversation,
  runTurn,
} from "@/server/ai/service";
import { db } from "@/server/db";
type Context = { params: Promise<{ id: string }> };
export const maxDuration = 120;
export const GET = endpoint(async (request: Request, context: Context) => {
  const access = await requireAccess("content");
  const { id } = await context.params;
  const conversation = await ownedConversation(access, id);
  const locales = await db.siteLocale.findMany({
    where: { siteId: access.siteId },
    select: { code: true, label: true },
  });
  return Response.json({
    conversation,
    locales,
    defaultLocale: access.site.defaultLocale,
    configured: Boolean(process.env.OPENAI_API_KEY),
    ...(await conversationMessages(
      id,
      new URL(request.url).searchParams.get("before") || undefined,
    )),
  });
});
export const POST = endpoint(async (request: Request, context: Context) => {
  const access = await requireAccess("content", request);
  if (Number(request.headers.get("content-length")) > 230000)
    throw new AppError(413, "Request too large.");
  const text = await request.text();
  if (text.length > 230000) throw new AppError(413, "Request too large.");
  return Response.json(
    await runTurn(access, (await context.params).id, JSON.parse(text), () =>
      requireAccess("content", request),
    ),
  );
});
export const PATCH = endpoint(async (request: Request, context: Context) => {
  const access = await requireAccess("content", request);
  const input = z
    .object({ recordId: z.string().min(1).max(100) })
    .parse(await request.json());
  await attachConversation(access, (await context.params).id, input.recordId);
  return Response.json({ attached: true });
});
export const DELETE = endpoint(async (request: Request, context: Context) => {
  const access = await requireAccess("content", request);
  await clearConversation(access, (await context.params).id);
  return new Response(null, { status: 204 });
});
