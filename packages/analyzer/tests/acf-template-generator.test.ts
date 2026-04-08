import { describe, it, expect } from "vitest";
import { generateAcfTemplate } from "../src/acf-template-generator.js";
import type { AcfFieldInfo } from "../src/schema-analyzer.js";

// ── Helpers ──

function makeField(overrides: Partial<AcfFieldInfo>): AcfFieldInfo {
  return {
    name: "my_field",
    fieldKey: "field_abc123",
    inferredType: "string",
    sampleValues: ["hello"],
    ...overrides,
  };
}

// ── Tests ──

describe("generateAcfTemplate", () => {
  it("generates Zod schema from ACF fields (number, string, boolean)", () => {
    const fields: AcfFieldInfo[] = [
      makeField({ name: "price", fieldKey: "field_001", inferredType: "number" }),
      makeField({ name: "title", fieldKey: "field_002", inferredType: "string" }),
      makeField({ name: "is_active", fieldKey: "field_003", inferredType: "boolean" }),
    ];

    const { schemaCode } = generateAcfTemplate(fields);

    expect(schemaCode).toContain('import { z } from "zod"');
    expect(schemaCode).toContain("export const AcfFieldsSchema = z.object({");
    expect(schemaCode).toContain("price: z.coerce.number()");
    expect(schemaCode).toContain("title: z.string()");
    expect(schemaCode).toContain("is_active: z.coerce.boolean()");
    expect(schemaCode).toContain("export type AcfFields = z.infer<typeof AcfFieldsSchema>");
  });

  it("maps date type to z.coerce.date()", () => {
    const fields: AcfFieldInfo[] = [
      makeField({ name: "published_at", fieldKey: "field_date1", inferredType: "date" }),
    ];

    const { schemaCode } = generateAcfTemplate(fields);

    expect(schemaCode).toContain("published_at: z.coerce.date()");
  });

  it("maps json type to z.unknown()", () => {
    const fields: AcfFieldInfo[] = [
      makeField({ name: "config_data", fieldKey: "field_json1", inferredType: "json" }),
    ];

    const { schemaCode } = generateAcfTemplate(fields);

    expect(schemaCode).toContain("config_data: z.unknown()");
  });

  it("maps unknown type to z.unknown()", () => {
    const fields: AcfFieldInfo[] = [
      makeField({ name: "mystery_field", fieldKey: "field_unk1", inferredType: "unknown" }),
    ];

    const { schemaCode } = generateAcfTemplate(fields);

    expect(schemaCode).toContain("mystery_field: z.unknown()");
  });

  it("generates accessor helper function with field key comments", () => {
    const fields: AcfFieldInfo[] = [
      makeField({ name: "price", fieldKey: "field_001", inferredType: "number" }),
      makeField({ name: "title", fieldKey: "field_002", inferredType: "string" }),
    ];

    const { accessorCode } = generateAcfTemplate(fields);

    expect(accessorCode).toContain('import { AcfFieldsSchema, type AcfFields } from "./acf-schema"');
    expect(accessorCode).toContain("export function getAcfFields(meta: Record<string, unknown>): AcfFields {");
    expect(accessorCode).toContain('raw.price = meta["price"]');
    expect(accessorCode).toContain('raw.title = meta["title"]');
    expect(accessorCode).toContain("return AcfFieldsSchema.parse(raw)");
    // Field key traceability comments
    expect(accessorCode).toContain("price → field_001");
    expect(accessorCode).toContain("title → field_002");
  });

  it("returns empty template for no fields", () => {
    const { schemaCode, accessorCode } = generateAcfTemplate([]);

    // Should return comment-only code, no real schema or function
    expect(schemaCode).not.toContain("z.object");
    expect(accessorCode).not.toContain("export function");
    // Should contain some comment explaining there are no fields
    expect(schemaCode).toContain("//");
    expect(accessorCode).toContain("//");
  });

  it("preserves original field names (no camelCase transformation)", () => {
    const fields: AcfFieldInfo[] = [
      makeField({ name: "my_custom_field", fieldKey: "field_xyz", inferredType: "string" }),
      makeField({ name: "another_field_name", fieldKey: "field_abc", inferredType: "number" }),
    ];

    const { schemaCode, accessorCode } = generateAcfTemplate(fields);

    // Names must not be camelCased
    expect(schemaCode).toContain("my_custom_field:");
    expect(schemaCode).toContain("another_field_name:");
    expect(accessorCode).toContain('raw.my_custom_field = meta["my_custom_field"]');
    expect(accessorCode).toContain('raw.another_field_name = meta["another_field_name"]');
    // camelCase must NOT appear
    expect(schemaCode).not.toContain("myCustomField");
    expect(schemaCode).not.toContain("anotherFieldName");
  });
});
