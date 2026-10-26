import { endpoint } from "@/server/errors";
import { listBanners, createBanner } from "@/server/signage";
export const runtime = "nodejs";
export const GET = endpoint(listBanners);
export const POST = endpoint(createBanner);
