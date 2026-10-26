import { afterEach, describe, expect, it, vi } from "vitest";
import { builderLimits, allowanceUsage } from "@/server/ai/budget";
afterEach(() => vi.unstubAllEnvs());
describe("builder continuation budgets", () => {
  it("defaults to fifty times the original run allowance", () => {
    for (const key of [
      "AI_BUILDER_MAX_CALLS",
      "AI_BUILDER_MAX_INPUT_TOKENS",
      "AI_BUILDER_MAX_OUTPUT_TOKENS",
    ])
      vi.stubEnv(key, "");
    expect(builderLimits()).toEqual({
      calls: 64 * 50,
      inputTokens: 1000000 * 50,
      outputTokens: 128000 * 50,
    });
  });
  it("keeps lifetime usage while measuring only the current allowance", () => {
    expect(
      allowanceUsage({
        calls: 70,
        inputTokens: 1200000,
        outputTokens: 150000,
        budgetStartedCalls: 64,
        budgetStartedInputTokens: 1000000,
        budgetStartedOutputTokens: 128000,
      }),
    ).toEqual({ calls: 6, inputTokens: 200000, outputTokens: 22000 });
    expect(
      allowanceUsage({ calls: 64, inputTokens: 1000000, outputTokens: 128000 }),
    ).toEqual({ calls: 64, inputTokens: 1000000, outputTokens: 128000 });
  });
  it("accepts larger operator limits and honors explicit overrides", () => {
    vi.stubEnv("AI_BUILDER_MAX_CALLS", "5000");
    vi.stubEnv("AI_BUILDER_MAX_INPUT_TOKENS", "100000000");
    vi.stubEnv("AI_BUILDER_MAX_OUTPUT_TOKENS", "12800000");
    expect(builderLimits()).toEqual({
      calls: 5000,
      inputTokens: 100000000,
      outputTokens: 12800000,
    });
  });
});
