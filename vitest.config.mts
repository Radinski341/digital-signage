import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: [
      "tests/unit/**/*.test.ts",
      ...(process.env.TEST_DATABASE_URL
        ? ["tests/integration/**/*.test.ts"]
        : []),
    ],
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL || "postgresql://unused/unused",
      DIRECT_DATABASE_URL:
        process.env.TEST_DATABASE_URL || "postgresql://unused/unused",
    },
    fileParallelism: false,
  },
});
