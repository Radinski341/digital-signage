import { PrismaClient } from "@prisma/client";
const globalDb = globalThis as unknown as { restaurantPrisma?: PrismaClient };
export const db = globalDb.restaurantPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.restaurantPrisma = db;
