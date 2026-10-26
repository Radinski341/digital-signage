import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    responses = { parse };
  },
}));
import { generateTurn } from "@/server/ai/model";
const input = {
  scope: "media" as const,
  context: {},
  draft: { caption: "" },
  validators: { caption: z.string() },
  locales: ["en"],
  history: [{ role: "user" as const, content: "Write a caption." }],
};
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-sent");
  parse.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
describe("OpenAI SDK transport", () => {
  it("uses only gpt-6-luna, requests structured output and disables response storage", async () => {
    parse.mockResolvedValue({
      status: "completed",
      output_parsed: { message: "Done", questions: [], changes: [] },
      usage: { input_tokens: 80, output_tokens: 20 },
    });
    expect(await generateTurn(input)).toMatchObject({
      inputTokens: 80,
      outputTokens: 20,
    });
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-6-luna",
        store: false,
        text: {
          format: expect.objectContaining({
            type: "json_schema",
            strict: true,
          }),
        },
      }),
    );
  });
  it("rejects incomplete output and missing credentials without changing providers", async () => {
    parse.mockResolvedValue({ status: "incomplete", output_parsed: null });
    await expect(generateTurn(input)).rejects.toMatchObject({ status: 502 });
    vi.stubEnv("OPENAI_API_KEY", "");
    parse.mockClear();
    await expect(generateTurn(input)).rejects.toMatchObject({ status: 503 });
    expect(parse).not.toHaveBeenCalled();
  });
  it("supplies full form requirements, live validation issues and structured content rules", async () => {
    parse.mockResolvedValue({
      status: "completed",
      output_parsed: { message: "Draft", questions: [], changes: [] },
    });
    await generateTurn({
      ...input,
      scope: "items",
      formDraft: { price: "12 EUR", status: "DRAFT" },
    });
    const instructions = parse.mock.calls[0][0].instructions;
    expect(instructions).toContain("currentValidationIssues");
    expect(instructions).toContain("decimal strings");
    expect(instructions).toContain('"status":"DRAFT"');
    expect(instructions).toContain("do not withhold useful draft writing");
  });
});
