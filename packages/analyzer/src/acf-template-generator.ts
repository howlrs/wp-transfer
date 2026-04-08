import type { AcfFieldInfo, InferredType } from "./schema-analyzer.js";
import { toSafeIdentifier, escapeForStringLiteral } from "./sanitize.js";

// ── Types ──────────────────────────────────────────────────────────

export interface AcfTemplateResult {
  schemaCode: string;   // Zod schema + type export code
  accessorCode: string; // Accessor function code
}

// ── Helpers ────────────────────────────────────────────────────────

function toZodType(inferredType: InferredType): string {
  switch (inferredType) {
    case "string":  return "z.string()";
    case "number":  return "z.coerce.number()";
    case "boolean": return "z.coerce.boolean()";
    case "date":    return "z.coerce.date()";
    case "json":    return "z.unknown()";
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
    (f) => `  ${toSafeIdentifier(f.name)}: ${toZodType(f.inferredType)}, // ${f.fieldKey}`,
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
