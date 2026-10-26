import { z } from "zod";
export const idSchema = z.string().min(1).max(100);
export const slugSchema = z
  .string()
  .max(100)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and hyphens",
  );
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const httpUrl = z
  .string()
  .max(2048)
  .url()
  .refine((v) => {
    try {
      const u = new URL(v);
      return (
        ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
      );
    } catch {
      return false;
    }
  }, "Use an HTTP or HTTPS address without credentials");
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f\\]/.test(value))
    return null;
  if (/^\/(?!\/)/.test(value)) return value;
  if (
    /^tel:\+?[\d().-]+$/.test(value) ||
    /^mailto:[^<>\s@]+@[^<>\s@]+$/.test(value)
  )
    return value;
  return httpUrl.safeParse(value).success ? value : null;
}
export const permissions = {
  OWNER: ["content", "settings", "users"],
  ADMIN: ["content", "settings"],
  EDITOR: ["content"],
} as const;
export type Permission = "content" | "settings" | "users";
export function permits(role: string, permission: Permission) {
  return (
    (
      permissions[role as keyof typeof permissions] as
        readonly string[] | undefined
    )?.includes(permission) ?? false
  );
}
export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}
export { localize, formatPrice } from "./formatting";
export function colorContrast(first: string, second: string) {
  const l = (hex: string) => {
    const c = [1, 3, 5]
      .map((n) => parseInt(hex.slice(n, n + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  };
  const values = [l(first), l(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
export function contrastText(background: string) {
  return colorContrast(background, "#ffffff") >=
    colorContrast(background, "#000000")
    ? "#ffffff"
    : "#000000";
}
