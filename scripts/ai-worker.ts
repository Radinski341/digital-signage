import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { builderTick } = await import("../src/server/ai/worker");
  const { db } = await import("../src/server/db");
  let stopping = false;
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });
  const { builderLimits } = await import("../src/server/ai/budget");
  console.log(
    JSON.stringify({
      event: "ai_builder_worker_started",
      pid: process.pid,
      policy: "continuation-budget-v2",
      limits: builderLimits(),
    }),
  );
  try {
    while (!stopping) {
      try {
        if (!(await builderTick()))
          await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        console.error(
          JSON.stringify({
            event: "ai_builder_worker_error",
            type: e instanceof Error ? e.name : "unknown",
          }),
        );
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("AI builder worker could not start.");
  process.exitCode = 1;
});
