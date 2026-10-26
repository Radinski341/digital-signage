-- Preserve cumulative usage and existing checkpoints; each explicit resume renews its allowance.
ALTER TABLE "AiRun"
  ADD COLUMN "budgetStartedCalls" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "budgetStartedInputTokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "budgetStartedOutputTokens" INTEGER NOT NULL DEFAULT 0;
