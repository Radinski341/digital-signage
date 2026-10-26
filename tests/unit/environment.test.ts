import { describe, it, expect } from "vitest";
import { validatedAuthSecret } from "@/server/environment";
describe("production authentication configuration", () => {
  it.each(["", "secret", "replace-with-at-least-32-random-bytes"])(
    "rejects missing, short or known example secrets",
    (secret) =>
      expect(() =>
        validatedAuthSecret("production", secret, "https://example.test"),
      ).toThrow("NEXTAUTH_SECRET"),
  );
  it("requires HTTPS outside local test origins", () => {
    const secret = "a-long-test-secret-only-for-validation";
    expect(() =>
      validatedAuthSecret("production", secret, "http://example.test"),
    ).toThrow("HTTPS");
    expect(
      validatedAuthSecret("production", secret, "http://localhost:3100"),
    ).toBe(secret);
  });
  it("allows local development without provisioning production secrets", () =>
    expect(
      validatedAuthSecret("development", undefined, undefined),
    ).toBeUndefined());
});
