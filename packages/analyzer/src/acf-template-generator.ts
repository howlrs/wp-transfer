import type { AcfFieldInfo, InferredType } from "./schema-analyzer.js";
import type { AcfFieldDefinition, AcfFieldGroup } from "./acf-field-extractor.js";
import { toSafeIdentifier, escapeForStringLiteral } from "./sanitize.js";

// ── Types ──────────────────────────────────────────────────────────

export interface AcfTemplateResult {
  schemaCode: string;   // Zod schema + type export code
  accessorCode: string; // Accessor function code
}

// ── Data-inference helpers (original path) ────────────────────────

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

// ── Definition-based helpers (ACF Pro path) ───────────────────────

/** Map an ACF field type string to a Zod type expression. */
function acfTypeToZod(field: AcfFieldDefinition): string {
  switch (field.type) {
    case "text":
    case "textarea":
    case "wysiwyg":
    case "email":
    case "url":
    case "password":
    case "color_picker":
    case "oembed":
      return "z.string()";

    case "number":
    case "range":
      return "z.coerce.number()";

    case "true_false":
      return "z.coerce.boolean()";

    case "date_picker":
    case "date_time_picker":
    case "time_picker":
      return "z.string()";

    case "image":
    case "file":
    case "post_object":
    case "page_link":
      return "z.number()"; // attachment / post ID

    case "relationship":
      return "z.array(z.number())"; // array of post IDs

    case "gallery":
      return "z.array(z.number())"; // array of attachment IDs

    case "select":
    case "radio":
    case "button_group":
      return "z.string()";

    case "checkbox":
      return "z.array(z.string())";

    case "taxonomy":
      return "z.union([z.number(), z.array(z.number())])";

    case "link":
      return "z.object({ title: z.string(), url: z.string(), target: z.string() })";

    case "google_map":
      return "z.object({ address: z.string(), lat: z.number(), lng: z.number() })";

    case "repeater":
      return buildRepeaterZod(field);

    case "group":
      return buildGroupZod(field);

    case "flexible_content":
      return buildFlexibleContentZod(field);

    case "clone":
      // Clone references are resolved at a higher level; fallback to any
      return "z.any() /* clone — resolve manually */";

    default:
      return "z.unknown()";
  }
}

function buildGroupZod(field: AcfFieldDefinition): string {
  if (!field.subFields || field.subFields.length === 0) {
    return "z.object({})";
  }
  const inner = field.subFields
    .map((sf) => `${toSafeIdentifier(sf.name)}: ${acfTypeToZod(sf)}`)
    .join(", ");
  return `z.object({ ${inner} })`;
}

function buildRepeaterZod(field: AcfFieldDefinition): string {
  if (!field.subFields || field.subFields.length === 0) {
    return "z.array(z.any()) /* repeater — sub-fields unknown or nested too deep */";
  }
  const inner = field.subFields
    .map((sf) => `${toSafeIdentifier(sf.name)}: ${acfTypeToZod(sf)}`)
    .join(", ");
  return `z.array(z.object({ ${inner} }))`;
}

function buildFlexibleContentZod(field: AcfFieldDefinition): string {
  if (!field.layouts || field.layouts.length === 0) {
    return "z.array(z.any()) /* flexible_content — no layouts found */";
  }
  const variants = field.layouts.map((layout) => {
    const layoutFields = layout.subFields
      .map((sf) => `${toSafeIdentifier(sf.name)}: ${acfTypeToZod(sf)}`)
      .join(", ");
    const sep = layoutFields ? ", " : "";
    return `z.object({ acf_fc_layout: z.literal("${escapeForStringLiteral(layout.name)}")${sep}${layoutFields} })`;
  });
  return `z.discriminatedUnion("acf_fc_layout", [${variants.join(", ")}])`;
}

// ── Schema generation from field definitions ──────────────────────

function generateFromDefinitions(groups: AcfFieldGroup[]): AcfTemplateResult {
  const allFields = groups.flatMap((g) => g.fields);
  if (allFields.length === 0) {
    return {
      schemaCode:   "// No ACF fields detected — schema is empty.",
      accessorCode: "// No ACF fields detected — accessor is empty.",
    };
  }

  const schemaFieldLines = allFields.map(
    (f) => `  ${toSafeIdentifier(f.name)}: ${acfTypeToZod(f)}, // ${f.key}`,
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

  const keyMappingComment = allFields
    .map((f) => ` *   ${toSafeIdentifier(f.name)} → ${f.key}`)
    .join("\n");

  const rawAssignments = allFields.map(
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

// ── Main ───────────────────────────────────────────────────────────

/**
 * Generate ACF Zod schema + accessor code.
 *
 * When `fieldGroups` are provided (extracted from WXR field definitions),
 * uses accurate type information from ACF Pro field definitions.
 * Otherwise falls back to data-inference from sample meta values.
 */
export function generateAcfTemplate(
  fields: AcfFieldInfo[],
  fieldGroups?: AcfFieldGroup[],
): AcfTemplateResult {
  // Prefer definition-based generation when field groups are available
  if (fieldGroups && fieldGroups.length > 0) {
    return generateFromDefinitions(fieldGroups);
  }

  // Fall back to data-inference
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
