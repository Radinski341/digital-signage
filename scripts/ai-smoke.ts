import { loadEnvConfig } from "@next/env";
import { z } from "zod";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.OPENAI_API_KEY)
    throw new Error(
      "Configure OPENAI_API_KEY before running this opt-in live API check.",
    );
  const { generateTurn } = await import("../src/server/ai/model");
  const result = await generateTurn({
    scope: "media",
    context: {
      suppliedImageDescription: "A white ceramic bowl on a wooden table.",
    },
    draft: { caption: "" },
    validators: { caption: z.string().max(2000) },
    locales: ["en"],
    history: [
      {
        role: "user",
        content:
          "Write a short English caption based only on the supplied image description. Do not ask more questions.",
      },
    ],
  });
  console.log(
    JSON.stringify({
      model: "gpt-6-luna",
      success: true,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      changedFields: result.output.changes.map((c) => c.field),
    }),
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "AI smoke check failed.",
  );
  process.exitCode = 1;
});
