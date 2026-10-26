import { endpoint } from "@/server/errors";
import { listSlides, saveSlide } from "@/server/signage";
export const runtime = "nodejs";
export const GET = endpoint(listSlides);
export const POST = endpoint((req: Request) => saveSlide(req));
