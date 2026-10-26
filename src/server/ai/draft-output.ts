import {
  type AiBody,
  type AiChange,
  type AiScope,
} from "@/modules/ai/contracts";
import { validateChanges, validateReferences } from "@/modules/ai/scopes";
import type { DynamicField } from "@/modules/signage";
import { sanitizeLegacyHtml } from "@/server/content";
import { jsonrepair } from "jsonrepair";

/** Publishing validity is advisory here. Ownership, safe content and editable structure remain enforced. */
export function prepareDraftChanges(input: {
  scope: AiScope;
  draft: Record<string, any>;
  raw: Array<{ field: string; valueJson: string }>;
  locales: string[];
  fields: DynamicField[];
  allowedFields: string[];
  references: Record<string, string[]>;
  translationOnly: boolean;
}) {
  const changes: AiChange[] = [];
  const warnings: NonNullable<AiBody["warnings"]> = [];
  const unapplied: NonNullable<AiBody["unapplied"]> = [];
  for (const rawChange of input.raw) {
    try {
      if (!input.allowedFields.includes(rawChange.field))
        throw new Error("This field is outside the current editor's scope.");
      if (changes.some((change) => change.field === rawChange.field))
        throw new Error("Duplicate generated field.");
      const fieldDefinition = input.fields.find(
        (f) => f.key === rawChange.field,
      );
      let candidate = rawChange;
      let repaired = false;
      const decode = (text: string) => {
        try {
          return JSON.parse(text);
        } catch (error) {
          if (!/^\s*(?:[\[{]|```)/.test(text)) throw error;
          const result = JSON.parse(jsonrepair(text));
          repaired = true;
          return result;
        }
      };
      // Some responses contain plain text instead of a JSON-quoted string. Keep that text editable.
      try {
        const parsed = decode(candidate.valueJson);
        candidate = { ...candidate, valueJson: JSON.stringify(parsed) };
      } catch {
        candidate = {
          ...candidate,
          valueJson: JSON.stringify(candidate.valueJson),
        };
      }
      // Recover common model envelope mistakes without dropping its writing.
      let decoded = JSON.parse(candidate.valueJson);
      if (typeof decoded === "string" && /^[\s]*[\[{]/.test(decoded)) {
        try {
          decoded = decode(decoded);
        } catch {
          /* ordinary text remains editable */
        }
      }
      if (
        decoded &&
        !Array.isArray(decoded) &&
        typeof decoded === "object" &&
        Object.hasOwn(decoded, rawChange.field)
      )
        decoded = decoded[rawChange.field];
      if (
        rawChange.field === "sections" &&
        decoded &&
        !Array.isArray(decoded) &&
        typeof decoded === "object" &&
        typeof decoded.type === "string"
      )
        decoded = [decoded];
      candidate = { ...candidate, valueJson: JSON.stringify(decoded) };
      if (fieldDefinition) {
        const value = JSON.parse(candidate.valueJson);
        if (fieldDefinition.isArray && !Array.isArray(value))
          throw new Error(
            "This banner field needs a list; its generated text is available below.",
          );
        if (
          !fieldDefinition.isArray &&
          fieldDefinition.type === "NUMBER" &&
          typeof value !== "number"
        )
          throw new Error(
            "This number control cannot display the generated text; copy and correct it below.",
          );
        if (
          !fieldDefinition.isArray &&
          ["TEXT", "RICHTEXT", "COLOR", "SELECT"].includes(
            fieldDefinition.type,
          ) &&
          typeof value !== "string"
        )
          throw new Error("This banner field needs text.");
      }
      if (fieldDefinition?.type === "RICHTEXT" && !fieldDefinition.isArray)
        candidate = {
          ...candidate,
          valueJson: JSON.stringify(
            sanitizeLegacyHtml(JSON.parse(candidate.valueJson)),
          ),
        };
      const fieldWarnings: typeof warnings = [];
      const result = validateChanges(
        input.scope,
        input.draft,
        [candidate],
        input.locales,
        input.fields,
        fieldWarnings,
      );
      validateReferences(result, input.references);
      if (input.translationOnly && rawChange.field === "sections") {
        const structure = (sections: any[]) =>
          (sections ?? []).map((s) => ({
            id: s.id,
            type: s.type,
            hidden: s.hidden ?? false,
            config: s.config,
          }));
        if (
          JSON.stringify(structure(result[0].value as any[])) !==
          JSON.stringify(structure(input.draft.sections))
        )
          throw new Error("Translation editing cannot change page structure.");
      }
      changes.push(...result);
      warnings.push(...fieldWarnings);
      if (repaired)
        warnings.push({
          field: rawChange.field,
          message:
            "Recovered malformed generated formatting. Review this draft for completeness before saving.",
        });
    } catch (error) {
      let text = rawChange.valueJson;
      try {
        const value = JSON.parse(text);
        text =
          typeof value === "string" ? value : JSON.stringify(value, null, 2);
      } catch {
        /* preserve raw text */
      }
      unapplied.push({
        field: rawChange.field,
        text,
        reason:
          error instanceof Error
            ? error.message
            : "This value could not be placed in this editor.",
      });
    }
  }
  return { changes, warnings, unapplied };
}
