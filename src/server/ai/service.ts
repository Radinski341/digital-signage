import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import type { Access } from "@/server/cms";
import {
  AI_MODEL,
  scopeSchema,
  structuredAnswers,
  turnSchema,
  type AiBody,
} from "@/modules/ai/contracts";
import { editableSchemas, projectDraft } from "@/modules/ai/scopes";
import { prepareDraftChanges } from "./draft-output";
import { aiContext, assertTarget } from "./context";
import { generateTurn, positiveLimit } from "./model";

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function ownedConversation(access: Access, id: string) {
  const conversation = await db.aiConversation.findFirst({
    where: { id, siteId: access.siteId, ownerId: access.user.id },
  });
  if (!conversation) throw new AppError(404, "Conversation not found.");
  const scope = scopeSchema.parse(conversation.scope);
  await assertTarget(access, scope, conversation.recordId);
  return { ...conversation, scope };
}

export async function conversationMessages(id: string, before?: string) {
  const anchor = before
    ? await db.aiMessage.findFirst({
        where: { id: before, conversationId: id },
      })
    : null;
  if (before && !anchor) throw new AppError(400, "Invalid history cursor.");
  const rows = await db.aiMessage.findMany({
    where: {
      conversationId: id,
      ...(anchor
        ? {
            OR: [
              { createdAt: { lt: anchor.createdAt } },
              { createdAt: anchor.createdAt, id: { lt: anchor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 31,
  });
  return {
    messages: rows.slice(0, 30).reverse(),
    nextCursor: rows.length > 30 ? rows[29].id : null,
  };
}

export async function openConversation(
  access: Access,
  scope: ReturnType<typeof scopeSchema.parse>,
  recordId: string | null,
) {
  await assertTarget(access, scope, recordId);
  const conversation = recordId
    ? await db.aiConversation.upsert({
        where: {
          siteId_ownerId_scope_recordId: {
            siteId: access.siteId,
            ownerId: access.user.id,
            scope,
            recordId,
          },
        },
        create: {
          siteId: access.siteId,
          ownerId: access.user.id,
          scope,
          recordId,
        },
        update: {},
      })
    : await db.aiConversation.create({
        data: { siteId: access.siteId, ownerId: access.user.id, scope },
      });
  const locales = await db.siteLocale.findMany({
    where: { siteId: access.siteId },
    select: { code: true, label: true },
  });
  return {
    conversation,
    ...(await conversationMessages(conversation.id)),
    locales,
    defaultLocale: access.site.defaultLocale,
    configured: Boolean(process.env.OPENAI_API_KEY),
  };
}

export async function attachConversation(
  access: Access,
  id: string,
  recordId: string,
) {
  const conversation = await ownedConversation(access, id);
  if (conversation.recordId && conversation.recordId !== recordId)
    throw new AppError(409, "This chat belongs to a different record.");
  await assertTarget(access, conversation.scope, recordId);
  await db.aiConversation.update({ where: { id }, data: { recordId } });
}

export async function clearConversation(access: Access, id: string) {
  await ownedConversation(access, id);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"ai:" + access.siteId}))`;
    // Preserve quota counters, remove all stored conversation content, including retry payloads.
    await tx.aiRequest.updateMany({
      where: { conversationId: id },
      data: { result: Prisma.DbNull, status: "CLEARED" },
    });
    await tx.aiConversation.delete({
      where: { id, ownerId: access.user.id, siteId: access.siteId },
    });
  });
}

export async function runTurn(
  access: Access,
  id: string,
  raw: unknown,
  refreshAccess: () => Promise<Access>,
) {
  const input = turnSchema.parse(raw);
  if (JSON.stringify(input).length > 220000)
    throw new AppError(
      413,
      "This editor is too large for one AI request. Work on a smaller draft.",
    );
  const conversation = await ownedConversation(access, id);
  const existing = await db.aiRequest.findUnique({
    where: { conversationId_key: { conversationId: id, key: input.key } },
  });
  if (existing?.status === "COMPLETED" && existing.result)
    return existing.result;
  if (existing)
    throw new AppError(
      409,
      existing.status === "PENDING"
        ? "This message is still processing. Refresh the conversation shortly."
        : "This request did not finish. Send a new message to retry.",
    );
  if (!process.env.OPENAI_API_KEY)
    throw new AppError(
      503,
      "AI assistance is not configured. Ask your administrator to configure OPENAI_API_KEY. Manual editing is available.",
    );
  const context = await aiContext(
    access,
    conversation.scope,
    conversation.recordId,
    input.templateId,
    input.sourceMode,
  );
  if (input.locales.some((locale) => !context.allowedLocales.includes(locale)))
    throw new AppError(
      422,
      "Add the requested language in Languages before generating its content.",
    );
  if (!input.locales.length) input.locales = [access.site.defaultLocale];
  const allValidators = editableSchemas(conversation.scope, context.fields);
  if (conversation.scope === "locales" && conversation.recordId)
    delete allValidators.code;
  const validators = input.translationOnly
    ? Object.fromEntries(
        Object.entries(allValidators).filter(([field]) =>
          ["translations", "sections"].includes(field),
        ),
      )
    : allValidators;
  if (!Object.keys(validators).length)
    throw new AppError(
      422,
      "There are no text fields available in this editor.",
    );
  const draft = projectDraft(input.draft, validators);
  let answers: NonNullable<AiBody["answers"]> = [];
  if (input.answers.length) {
    const questionMessage = await db.aiMessage.findFirst({
      where: {
        id: input.questionMessageId || "",
        conversationId: id,
        role: "assistant",
      },
    });
    if (!questionMessage)
      throw new AppError(422, "These questions are no longer available.");
    try {
      answers = structuredAnswers(
        (questionMessage.body as AiBody).questions ?? [],
        input.answers,
      );
    } catch (error) {
      throw new AppError(422, (error as Error).message);
    }
  }
  const userBody: AiBody = {
    message: input.message,
    ...(answers.length ? { answers } : {}),
  };
  const request = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"ai:" + access.siteId}))`;
    const current = await tx.aiConversation.findUnique({ where: { id } });
    if (!current || current.revision !== input.revision)
      throw new AppError(
        409,
        "The conversation changed. Close and reopen the assistant before sending again.",
      );
    if (
      await tx.aiRequest.count({
        where: {
          conversationId: id,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
      })
    )
      throw new AppError(409, "Wait for the current message to finish.");
    const [hourly, daily] = await Promise.all([
      tx.aiRequest.count({
        where: {
          siteId: access.siteId,
          ownerId: access.user.id,
          createdAt: { gte: new Date(Date.now() - 3600000) },
        },
      }),
      tx.aiRequest.count({
        where: {
          siteId: access.siteId,
          createdAt: { gte: new Date(Date.now() - 86400000) },
        },
      }),
    ]);
    if (
      hourly >= positiveLimit("AI_USER_HOURLY_LIMIT", 20, 10000) ||
      daily >= positiveLimit("AI_SITE_DAILY_LIMIT", 100, 100000)
    )
      throw new AppError(
        429,
        "The AI request allowance has been reached. Try again later; manual editing remains available.",
      );
    return tx.aiRequest.create({
      data: {
        conversationId: id,
        siteId: access.siteId,
        ownerId: access.user.id,
        key: input.key,
        model: AI_MODEL,
        expiresAt: new Date(Date.now() + 120000),
      },
    });
  });
  try {
    const historyRows = (await conversationMessages(id)).messages;
    const history = historyRows.map((m) => ({
      role: m.role as "user" | "assistant",
      content: JSON.stringify(m.body),
    }));
    // Retain all messages in storage, but bound the replay supplied to the model.
    while (JSON.stringify(history).length > 80000) history.shift();
    history.push({ role: "user", content: JSON.stringify(userBody) });
    const generated = await generateTurn({
      scope: conversation.scope,
      context: context.context,
      draft,
      validators,
      locales: input.locales,
      history,
      formDraft: input.draft,
      fields: context.fields,
    });
    await db.aiRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        inputTokens: generated.inputTokens,
        outputTokens: generated.outputTokens,
      },
    });
    const { changes, warnings, unapplied } = prepareDraftChanges({
      scope: conversation.scope,
      draft,
      raw: generated.output.changes,
      locales: input.locales,
      fields: context.fields,
      allowedFields: Object.keys(validators),
      references: context.references,
      translationOnly: input.translationOnly,
    });
    const refreshed = await refreshAccess();
    if (
      refreshed.user.id !== access.user.id ||
      refreshed.siteId !== access.siteId
    )
      throw new AppError(403, "Your access changed. Please sign in again.");
    await assertTarget(refreshed, conversation.scope, conversation.recordId);
    const body: AiBody = {
      message: generated.output.message,
      questions: generated.output.questions,
      changes,
      warnings,
      unapplied,
    };
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"ai:" + access.siteId}))`;
      const active = await tx.aiRequest.findUnique({
        where: { id: request.id },
      });
      const current = await tx.aiConversation.findUnique({ where: { id } });
      if (
        !active ||
        active.status !== "PENDING" ||
        active.expiresAt < new Date() ||
        !current ||
        current.revision !== input.revision
      )
        throw new AppError(
          409,
          "This response expired or the conversation was cleared. Your form is unchanged.",
        );
      await tx.aiMessage.create({
        data: { conversationId: id, role: "user", body: json(userBody) },
      });
      const message = await tx.aiMessage.create({
        data: {
          conversationId: id,
          role: "assistant",
          body: json(body),
          createdAt: new Date(Date.now() + 1),
        },
      });
      await tx.aiConversation.update({
        where: { id },
        data: { revision: { increment: 1 } },
      });
      const result = { message, userBody, revision: input.revision + 1 };
      await tx.aiRequest.update({
        where: { id: request.id },
        data: {
          status: "COMPLETED",
          result: json(result),
          inputTokens: generated.inputTokens,
          outputTokens: generated.outputTokens,
        },
      });
      return json(result);
    });
  } catch (error) {
    await db.aiRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: "FAILED" },
    });
    if (error instanceof AppError) throw error;
    console.error(
      JSON.stringify({
        event: "ai_request_failed",
        requestId: request.id,
        type: error instanceof Error ? error.name : "unknown",
      }),
    );
    throw new AppError(
      502,
      "AI assistance is temporarily unavailable. Your form is unchanged. Please try again.",
    );
  }
}
