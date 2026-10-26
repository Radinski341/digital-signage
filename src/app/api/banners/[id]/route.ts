import { endpoint } from "@/server/errors";
import { updateBanner, deleteBanner } from "@/server/signage";
export const runtime = "nodejs";
export const PUT = endpoint(updateBanner);
export const DELETE = endpoint(deleteBanner);
