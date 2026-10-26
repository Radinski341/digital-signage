import { z } from "zod";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import type { Access } from "@/server/cms";
import {
  workspaceResources,
  workspaceSchemas,
  workspaceResourceSchema,
} from "@/modules/ai/workspace";
import {
  sectionDefinitions,
  sectionContentSchema,
} from "@/modules/sections/schema";
import { dictionaryDefaults } from "@/modules/localization";
import { schemaDescription } from "./model";
import {
  checkResource,
  getRecord,
  recordPayload,
  recordInclude,
  workspaceModels,
  ownedWorkspace,
} from "./workspace-data";
import { stageOperation, proposalIssues } from "./workspaces";
const functionTool = (
  name: string,
  description: string,
  properties: any,
  required: string[] = [],
) => ({
  type: "function" as const,
  name,
  description,
  parameters: {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  },
  strict: false,
});
export function builderTools(access: Access, includeSignage: boolean) {
  const resources = workspaceResources.filter((r) => {
    try {
      checkResource(access, r);
      return includeSignage || !["templates", "banners", "slides"].includes(r);
    } catch {
      return false;
    }
  });
  const resource = { type: "string", enum: resources };
  return [
    functionTool(
      "read_records",
      "List site records with stable IDs and labels. Paginate with after; use read_record for full editable values.",
      { resource, after: { type: ["string", "null"] } },
      ["resource"],
    ),
    functionTool(
      "read_record",
      "Read full editable values and current validation issues for one existing site record.",
      { resource, id: { type: "string" } },
      ["resource", "id"],
    ),
    functionTool(
      "get_schema",
      "Read the actual CMS form rules, section registry and examples before staging this resource.",
      { resource },
      ["resource"],
    ),
    functionTool(
      "read_proposal",
      "Read staged records and manual edit protection, ten at a time. Paginate with after.",
      { after: { type: ["string", "null"] } },
      [],
    ),
    functionTool(
      "validate_proposal",
      "Check the entire proposal. Issues are paginated; fix errors or ask for missing facts.",
      { offset: { type: "integer", minimum: 0 } },
      [],
    ),
    functionTool(
      "inspect_media",
      "Inspect up to four site-owned photo thumbnails visually to choose appropriate images. Never infer ingredients or allergens from photographs.",
      { ids: { type: "array", items: { type: "string" }, maxItems: 4 } },
      ["ids"],
    ),
    functionTool(
      "read_knowledge",
      "Read earlier employee-supplied restaurant knowledge and answers. Paginate with after when the recent chat does not contain a fact.",
      { after: { type: ["string", "null"] } },
      [],
    ),
    ...resources.map((r) =>
      functionTool(
        `stage_${r}`,
        `Propose up to 20 ${r} records together. Does not change live content. Reuse keys and returned targetIds for revisions and links. Get the schema first. Quote employee-provided evidence for facts.`,
        {
          records: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: {
              type: "object",
              properties: {
                key: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,100}$" },
                recordId: { type: ["string", "null"] },
                payload: schemaDescription(workspaceSchemas[r]),
                facts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field: { type: "string" },
                      evidence: { type: "string" },
                    },
                    required: ["field", "evidence"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["key", "payload"],
              additionalProperties: false,
            },
          },
        },
        ["records"],
      ),
    ),
  ];
}
export async function initialBuilderContext(access: Access, w: any) {
  const [profile, locales, counts] = await Promise.all([
    db.restaurantProfile.findUnique({
      where: { siteId: access.siteId },
      select: { phone: true, email: true, cuisines: true, translations: true },
    }),
    db.siteLocale.findMany({
      where: { siteId: access.siteId },
      select: { code: true, label: true, enabled: true },
    }),
    Promise.all(
      workspaceResources.map(async (resource) => [
        resource,
        await (db[workspaceModels[resource]] as any).count({
          where: { siteId: access.siteId },
        }),
      ]),
    ),
  ]);
  return {
    restaurant: {
      name: access.site.name,
      currency: access.site.currency,
      timeZone: access.site.timeZone,
      domain: access.site.domain,
      defaultLocale: access.site.defaultLocale,
      profile,
    },
    locales,
    requestedLocales: w.locales,
    includeSignage: w.includeSignage,
    counts: Object.fromEntries(counts),
    brief: w.brief,
  };
}
export async function executeBuilderTool(
  access: Access,
  w: any,
  run: any,
  name: string,
  args: any,
) {
  if (name.startsWith("stage_")) {
    const resource = workspaceResourceSchema.parse(name.slice(6));
    const rows = z
      .array(z.unknown())
      .min(1)
      .max(20)
      .parse(args.records || [args]);
    const results = [];
    for (const row of rows) {
      try {
        results.push(
          await stageOperation(
            access,
            w.id,
            { ...(row as any), resource },
            { runId: run.id, leaseToken: run.leaseToken },
          ),
        );
      } catch (e) {
        results.push({
          key: (row as any)?.key,
          error:
            e instanceof AppError
              ? e.message
              : e instanceof z.ZodError
                ? e.issues.map((i) => ({
                    field: i.path.join("."),
                    message: i.message,
                  }))
                : "Check this record's schema.",
        });
      }
    }
    return { results };
  }
  if (name === "read_knowledge") {
    const rows = await db.aiMessage.findMany({
      where: {
        conversationId: w.conversationId,
        role: "user",
        ...(args.after
          ? { id: { gt: z.string().max(100).parse(args.after) } }
          : {}),
      },
      orderBy: { id: "asc" },
      take: 11,
      select: { id: true, body: true },
    });
    return {
      rows: rows.slice(0, 10),
      nextCursor: rows.length > 10 ? rows[9].id : null,
    };
  }
  if (name === "read_records") {
    const resource = workspaceResourceSchema.parse(args.resource);
    checkResource(access, resource);
    const rows = await (db[workspaceModels[resource]] as any).findMany({
      where: {
        siteId: access.siteId,
        ...(args.after
          ? { id: { gt: z.string().max(100).parse(args.after) } }
          : {}),
      },
      include: recordInclude(resource),
      orderBy: { id: "asc" },
      take: 31,
    });
    return {
      rows: rows.slice(0, 30).map((r: any) => ({
        id: r.id,
        name: r.internalName || r.name || r.label || r.alt || r.key || r.code,
        translations: r.translations?.map((t: any) => ({
          locale: t.locale,
          name: t.name,
          title: t.title,
          label: t.label,
        })),
        price: r.price ? String(r.price) : undefined,
        status: r.status,
        type: r.type,
        code: r.code,
        categoryId: r.categoryId,
        thumbnailUrl:
          resource === "media" ? r.thumbnailUrl || r.url : undefined,
        caption: r.caption,
      })),
      nextCursor: rows.length > 30 ? rows[29].id : null,
    };
  }
  if (name === "read_record") {
    const resource = workspaceResourceSchema.parse(args.resource);
    checkResource(access, resource);
    const record = await getRecord(
      access.siteId,
      resource,
      z.string().max(100).parse(args.id),
    );
    if (!record) throw new AppError(404, "Content not found.");
    return {
      id: record.id,
      payload: recordPayload(resource, record, access.site),
    };
  }
  if (name === "get_schema") {
    const resource = workspaceResourceSchema.parse(args.resource);
    checkResource(access, resource);
    return {
      schema: schemaDescription(workspaceSchemas[resource]),
      ...(resource === "pages"
        ? {
            sections: Object.fromEntries(
              Object.entries(sectionDefinitions).map(([key, def]) => [
                key,
                schemaDescription(def.schema),
              ]),
            ),
            sectionContent: schemaDescription(sectionContentSchema),
            example: {
              type: "RICH_TEXT",
              hidden: false,
              config: { width: "normal" },
              translations: [
                {
                  locale: access.site.defaultLocale,
                  content: {
                    heading: "Our kitchen",
                    subtitle: "",
                    caption: "",
                    alt: "",
                    body: {
                      type: "doc",
                      content: [
                        {
                          type: "paragraph",
                          content: [
                            {
                              type: "text",
                              text: "Write a factual introduction.",
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              ],
            },
          }
        : {}),
      ...(resource === "locales" ? { dictionary: dictionaryDefaults } : {}),
    };
  }
  if (name === "read_proposal" || name === "validate_proposal") {
    const current = await ownedWorkspace(access, w.id);
    const issues = await proposalIssues(access, current);
    if (name === "validate_proposal") {
      const offset = z
        .number()
        .int()
        .min(0)
        .parse(args.offset || 0);
      return {
        revision: current.revision,
        totalIssues: issues.length,
        errorCount: issues.filter((i) => i.severity === "error").length,
        issues: issues.slice(offset, offset + 100),
        nextOffset: issues.length > offset + 100 ? offset + 100 : null,
      };
    }
    const start = args.after
      ? current.operations.findIndex((op: any) => op.key === args.after) + 1
      : 0;
    const rows = current.operations.slice(start, start + 10);
    return {
      revision: current.revision,
      operations: rows.map((op: any) => ({
        key: op.key,
        resource: op.resource,
        targetId: op.targetId,
        manual: op.manual,
        payload: op.payload,
        facts: op.facts,
      })),
      issues: issues.filter((i) => rows.some((op: any) => op.key === i.key)),
      nextCursor:
        current.operations.length > start + 10 ? rows.at(-1)?.key : null,
    };
  }
  if (name === "inspect_media") {
    const ids = z.array(z.string().max(100)).min(1).max(4).parse(args.ids);
    const media = await db.mediaAsset.findMany({
      where: { siteId: access.siteId, archived: false, id: { in: ids } },
    });
    if (media.length !== new Set(ids).size)
      throw new AppError(422, "Choose photographs belonging to this site.");
    // Only the configured CDN is eligible for model-side fetching, never arbitrary record URLs.
    const base = process.env.MEDIA_PUBLIC_BASE_URL;
    return {
      media: media.map((m) => ({
        id: m.id,
        alt: m.alt,
        caption: m.caption,
        url:
          base &&
          (m.thumbnailUrl || m.url).startsWith(base.replace(/\/$/, "") + "/")
            ? m.thumbnailUrl || m.url
            : null,
      })),
    };
  }
  throw new AppError(422, "Unknown content tool.");
}
