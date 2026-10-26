/** Opt-in SDK/tool-schema check; no restaurant data or CMS mutations. */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  if (process.env.AI_BUILDER_SMOKE !== "1")
    throw new Error(
      "Set AI_BUILDER_SMOKE=1 to explicitly enable this billed, synthetic API check.",
    );
  if (!process.env.OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY is required.");
  const { default: OpenAI } = await import("openai");
  const { builderTools } = await import("../src/server/ai/workspace-tools");
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 90000,
    maxRetries: 0,
  });
  const response = await client.responses.create({
    model: "gpt-6-luna",
    store: false,
    max_output_tokens: 1500,
    reasoning: { effort: "low" },
    tools: builderTools({ role: "OWNER" } as any, true) as any,
    tool_choice: { type: "function", name: "get_schema" },
    input:
      "Synthetic SDK check only. Request the pages form schema with get_schema. Do not create content.",
  });
  const calls = response.output.filter((item) => item.type === "function_call");
  if (!calls.some((call) => call.name === "get_schema"))
    throw new Error("The expected schema tool was not requested.");
  console.log(
    JSON.stringify({
      model: "gpt-6-luna",
      success: true,
      toolsRequested: calls.map((c) => c.name),
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    }),
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error && error.message.startsWith("Set AI_BUILDER_SMOKE")
      ? error.message
      : JSON.stringify({
          event: "ai_builder_smoke_failed",
          type: error instanceof Error ? error.name : "unknown",
        }),
  );
  process.exitCode = 1;
});
