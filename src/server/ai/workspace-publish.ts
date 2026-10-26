import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { saveResource, publishPage, type Access } from "@/server/cms";
import { saveSlideRecord, publishSignageRecord } from "@/server/signage";
import { invalidateSite } from "@/server/cache";
import {
  activeRunStates,
  dependencyOrder,
  workspaceSchemas,
  type WorkspaceResource,
} from "@/modules/ai/workspace";
import {
  json,
  lockWorkspace,
  ownedWorkspace,
  getRecord,
  fingerprint,
  recordPayload,
  checkResource,
  assertWorkspaceActor,
} from "./workspace-data";
import { proposalIssues } from "./workspaces";
import { saveWorkspaceSignage } from "./workspace-signage";
import { z } from "zod";
const acceptSchema = z.object({
  revision: z.number().int().min(0),
  key: z.uuid(),
  confirmBusinessFacts: z.boolean().default(false),
});
async function refreshPublishedCache(siteId: string, id: string, receipt: any) {
  try {
    invalidateSite(siteId);
    const refreshed = { ...receipt, cacheRefreshPending: false };
    await db.aiWorkspace.update({
      where: { id },
      data: { receipt: json(refreshed) },
    });
    return refreshed;
  } catch {
    throw new AppError(
      503,
      "Content was published, but cache refresh did not finish. Retry Accept with the same request to refresh; content will not be duplicated.",
    );
  }
}
export async function applyWorkspace(
  access: Access,
  id: string,
  raw: unknown,
  options: { invalidate?: boolean; afterRecord?: (index: number) => void } = {},
) {
  const input = acceptSchema.parse(raw);
  const current = await ownedWorkspace(access, id);
  if (current.state === "APPLIED") {
    if (current.acceptedKey !== input.key)
      throw new AppError(
        409,
        "This proposal was already accepted. See its publication receipt.",
      );
    return options.invalidate !== false
      ? refreshPublishedCache(access.siteId, id, current.receipt)
      : current.receipt;
  }
  if (current.revision !== input.revision)
    throw new AppError(
      409,
      "The proposal changed. Review the current revision.",
    );
  const issues = await proposalIssues(access, current);
  if (
    issues.some(
      (i) =>
        i.severity === "error" &&
        !(input.confirmBusinessFacts && i.code === "FACT_REVIEW_REQUIRED"),
    )
  )
    throw new AppError(
      422,
      "Correct the proposal's highlighted fields and business facts before publishing.",
    );
  if (!current.operations.length)
    throw new AppError(422, "Create some proposed content before publishing.");
  const receipt = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Site" WHERE id=${access.siteId} FOR NO KEY UPDATE`;
      await lockWorkspace(tx, id);
      const w = await ownedWorkspace(access, id, tx);
      if (w.state === "APPLIED") {
        if (w.acceptedKey !== input.key)
          throw new AppError(409, "This proposal is already accepted.");
        return w.receipt;
      }
      if (
        w.revision !== input.revision ||
        w.runs.some((r: any) => activeRunStates.includes(r.state))
      )
        throw new AppError(
          409,
          "Generation or editing changed the proposal. Review it again.",
        );
      const fresh = await assertWorkspaceActor(tx, access);
      for (const op of w.operations) {
        checkResource(fresh, op.resource as WorkspaceResource);
        if (
          ["templates", "banners", "slides"].includes(op.resource) &&
          !w.includeSignage
        )
          throw new AppError(422, "Signage was not included in this proposal.");
        const record = await getRecord(
          access.siteId,
          op.resource as WorkspaceResource,
          op.targetId,
          tx,
        );
        if (
          op.isNew
            ? !!record
            : !record ||
              fingerprint(
                recordPayload(
                  op.resource as WorkspaceResource,
                  record,
                  fresh.site,
                ),
              ) !== op.baselineHash
        )
          throw new AppError(
            409,
            `“${op.key}” changed in the CMS. Rebase and review this record before publishing.`,
          );
      }
      let ordered;
      try {
        ordered = dependencyOrder(w.operations);
      } catch (e) {
        throw new AppError(422, (e as Error).message);
      }
      const records: Array<{ resource: string; id: string; key: string }> = [];
      // Create page shells first: a new CTA may target its own page while the page references the CTA.
      for (const op of ordered.filter(
        (o) => o.resource === "pages" && o.isNew,
      )) {
        const p = workspaceSchemas.pages.parse(op.payload);
        if (
          p.type !== "CUSTOM" &&
          (await tx.page.count({
            where: { siteId: access.siteId, type: p.type },
          }))
        )
          throw new AppError(
            409,
            "Reuse the existing system page instead of creating a duplicate.",
          );
        await tx.page.create({
          data: {
            id: op.targetId,
            siteId: access.siteId,
            type: p.type,
            internalName: p.internalName,
          },
        });
      }
      // Pages with sections are saved after all reusable content. Navigation is saved last.
      const sequence = [
        ...ordered.filter(
          (o) => !["pages", "navigation", "slides"].includes(o.resource),
        ),
        ...ordered.filter((o) => o.resource === "pages"),
        ...ordered.filter((o) => o.resource === "navigation"),
        ...ordered.filter((o) => o.resource === "slides"),
      ];
      for (const [index, op] of sequence.entries()) {
        const resource = op.resource as WorkspaceResource;
        const p: any = workspaceSchemas[resource].parse(op.payload);
        const record = await getRecord(
          access.siteId,
          resource,
          op.targetId,
          tx,
        );
        if (record && "version" in record) p.version = record.version;
        fresh.site = await tx.site.findUniqueOrThrow({
          where: { id: access.siteId },
        });
        if (resource === "items") p.status = "PUBLISHED";
        if (resource === "locales") p.isDefault = false;
        if (resource === "media") {
          await tx.mediaAsset.update({
            where: { id: op.targetId, siteId: access.siteId, archived: false },
            data: { alt: p.alt, caption: p.caption },
          });
        } else if (resource === "templates" || resource === "banners") {
          await saveWorkspaceSignage(
            tx,
            fresh,
            resource,
            op.targetId,
            op.isNew,
            p,
          );
        } else if (resource === "slides") {
          await saveSlideRecord(fresh, p, record ? op.targetId : undefined, {
            tx,
            createId: op.targetId,
          });
        } else {
          await saveResource(
            fresh,
            resource,
            p,
            record ? op.targetId : undefined,
            { tx, createId: op.targetId },
          );
        }
        await tx.auditLog.create({
          data: {
            siteId: access.siteId,
            actorId: access.user.id,
            action: "ai.batch.record",
            targetType: resource,
            targetId: op.targetId,
            before: op.baseline ?? undefined,
            after: json({ workspaceId: id, key: op.key, fields: p }),
          },
        });
        records.push({ resource, id: op.targetId, key: op.key });
        options.afterRecord?.(index);
      }
      for (const op of sequence.filter((o) => o.resource === "pages"))
        for (const locale of w.locales) {
          const page = await tx.page.findUniqueOrThrow({
            where: { id: op.targetId },
          });
          await publishPage(
            fresh,
            op.targetId,
            { version: page.version, locale, operation: "publish" },
            { tx },
          );
        }
      for (const op of sequence.filter(
        (o) => o.resource === "locales" && (o.payload as any).isDefault,
      )) {
        fresh.site = await tx.site.findUniqueOrThrow({
          where: { id: access.siteId },
        });
        const record = await getRecord(
          access.siteId,
          "locales",
          op.targetId,
          tx,
        );
        await saveResource(
          fresh,
          "locales",
          { ...(op.payload as any), version: record.version },
          op.targetId,
          { tx },
        );
      }
      for (const kind of ["banners", "slides"] as const)
        for (const op of sequence.filter((o) => o.resource === kind)) {
          const record = await getRecord(access.siteId, kind, op.targetId, tx);
          await publishSignageRecord(
            fresh,
            kind,
            op.targetId,
            { version: record.version, operation: "publish" },
            { tx },
          );
        }
      await tx.site.update({
        where: { id: access.siteId },
        data: { version: { increment: 1 } },
      });
      const result = {
        workspaceId: id,
        revision: w.revision,
        publishedAt: new Date().toISOString(),
        cacheRefreshPending: true,
        businessFactsConfirmed: input.confirmBusinessFacts,
        records,
      };
      await tx.aiWorkspace.update({
        where: { id },
        data: {
          state: "APPLIED",
          acceptedKey: input.key,
          receipt: json(result),
        },
      });
      await tx.auditLog.create({
        data: {
          siteId: access.siteId,
          actorId: access.user.id,
          action: "ai.batch.publish",
          targetType: "AiWorkspace",
          targetId: id,
          after: json(result),
        },
      });
      return json(result);
    },
    { timeout: 90000, maxWait: 10000 },
  );
  return options.invalidate !== false
    ? refreshPublishedCache(access.siteId, id, receipt)
    : receipt;
}
