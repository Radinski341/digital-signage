import { revalidatePath, revalidateTag } from "next/cache";
export function invalidateSite(siteId: string) {
  revalidateTag(`site:${siteId}`);
  revalidatePath("/", "layout");
}
