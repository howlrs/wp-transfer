import type { AcfFieldInfo, InferredType } from "./schema-analyzer.js";
import { toSafeIdentifier, escapeForStringLiteral } from "./sanitize.js";

// ── Types ──────────────────────────────────────────────────────────

export interface AcfTemplateResult {
  schemaCode: string;   // Zod schema + type export code
  accessorCode: string; // Accessor function code
}

// ── Helpers ────────────────────────────────────────────────────────

function inferJsonZodType(sampleValues: string[]): string {
  for (const raw of sampleValues) {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { continue; }

    if (!Array.isArray(parsed)) continue;
    if (parsed.length === 0) continue;

    // String array → Gallery
    if (parsed.every((item) => typeof item === "string")) {
      return "z.array(z.string())";
    }

    // Object array → Repeater (infer keys from first element)
    if (parsed.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))) {
      const first = parsed[0] as Record<string, unknown>;
      const fields = Object.keys(first).map((key) => {
        const val = first[key];
        const type = typeof val === "number" ? "z.number()" :
                     typeof val === "boolean" ? "z.boolean()" : "z.string()";
        return `${key}: ${type}`;
      });
      return `z.array(z.object({ ${fields.join(", ")} })) /* TODO: Verify inferred schema — auto-detected from sample data */`;
    }

    break;
  }

  return "z.unknown()";
}

function toZodType(inferredType: InferredType, sampleValues: string[]): string {
  switch (inferredType) {
    case "string":  return "z.string()";
    case "number":  return "z.coerce.number()";
    case "boolean": return "z.coerce.boolean()";
    case "date":    return "z.coerce.date()";
    case "json":    return inferJsonZodType(sampleValues);
    case "unknown": return "z.unknown()";
  }
}

// ── Main ───────────────────────────────────────────────────────────

export function generateAcfTemplate(fields: AcfFieldInfo[]): AcfTemplateResult {
  if (fields.length === 0) {
    return {
      schemaCode:   "// No ACF fields detected — schema is empty.",
      accessorCode: "// No ACF fields detected — accessor is empty.",
    };
  }

  // ── schemaCode ──────────────────────────────────────────────────

  const schemaFieldLines = fields.map(
    (f) => `  ${toSafeIdentifier(f.name)}: ${toZodType(f.inferredType, f.sampleValues)}, // ${f.fieldKey}`,
  );

  const schemaCode = [
    'import { z } from "zod";',
    "",
    "export const AcfFieldsSchema = z.object({",
    ...schemaFieldLines,
    "});",
    "",
    "export type AcfFields = z.infer<typeof AcfFieldsSchema>;",
  ].join("\n");

  // ── accessorCode ────────────────────────────────────────────────

  const keyMappingComment = fields
    .map((f) => ` *   ${toSafeIdentifier(f.name)} → ${f.fieldKey}`)
    .join("\n");

  const rawAssignments = fields.map(
    (f) => `  raw.${toSafeIdentifier(f.name)} = meta["${escapeForStringLiteral(f.name)}"];`,
  );

  const accessorCode = [
    'import { AcfFieldsSchema, type AcfFields } from "./acf-schema";',
    "",
    "/**",
    " * Extract and validate ACF custom fields from post meta.",
    " * Field key mapping:",
    keyMappingComment,
    " */",
    "export function getAcfFields(meta: Record<string, unknown>): AcfFields {",
    "  const raw: Record<string, unknown> = {};",
    ...rawAssignments,
    "  return AcfFieldsSchema.parse(raw);",
    "}",
  ].join("\n");

  return { schemaCode, accessorCode };
}
