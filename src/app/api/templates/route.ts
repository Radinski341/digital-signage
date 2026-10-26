import { endpoint } from "@/server/errors";
import { listTemplates, createTemplate } from "@/server/signage";
export const runtime = "nodejs";
export const GET = endpoint(listTemplates);
export const POST = endpoint(createTemplate);
