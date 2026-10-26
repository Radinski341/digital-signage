import { allowanceUsage, builderLimits } from "@/server/ai/budget";
import { requireAccess } from "@/server/access";
import { endpoint } from "@/server/errors";
import { db } from "@/server/db";
import { ownedWorkspace, proposalIssues } from "@/server/ai/workspaces";
import {
  projectWorkspace,
  proposalPagePath,
} from "@/server/ai/workspace-preview";
import {
  fingerprint,
  getRecord,
  recordPayload,
} from "@/server/ai/workspace-data";
import type { WorkspaceResource } from "@/modules/ai/workspace";
export const dynamic = "force-dynamic";
export const GET = endpoint(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const a = await requireAccess();
    const { id } = await context.params;
    const w = await ownedWorkspace(a, id);
    const projected = await projectWorkspace(a, id);
    const messages = await db.aiMessage.findMany({
      where: { conversationId: w.conversationId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const conflicts = [];
    for (const op of w.state === "APPLIED"
      ? []
      : w.operations.filter((o: any) => !o.isNew)) {
      const current = await getRecord(
        a.siteId,
        op.resource as WorkspaceResource,
        op.targetId,
      );
      if (
        !current ||
        fingerprint(
          recordPayload(op.resource as WorkspaceResource, current, a.site),
        ) !== op.baselineHash
      )
        conflicts.push({
          key: op.key,
          current: current
            ? recordPayload(op.resource as WorkspaceResource, current, a.site)
            : null,
        });
    }
    const run = w.runs[0];
    return Response.json(
      {
        workspace: { ...w, runs: undefined, operations: w.operations },
        run: run
          ? {
              id: run.id,
              state: run.state,
              calls: run.calls,
              inputTokens: run.inputTokens,
              outputTokens: run.outputTokens,
              error: run.error,
              budget: { limits: builderLimits(), used: allowanceUsage(run) },
              heartbeatAt: run.heartbeatAt,
              createdAt: run.createdAt,
            }
          : null,
        messages: messages.reverse(),
        issues: w.state === "APPLIED" ? [] : await proposalIssues(a, w),
        conflicts,
        previewPages: projected.pages.map((p) => ({
          id: p.id,
          title: p.internalName,
          translations: p.translations.map((t: any) => ({
            locale: t.locale,
            title: t.title,
            url: proposalPagePath(projected.site, p, t.locale),
            seoTitle: t.seoTitle,
            seoDescription: t.seoDescription,
            canonicalUrl: t.canonicalUrl,
            ogTitle: t.ogTitle,
            ogDescription: t.ogDescription,
            noIndex: t.noIndex,
          })),
        })),
        context: {
          site: projected.site,
          role: a.role,
          ...Object.fromEntries(
            [
              "locales",
              "media",
              "categories",
              "items",
              "pages",
              "actions",
              "integrations",
              "tags",
              "locations",
              "templates",
              "banners",
              "slides",
            ].map((key) => [key, projected.site[key] || []]),
          ),
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
);
