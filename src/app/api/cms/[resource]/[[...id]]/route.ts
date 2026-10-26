import { schemas, Resource } from "@/modules/cms";
import { requireAccess } from "@/server/access";
import { endpoint, AppError } from "@/server/errors";
import { listResource, saveResource, permission } from "@/server/cms";
type Context = { params: Promise<{ resource: string; id?: string[] }> };
function resource(value: string): Resource {
  if (!Object.hasOwn(schemas, value))
    throw new AppError(404, "Unknown content area.");
  return value as Resource;
}
export const GET = endpoint(async (_req: Request, ctx: Context) => {
  const params = await ctx.params;
  const name = resource(params.resource);
  const access = await requireAccess(name === "users" ? "users" : "content");
  const rows = await listResource(access, name);
  return Response.json({
    rows: params.id?.[0]
      ? rows.filter((r: any) => r.id === params.id![0])
      : rows,
    site: access.site,
    role: access.role,
  });
});
export const POST = endpoint(async (req: Request, ctx: Context) => {
  const params = await ctx.params;
  const name = resource(params.resource);
  const access = await requireAccess(permission(name), req);
  return Response.json(await saveResource(access, name, await req.json()), {
    status: 201,
  });
});
export const PUT = endpoint(async (req: Request, ctx: Context) => {
  const params = await ctx.params;
  const name = resource(params.resource);
  const access = await requireAccess(permission(name), req);
  if (params.id?.length !== 1)
    throw new AppError(400, "Content identifier required.");
  return Response.json(
    await saveResource(access, name, await req.json(), params.id[0]),
  );
});
