import { getFileUrl } from "@/lib/aws/s3Functions";
import { sanitizeLegacyHtml } from "@/server/content";
import { db } from "@/server/db";
export async function signBannerMedia(
  template: { fields: Array<{ key: string; type: string; isArray: boolean }> },
  data: any,
) {
  const result: Record<string, any> = { ...(data || {}) };
  async function resolve(value: string) {
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("/")) return value;
    const managed = await db.mediaAsset.findUnique({
      where: { key: value },
      select: { url: true },
    });
    return managed?.url ?? getFileUrl(value);
  }
  for (const f of template.fields || []) {
    const value = result[f.key];
    if (!value) continue;
    if (f.type === "IMAGE") {
      if (f.isArray && Array.isArray(value))
        result[f.key] = await Promise.all(value.map(resolve));
      else if (typeof value === "string") result[f.key] = await resolve(value);
    }
    if (f.type === "RICHTEXT" && typeof value === "string")
      result[f.key] = sanitizeLegacyHtml(value);
  }
  return result;
}
