import { positiveLimit } from "./model";
export function builderLimits() {
  return {
    calls: positiveLimit("AI_BUILDER_MAX_CALLS", 3200, 12800),
    inputTokens: positiveLimit(
      "AI_BUILDER_MAX_INPUT_TOKENS",
      50000000,
      500000000,
    ),
    outputTokens: positiveLimit(
      "AI_BUILDER_MAX_OUTPUT_TOKENS",
      6400000,
      64000000,
    ),
  };
}
export type BuilderUsage = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  budgetStartedCalls?: number;
  budgetStartedInputTokens?: number;
  budgetStartedOutputTokens?: number;
};
export function allowanceUsage(run: BuilderUsage) {
  return {
    calls: Math.max(0, run.calls - (run.budgetStartedCalls ?? 0)),
    inputTokens: Math.max(
      0,
      run.inputTokens - (run.budgetStartedInputTokens ?? 0),
    ),
    outputTokens: Math.max(
      0,
      run.outputTokens - (run.budgetStartedOutputTokens ?? 0),
    ),
  };
}
