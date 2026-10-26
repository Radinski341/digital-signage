import { normalizeDishTranslation } from "@/modules/rich-text";
import { referenceIssues } from "./workspace-validation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import type { Access } from "@/server/cms";
import { AI_MODEL } from "@/modules/ai/contracts";
import {
  activeRunStates,
  stageSchema,
  type DraftOperation,
  type DraftIssue,
} from "@/modules/ai/workspace";
import { positiveLimit } from "./model";
import {
  json,
  checkResource,
  fingerprint,
  getRecord,
  recordPayload,
  ownedWorkspace,
  lockWorkspace,
  safePayload,
  fieldIssues,
  assertWorkspaceActor,
} from "./workspace-data";
export { ownedWorkspace } from "./workspace-data";
export const createWorkspaceSchema = z.object({
  title: z.string().trim().min(1).max(160),
  brief: z.string().trim().min(1).max(60000),
  locales: z.array(z.string().min(1).max(35)).min(1).max(20),
  includeSignage: z.boolean().default(false),
});
export async function createWorkspace(access: Access, raw: unknown) {
  const input = createWorkspaceSchema.parse(raw);
  for (const locale of input.locales)
    try {
      if (Intl.getCanonicalLocales(locale)[0] !== locale) throw new Error();
    } catch {
      throw new AppError(
        422,
        "Choose canonical language codes such as en or bg.",
      );
    }
  return db.$transaction(async (tx) => {
    await assertWorkspaceActor(tx, access);
    const conversation = await tx.aiConversation.create({
      data: {
        siteId: access.siteId,
        ownerId: access.user.id,
        scope: "site-builder",
      },
    });
    return tx.aiWorkspace.create({
      data: {
        ...input,
        locales: [...new Set([access.site.defaultLocale, ...input.locales])],
        siteId: access.siteId,
        ownerId: access.user.id,
        conversationId: conversation.id,
        siteVersion: access.site.version,
      },
    });
  });
}
export const runInputSchema = z.object({
  revision: z.number().int().min(0),
  key: z.uuid(),
  message: z.string().trim().min(1).max(60000),
});
export async function queueRun(access: Access, id: string, raw: unknown) {
  const input = runInputSchema.parse(raw);
  if (!process.env.OPENAI_API_KEY)
    throw new AppError(
      503,
      "Configure OPENAI_API_KEY to enable the website assistant.",
    );
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"ai:" + access.siteId}))`;
    await lockWorkspace(tx, id);
    const w = await ownedWorkspace(access, id, tx);
    await assertWorkspaceActor(tx, access);
    const existing = await tx.aiRequest.findUnique({
      where: {
        conversationId_key: {
          conversationId: w.conversationId,
          key: input.key,
        },
      },
    });
    if (existing)
      return tx.aiRun.findUniqueOrThrow({ where: { requestId: existing.id } });
    if (w.state === "APPLIED")
      throw new AppError(
        409,
        "This proposal is already published. Create a new proposal for further changes.",
      );
    if (w.revision !== input.revision)
      throw new AppError(409, "The proposal changed. Reload before sending.");
    if (w.runs.some((r: any) => activeRunStates.includes(r.state)))
      throw new AppError(409, "Wait for the run to finish or cancel it first.");
    const [hour, day] = await Promise.all([
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
      hour >= positiveLimit("AI_USER_HOURLY_LIMIT", 20, 10000) ||
      day >= positiveLimit("AI_SITE_DAILY_LIMIT", 100, 100000)
    )
      throw new AppError(
        429,
        "The AI request allowance has been reached. Try again later.",
      );
    const request = await tx.aiRequest.create({
      data: {
        conversationId: w.conversationId,
        siteId: access.siteId,
        ownerId: access.user.id,
        key: input.key,
        model: AI_MODEL,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await tx.aiMessage.create({
      data: {
        conversationId: w.conversationId,
        role: "user",
        body: { message: input.message },
      },
    });
    const run = await tx.aiRun.create({
      data: {
        workspaceId: id,
        requestId: request.id,
        sessionVersion: access.user.sessionVersion,
        input: [],
      },
    });
    await tx.aiWorkspace.update({
      where: { id },
      data: { revision: { increment: 1 }, state: "GENERATING" },
    });
    return run;
  });
}
export async function cancelRun(access: Access, id: string, revision: number) {
  return db.$transaction(async (tx) => {
    await lockWorkspace(tx, id);
    const w = await ownedWorkspace(access, id, tx);
    await assertWorkspaceActor(tx, access);
    if (w.revision !== revision || w.state === "APPLIED")
      throw new AppError(409, "The proposal changed. Reload first.");
    const pending = await tx.aiRun.findMany({
      where: { workspaceId: id, state: { in: activeRunStates } },
    });
    await tx.aiRun.updateMany({
      where: { workspaceId: id, state: { in: activeRunStates } },
      data: { state: "CANCELLED", leaseToken: null, leaseUntil: null },
    });
    await tx.aiRequest.updateMany({
      where: { id: { in: pending.map((r) => r.requestId) } },
      data: { status: "CANCELLED" },
    });
    return tx.aiWorkspace.update({
      where: { id },
      data: { state: "DRAFT", revision: { increment: 1 } },
    });
  });
}
export async function stageOperation(
  access: Access,
  id: string,
  raw: unknown,
  options: {
    manual?: boolean;
    revision?: number;
    runId?: string;
    leaseToken?: string;
  } = {},
) {
  const input = stageSchema.parse(raw);
  checkResource(access, input.resource);
  safePayload(input.payload);
  return db.$transaction(async (tx) => {
    await lockWorkspace(tx, id);
    const w = await ownedWorkspace(access, id, tx);
    await assertWorkspaceActor(tx, access);
    if (w.state === "APPLIED")
      throw new AppError(409, "This proposal is already published.");
    if (options.revision !== undefined && w.revision !== options.revision)
      throw new AppError(409, "This proposal changed. Reload first.");
    if (options.runId) {
      const run = await tx.aiRun.findFirst({
        where: {
          id: options.runId,
          workspaceId: id,
          state: "RUNNING",
          leaseToken: options.leaseToken,
          leaseUntil: { gt: new Date() },
        },
      });
      if (!run)
        throw new AppError(409, "This generation run is no longer active.");
    } else if (w.runs.some((r: any) => activeRunStates.includes(r.state)))
      throw new AppError(409, "Cancel generation before editing the proposal.");
    if (
      ["templates", "banners", "slides"].includes(input.resource) &&
      !w.includeSignage
    )
      throw new AppError(
        422,
        "Create a proposal with signage enabled to change displays.",
      );
    const previous = w.operations.find((op: any) => op.key === input.key);
    if (previous && previous.resource !== input.resource)
      throw new AppError(422, "A proposal key cannot change its content area.");
    if (previous?.manual && !options.manual)
      return {
        targetId: previous.targetId,
        skipped: true,
        message:
          "This record was manually edited. Ask the employee to allow AI revisions.",
      };
    if (previous && input.recordId && previous.targetId !== input.recordId)
      throw new AppError(422, "A proposal key cannot change its target.");
    const targetId = previous?.targetId || input.recordId || randomUUID();
    const duplicate = w.operations.find(
      (op: any) =>
        op.targetId === targetId &&
        op.resource === input.resource &&
        op.key !== input.key,
    );
    if (duplicate)
      throw new AppError(
        422,
        `Use the existing proposal key ${duplicate.key} for this record.`,
      );
    if (!previous && w.operations.length >= 500)
      throw new AppError(
        422,
        "A proposal supports up to 500 records. Complete this proposal before starting another.",
      );
    const current = await getRecord(
      access.siteId,
      input.resource,
      targetId,
      tx,
    );
    if (input.recordId && !previous && !current)
      throw new AppError(404, "Selected content does not belong to this site.");
    if (input.resource === "media" && !current)
      throw new AppError(
        422,
        "Upload photographs through the Media Library before selecting them.",
      );
    await assertWorkspaceActor(tx, access, input.resource);
    if (["profile", "branding"].includes(input.resource) && !current)
      throw new AppError(
        422,
        "Select the existing restaurant settings record.",
      );
    const baseline =
      previous?.baseline ||
      (current ? recordPayload(input.resource, current, access.site) : null);
    // Existing settings are full-record forms. Merge patches so unrelated fields and locales survive.
    const payload = {
      ...((previous?.payload as any) || baseline || {}),
      ...input.payload,
    };
    if (input.resource === "items" && Array.isArray(input.payload.translations))
      payload.translations = input.payload.translations.map(
        normalizeDishTranslation,
      );
    if (
      Array.isArray(input.payload.translations) &&
      (Array.isArray(baseline?.translations) ||
        Array.isArray((previous?.payload as any)?.translations))
    ) {
      const rows = Array.isArray((previous?.payload as any)?.translations)
        ? (previous?.payload as any).translations
        : Array.isArray(baseline?.translations)
          ? baseline.translations
          : [];
      payload.translations = [
        ...rows.filter(
          (t: any) =>
            !(input.payload.translations as any[]).some(
              (x) => x.locale === t.locale,
            ),
        ),
        ...(input.payload.translations as any[]).map((t) => ({
          ...rows.find((x: any) => x.locale === t.locale),
          ...(input.resource === "items" ? normalizeDishTranslation(t) : t),
        })),
      ];
    }
    if (input.resource === "locales" && Array.isArray(input.payload.strings)) {
      const rows = Array.isArray((previous?.payload as any)?.strings)
        ? (previous?.payload as any).strings
        : Array.isArray(baseline?.strings)
          ? baseline.strings
          : [];
      payload.strings = [
        ...rows.filter(
          (s: any) =>
            !(input.payload.strings as any[]).some((t) => t.key === s.key),
        ),
        ...input.payload.strings,
      ];
    }
    // Baselines, not model-provided version numbers, control concurrency.
    if (current && "version" in current) payload.version = current.version;
    const issues = fieldIssues(input.resource, payload);
    const saved = await tx.aiOperation.upsert({
      where: { workspaceId_key: { workspaceId: id, key: input.key } },
      create: {
        workspaceId: id,
        key: input.key,
        resource: input.resource,
        targetId,
        isNew: !current,
        baseline: baseline ?? undefined,
        baselineHash: current
          ? fingerprint(recordPayload(input.resource, current, access.site))
          : null,
        payload: json(payload),
        facts: json(input.facts),
        issues: json(issues),
        manual: !!options.manual,
      },
      update: {
        payload: json(payload),
        facts: json(input.facts),
        issues: json(issues),
        manual: !!options.manual,
      },
    });
    await tx.aiWorkspace.update({
      where: { id },
      data: {
        revision: { increment: 1 },
        state: options.runId ? "GENERATING" : "DRAFT",
      },
    });
    return { targetId: saved.targetId, key: saved.key, issues };
  });
}
export async function evidenceText(workspace: any) {
  const messages = await db.aiMessage.findMany({
    where: { conversationId: workspace.conversationId, role: "user" },
    select: { body: true },
  });
  return [
    workspace.brief,
    ...messages.map((m) => (m.body as any)?.message || ""),
  ]
    .join("\n")
    .toLowerCase();
}
export function factualIssues(
  op: DraftOperation,
  source: string,
): DraftIssue[] {
  if (op.manual) return [];
  const issues: DraftIssue[] = [];
  const p = op.payload,
    b = op.baseline || {};
  const requireEvidence = (
    field: string,
    value: unknown,
    matchValue = false,
  ) => {
    if (
      JSON.stringify(value) === JSON.stringify(b[field]) ||
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && !value.length)
    )
      return;
    const evidence = (op.facts || []).find(
      (f: any) =>
        f.field === field && source.includes(f.evidence.toLowerCase()),
    );
    const matching =
      !matchValue ||
      (evidence &&
        (String(evidence.evidence).includes(String(value)) ||
          (Number.isFinite(Number(value)) &&
            (String(evidence.evidence).match(/\d+(?:[.,]\d+)?/g) || []).some(
              (n) => Number(n.replace(",", ".")) === Number(value),
            ))));
    if (!evidence || !matching)
      issues.push({
        field,
        message:
          "Confirm this business fact in chat, review the record manually, or confirm it in the publication review.",
        severity: "error",
        code: "FACT_REVIEW_REQUIRED",
      });
  };
  if (op.resource === "items") {
    requireEvidence("price", p.price, true);
    requireEvidence("tagIds", p.tagIds);
    if (
      JSON.stringify(p.variants) !== JSON.stringify(b.variants) &&
      p.variants?.length
    )
      requireEvidence("variants", p.variants);
  }
  if (op.resource === "locations")
    for (const field of [
      "address",
      "city",
      "country",
      "latitude",
      "longitude",
      "hours",
      "exceptions",
    ])
      requireEvidence(field, p[field]);
  if (op.resource === "profile")
    for (const field of [
      "phone",
      "email",
      "website",
      "domain",
      "currency",
      "timeZone",
      "legalName",
    ])
      requireEvidence(field, p[field]);
  if (op.resource === "integrations") requireEvidence("url", p.url);
  return issues;
}
export async function proposalIssues(access: Access, w: any) {
  const source = await evidenceText(w);
  const result: Array<DraftIssue & { key: string }> = [];
  const locales = new Set([
    ...(
      await db.siteLocale.findMany({
        where: { siteId: access.siteId },
        select: { code: true },
      })
    ).map((l) => l.code),
    ...w.operations
      .filter((o: any) => o.resource === "locales")
      .map((o: any) => o.payload.code),
  ]);
  for (const op of w.operations) {
    try {
      checkResource(access, op.resource);
    } catch {
      result.push({
        key: op.key,
        field: "permission",
        message: "Your role cannot apply this content area.",
        severity: "error",
      });
    }
    const list = [
      ...fieldIssues(op.resource, op.payload),
      ...factualIssues(op, source),
    ];
    const rows = Array.isArray(op.payload.translations)
      ? op.payload.translations
      : null;
    if (rows && !rows.some((t: any) => t?.locale === access.site.defaultLocale))
      list.push({
        field: "translations",
        message: "Default-language content is required.",
        severity: "error",
      });
    if (rows?.some((t: any) => !locales.has(t?.locale)))
      list.push({
        field: "translations",
        message: "Add the missing language to this proposal first.",
        severity: "error",
      });
    if (rows)
      for (const locale of w.locales)
        if (!rows.some((t: any) => t?.locale === locale))
          list.push({
            field: "translations",
            message: `Add the requested ${locale} translation.`,
            severity: "error",
          });
    if (op.resource === "navigation")
      for (const [index, item] of (Array.isArray(op.payload.items)
        ? op.payload.items
        : []
      ).entries())
        for (const locale of w.locales)
          if (
            !item.translations?.some(
              (t: any) => t?.locale === locale && t.label,
            )
          )
            list.push({
              field: `items.${index}.translations`,
              message: `Complete the ${locale} navigation label.`,
              severity: "error",
            });
    if (op.resource === "pages") {
      for (const [index, section] of (Array.isArray(op.payload.sections)
        ? op.payload.sections
        : []
      ).entries())
        if (section && !section.hidden)
          for (const locale of w.locales)
            if (
              !Array.isArray(section.translations) ||
              !section.translations.some((t: any) => t?.locale === locale)
            )
              list.push({
                field: `sections.${index}.translations`,
                message: `Complete this section in ${locale}.`,
                severity: "error",
              });
      for (const locale of w.locales)
        if (
          !rows?.some(
            (t: any) =>
              t?.locale === locale &&
              t.title &&
              (op.payload.type === "HOME" || t.slug),
          )
        )
          list.push({
            field: "translations",
            message: `Complete page title and URL in ${locale}.`,
            severity: "error",
          });
      for (const t of rows || [])
        if (!t.seoDescription)
          list.push({
            field: `${t.locale}.seoDescription`,
            message:
              "A meta description will improve sharing and search results.",
            severity: "warning",
          });
    }
    if (op.resource === "items" && !op.payload.imageId)
      list.push({
        field: "imageId",
        message: "Choose a dish photograph for the photo menu.",
        severity: "warning",
      });
    result.push(...list.map((issue) => ({ ...issue, key: op.key })));
  }
  return [...result, ...(await referenceIssues(access, w))];
}

/** Explicit continuation: retain checkpoints and lifetime counters, renew only the active allowance. */
export async function resumeBuilderRun(
  access: Access,
  id: string,
  revision: number,
) {
  if (!process.env.OPENAI_API_KEY)
    throw new AppError(503, "Configure OPENAI_API_KEY to resume generation.");
  return db.$transaction(async (tx) => {
    await lockWorkspace(tx, id);
    const w = await ownedWorkspace(access, id, tx);
    await assertWorkspaceActor(tx, access);
    if (
      w.state === "APPLIED" ||
      w.revision !== revision ||
      w.runs.some((r: any) => activeRunStates.includes(r.state))
    )
      throw new AppError(
        409,
        "The proposal changed or is already running. Refresh before resuming.",
      );
    const run = w.runs[0];
    if (!run || !["FAILED", "CANCELLED"].includes(run.state))
      throw new AppError(
        422,
        "Only a stopped run can be resumed. Answer the agent's questions or send a new instruction instead.",
      );
    await tx.aiRun.update({
      where: { id: run.id },
      data: {
        state: "QUEUED",
        error: null,
        leaseToken: null,
        leaseUntil: null,
        sessionVersion: access.user.sessionVersion,
        budgetStartedCalls: run.calls,
        budgetStartedInputTokens: run.inputTokens,
        budgetStartedOutputTokens: run.outputTokens,
      },
    });
    await tx.aiRequest.update({
      where: { id: run.requestId },
      data: { status: "PENDING", expiresAt: new Date(Date.now() + 86400000) },
    });
    return tx.aiWorkspace.update({
      where: { id },
      data: { state: "GENERATING", revision: { increment: 1 } },
    });
  });
}
