/** Fail closed on known placeholder secrets; never include configured values in errors. */
export function validatedAuthSecret(
  mode: string | undefined,
  secret: string | undefined,
  origin: string | undefined,
) {
  if (mode !== "production") return secret;
  if (
    !secret ||
    secret.length < 32 ||
    /^replace[-_]|^change[-_]?me$/i.test(secret)
  )
    throw new Error(
      "Configure a unique NEXTAUTH_SECRET of at least 32 characters before production use.",
    );
  if (!origin) throw new Error("Configure NEXTAUTH_URL before production use.");
  const url = new URL(origin);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("Production authentication requires an HTTPS origin.");
  return secret;
}
