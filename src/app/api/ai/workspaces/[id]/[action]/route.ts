import { z } from "zod";
import { claimBuilderRun, processBuilderRun } from "@/server/ai/worker";
import { db } from "@/server/db";
import { requireAccess } from "@/server/access";
import { endpoint, AppError } from "@/server/errors";
import {
  ownedWorkspace,
  queueRun,
  cancelRun,
  resumeBuilderRun,
  stageOperation,
} from "@/server/ai/workspaces";
import { applyWorkspace } from "@/server/ai/workspace-publish";
import {
  lockWorkspace,
  getRecord,
  recordPayload,
  fingerprint,
  json,
  assertWorkspaceActor,
} from "@/server/ai/workspace-data";
import {
  activeRunStates,
  type WorkspaceResource,
} from "@/modules/ai/workspace";
export const runtime = "nodejs";
export const maxDuration = 300;
export const POST = endpoint(
  async (
    request: Request,
    context: { params: Promise<{ id: string; action: string }> },
  ) => {
    const a = await requireAccess("content", request);
    const { id, action } = await context.params;
    if (action === "step") {
      // Authorization precedes claiming; HTTP callers can only advance their own proposal.
      await ownedWorkspace(a, id);
      const run = await claimBuilderRun(id);
      if (run) await processBuilderRun(run);
      return Response.json({ processed: !!run }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const text = await request.text();
    if (text.length > 350000)
      throw new AppError(413, "This proposal edit is too large.");
    const raw = JSON.parse(text);
    if (action === "message") return Response.json(await queueRun(a, id, raw));
    if (action === "stage")
      return Response.json(
        await stageOperation(a, id, raw, {
          manual: true,
          revision: z.number().int().parse(raw.revision),
        }),
      );
    if (action === "accept")
      return Response.json(await applyWorkspace(a, id, raw));
    const input = z
      .object({
        revision: z.number().int().min(0),
        key: z.string().max(100).optional(),
      })
      .parse(raw);
    if (action === "cancel")
      return Response.json(await cancelRun(a, id, input.revision));
    if (action === "resume")
      return Response.json(await resumeBuilderRun(a, id, input.revision));
    if (!["unlock", "remove", "rebase"].includes(action))
      throw new AppError(404, "Unknown proposal action.");
    return Response.json(
      await db.$transaction(async (tx) => {
        await lockWorkspace(tx, id);
        const w = await ownedWorkspace(a, id, tx);
        await assertWorkspaceActor(tx, a);
        if (
          w.state === "APPLIED" ||
          w.revision !== input.revision ||
          w.runs.some((r: any) => activeRunStates.includes(r.state))
        )
          throw new AppError(
            409,
            "The proposal changed or is still running. Refresh or cancel it first.",
          );
        const op = w.operations.find((o: any) => o.key === input.key);
        if (!op) throw new AppError(404, "Proposed record not found.");
        if (action === "remove")
          await tx.aiOperation.delete({ where: { id: op.id } });
        else if (action === "unlock")
          await tx.aiOperation.update({
            where: { id: op.id },
            data: { manual: false },
          });
        else {
          const current = await getRecord(
            a.siteId,
            op.resource as WorkspaceResource,
            op.targetId,
            tx,
          );
          if (!current)
            throw new AppError(
              409,
              "This record was deleted. Remove it from the proposal and recreate it if needed.",
            );
          const baseline = recordPayload(
            op.resource as WorkspaceResource,
            current,
            a.site,
          );
          await tx.aiOperation.update({
            where: { id: op.id },
            data: {
              baseline: json(baseline),
              baselineHash: fingerprint(baseline),
              manual: true,
            },
          });
        }
        return tx.aiWorkspace.update({
          where: { id },
          data: {
            revision: { increment: 1 },
            state: "DRAFT",
          },
        });
      }),
    );
  },
);
