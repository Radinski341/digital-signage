import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("@/lib/aws/s3Client", () => ({
  default: {
    send: vi.fn().mockRejectedValue(new Error("No network calls expected")),
  },
}));
import { storeImage, MAX_IMAGE_BYTES } from "@/server/media";
describe("image content verification before upload", () => {
  it("rejects executable formats without contacting storage", async () => {
    await expect(
      storeImage(
        "site",
        Buffer.from('<svg onload="alert(1)"/>'),
        "image/svg+xml",
      ),
    ).rejects.toThrow("JPEG");
  });
  it("rejects oversized files before processing", async () => {
    await expect(
      storeImage("site", Buffer.alloc(MAX_IMAGE_BYTES + 1), "image/png"),
    ).rejects.toThrow("10 MB");
  });
  it("decodes content and rejects spoofed MIME types", async () => {
    vi.stubEnv("MEDIA_PUBLIC_BASE_URL", "https://media.example.test");
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    await expect(storeImage("site", png, "image/jpeg")).rejects.toThrow(
      "does not match",
    );
    await expect(
      storeImage("site", Buffer.from("not really an image"), "image/png"),
    ).rejects.toThrow("valid supported image");
    vi.unstubAllEnvs();
  });
});
