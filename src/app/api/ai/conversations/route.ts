import { z } from "zod";
import { requireAccess } from "@/server/access";
import { endpoint, AppError } from "@/server/errors";
import { openConversation } from "@/server/ai/service";
import { scopeSchema } from "@/modules/ai/contracts";
export const POST = endpoint(async (request: Request) => {
  const access = await requireAccess("content", request);
  if (Number(request.headers.get("content-length")) > 4096)
    throw new AppError(413, "Request too large.");
  const input = z
    .object({
      scope: scopeSchema,
      recordId: z.string().min(1).max(100).nullable().default(null),
    })
    .parse(await request.json());
  return Response.json(
    await openConversation(access, input.scope, input.recordId),
  );
});
