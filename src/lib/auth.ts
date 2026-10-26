import { validatedAuthSecret } from "@/server/environment";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { createHmac } from "node:crypto";
import { db } from "@/server/db";

async function throttle(key: string, limit: number) {
  const digest = createHmac(
    "sha256",
    process.env.NEXTAUTH_SECRET || "development-only",
  )
    .update(key)
    .digest("hex");
  const now = new Date();
  // Atomic SQL counters work across serverless instances; no in-memory security state.
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "LoginWindow" ("key", "count", "expiresAt") VALUES (${digest}, 1, ${new Date(now.getTime() + 900000)})
    ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "LoginWindow"."expiresAt" < ${now} THEN 1 ELSE "LoginWindow"."count" + 1 END,
    "expiresAt" = CASE WHEN "LoginWindow"."expiresAt" < ${now} THEN ${new Date(now.getTime() + 900000)} ELSE "LoginWindow"."expiresAt" END RETURNING "count"`;
  return rows[0].count <= limit;
}
export const authOptions: NextAuthOptions = {
  secret: validatedAuthSecret(
    process.env.NODE_ENV,
    process.env.NEXTAUTH_SECRET,
    process.env.NEXTAUTH_URL,
  ),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (
          !credentials?.email ||
          !credentials.password ||
          credentials.email.length > 254 ||
          Buffer.byteLength(credentials.password) > 72
        )
          return null;
        try {
          const email = credentials.email.trim().toLowerCase();
          const ip =
            typeof request.headers?.["x-vercel-forwarded-for"] === "string"
              ? request.headers["x-vercel-forwarded-for"].split(",")[0]
              : "local";
          if (
            !(await throttle("email:" + email, 10)) ||
            !(await throttle("ip:" + ip, 60))
          )
            return null;
          let user = await db.user.findUnique({
            where: { email: credentials.email.trim() },
          });
          if (!user) {
            const candidates = await db.user.findMany({
              where: { email: { equals: email, mode: "insensitive" } },
              take: 2,
            });
            if (candidates.length === 1) user = candidates[0];
          }
          const valid = await bcrypt.compare(
            credentials.password,
            user?.password ??
              "$2b$12$YOhkVzqbX/5QBlQOHNf1..TtfvtrPU2zPhp7Yyg/BreqLED64qf22",
          );
          if (
            !user ||
            user.disabled ||
            !valid ||
            credentials.password === "Admin123!"
          )
            return null;
          return {
            id: user.id,
            email: user.email,
            sessionVersion: user.sessionVersion,
          };
        } catch {
          console.error(
            JSON.stringify({
              event: "login_failed",
              reason: "authentication_service_unavailable",
            }),
          );
          return null;
        }
      },
    }),
  ],
  pages: { signIn: "/admin/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.sessionVersion = (
          user as typeof user & { sessionVersion: number }
        ).sessionVersion;
      }
      return token;
    },
    async session({ session, token }) {
      session.sessionVersion = token.sessionVersion as number;
      return session;
    },
  },
};
