import { z } from "zod";

export const AI_MODEL = "gpt-6-luna" as const;
export const scopeSchema = z.enum([
  "profile",
  "branding",
  "locations",
  "categories",
  "items",
  "tags",
  "locales",
  "integrations",
  "actions",
  "pages",
  "navigation",
  "media",
  "banners",
  "slides",
  "templates",
]);
export type AiScope = z.infer<typeof scopeSchema>;
export const questionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),
  question: z.string().min(1).max(1000),
  kind: z.enum(["text", "multiline", "select"]),
  options: z.array(z.string().min(1).max(200)).max(30),
  required: z.boolean(),
});
export const answerSchema = z.object({
  questionId: z.string().max(60),
  answer: z.string().max(10000),
});
export const turnSchema = z
  .object({
    key: z.uuid(),
    revision: z.number().int().min(0),
    message: z.string().trim().max(12000).default(""),
    answers: z.array(answerSchema).max(12).default([]),
    questionMessageId: z.string().max(100).optional(),
    locales: z.array(z.string().max(35)).max(10),
    draft: z.record(z.string(), z.unknown()),
    templateId: z.string().max(100).optional(),
    sourceMode: z.enum(["MANUAL", "CATEGORY", "ITEM"]).optional(),
    translationOnly: z.boolean().default(false),
  })
  .refine(
    (v) => Boolean(v.message || v.answers.length),
    "Enter a message or answer the questions.",
  );
export type AiQuestion = z.infer<typeof questionSchema>;
export type AiChange = { field: string; value: unknown };
export type AiBody = {
  message: string;
  questions?: AiQuestion[];
  answers?: Array<{ questionId: string; question: string; answer: string }>;
  changes?: AiChange[];
  warnings?: Array<{ field: string; message: string }>;
  unapplied?: Array<{ field: string; text: string; reason: string }>;
};
export type AiChatMessage = {
  id: string;
  role: string;
  body: AiBody;
  createdAt?: string;
};

export function outputSchema(fields: string[]) {
  return z.object({
    message: z.string().min(1).max(12000),
    questions: z.array(questionSchema).max(12),
    changes: z
      .array(
        z.object({
          field: z.enum(fields as [string, ...string[]]),
          valueJson: z.string().max(180000),
        }),
      )
      .max(40),
  });
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Compare against the exact draft sent, never silently replace edits made in flight. */
export function mergeChanges(
  current: Record<string, unknown>,
  baseline: Record<string, unknown>,
  changes: AiChange[],
) {
  const next = { ...current };
  const applied: AiChange[] = [];
  const conflicts: string[] = [];
  for (const change of changes) {
    if (!sameValue(current[change.field], baseline[change.field]))
      conflicts.push(change.field);
    else {
      next[change.field] = change.value;
      applied.push(change);
    }
  }
  return { next, applied, conflicts };
}

export function structuredAnswers(
  questions: AiQuestion[],
  answers: z.infer<typeof answerSchema>[],
) {
  if (new Set(answers.map((a) => a.questionId)).size !== answers.length)
    throw new Error("Duplicate answers.");
  for (const answer of answers) {
    const question = questions.find((q) => q.id === answer.questionId);
    if (
      !question ||
      (question.kind === "select" &&
        answer.answer &&
        !question.options.includes(answer.answer))
    )
      throw new Error("Invalid question answer.");
  }
  if (
    questions.some(
      (q) =>
        q.required &&
        !answers.find((a) => a.questionId === q.id)?.answer.trim(),
    )
  )
    throw new Error("Please answer the required questions.");
  return answers.map((a) => ({
    ...a,
    question: questions.find((q) => q.id === a.questionId)!.question,
  }));
}
