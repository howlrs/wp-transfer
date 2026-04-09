import { describe, it, expect } from "vitest";
import { generateAcfTemplate } from "../src/acf-template-generator.js";
import type { AcfFieldInfo } from "../src/schema-analyzer.js";
import type { AcfFieldGroup } from "../src/acf-field-extractor.js";

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

  it("sanitizes malicious field names to prevent code injection", () => {
    const fields: AcfFieldInfo[] = [
      makeField({ name: 'test"]; process.exit(1); ("x', fieldKey: "field_evil", inferredType: "string" }),
    ];
    const result = generateAcfTemplate(fields);

    // Schema identifier must be sanitized — no unescaped special chars that break TS syntax
    expect(result.schemaCode).not.toContain('"]; process.exit(1); ("x');

    // Accessor identifier must be sanitized
    expect(result.accessorCode).not.toContain('"]; process.exit(1); ("x');

    // Identifier must be sanitized (special chars replaced with _)
    expect(result.schemaCode).toContain("test____process_exit_1_____");
    expect(result.accessorCode).toContain("test____process_exit_1_____");

    // The meta lookup key must have the double-quote escaped so it can't break out of the string literal
    expect(result.accessorCode).toContain('\\"');
    // Raw unescaped quote must NOT appear in meta["..."] lookup position
    expect(result.accessorCode).not.toContain('meta["test"');

    // Must still reference the correct Zod type
    expect(result.schemaCode).toContain("z.string()");
  });

  it("sanitizes field names starting with numbers", () => {
    const fields: AcfFieldInfo[] = [
      makeField({ name: "123field", fieldKey: "field_num", inferredType: "number" }),
    ];
    const result = generateAcfTemplate(fields);

    expect(result.schemaCode).toContain("_123field:");
  });

  it("infers Repeater field from array sample value", () => {
    const fields: AcfFieldInfo[] = [
      makeField({
        name: "team_members",
        fieldKey: "field_rep1",
        inferredType: "json",
        sampleValues: ['[{"name":"Alice","role":"Dev"},{"name":"Bob","role":"PM"}]'],
      }),
    ];
    const { schemaCode } = generateAcfTemplate(fields);
    expect(schemaCode).toContain("z.array(");
    expect(schemaCode).toContain("z.object(");
    expect(schemaCode).toContain("TODO: Verify inferred schema");
  });

  it("infers Gallery field from string array sample value", () => {
    const fields: AcfFieldInfo[] = [
      makeField({
        name: "photos",
        fieldKey: "field_gal1",
        inferredType: "json",
        sampleValues: ['["https://example.com/a.jpg","https://example.com/b.jpg"]'],
      }),
    ];
    const { schemaCode } = generateAcfTemplate(fields);
    expect(schemaCode).toContain("z.array(z.string())");
  });

  it("falls back to z.unknown() for non-parseable json sample", () => {
    const fields: AcfFieldInfo[] = [
      makeField({
        name: "config",
        fieldKey: "field_cfg1",
        inferredType: "json",
        sampleValues: ["not valid json"],
      }),
    ];
    const { schemaCode } = generateAcfTemplate(fields);
    expect(schemaCode).toContain("config: z.unknown()");
  });
});

// ── Definition-based generation (ACF Pro) ──

describe("generateAcfTemplate — field definitions", () => {
  it("generates schema from field definitions when provided", () => {
    const groups: AcfFieldGroup[] = [{
      title: "Hero",
      key: "group_hero",
      fields: [
        { key: "field_heading", name: "heading", type: "text", label: "Heading" },
        { key: "field_count", name: "count", type: "number", label: "Count" },
        { key: "field_active", name: "is_active", type: "true_false", label: "Active" },
      ],
    }];

    const { schemaCode } = generateAcfTemplate([], groups);

    expect(schemaCode).toContain('import { z } from "zod"');
    expect(schemaCode).toContain("heading: z.string()");
    expect(schemaCode).toContain("count: z.coerce.number()");
    expect(schemaCode).toContain("is_active: z.coerce.boolean()");
  });

  it("generates flexible content as discriminated union", () => {
    const groups: AcfFieldGroup[] = [{
      title: "Page Builder",
      key: "group_builder",
      fields: [{
        key: "field_sections",
        name: "sections",
        type: "flexible_content",
        label: "Sections",
        layouts: [
          {
            key: "layout_hero",
            name: "hero",
            label: "Hero Section",
            subFields: [
              { key: "field_h", name: "heading", type: "text", label: "Heading" },
              { key: "field_i", name: "image", type: "image", label: "Image" },
            ],
          },
          {
            key: "layout_cta",
            name: "cta",
            label: "Call to Action",
            subFields: [
              { key: "field_t", name: "text", type: "textarea", label: "Text" },
              { key: "field_u", name: "button_url", type: "url", label: "Button URL" },
            ],
          },
        ],
      }],
    }];

    const { schemaCode } = generateAcfTemplate([], groups);

    expect(schemaCode).toContain('z.discriminatedUnion("acf_fc_layout"');
    expect(schemaCode).toContain('acf_fc_layout: z.literal("hero")');
    expect(schemaCode).toContain('acf_fc_layout: z.literal("cta")');
    expect(schemaCode).toContain("heading: z.string()");
    expect(schemaCode).toContain("image: z.number()");
    expect(schemaCode).toContain("text: z.string()");
    expect(schemaCode).toContain("button_url: z.string()");
  });

  it("generates group as nested object", () => {
    const groups: AcfFieldGroup[] = [{
      title: "Contact",
      key: "group_contact",
      fields: [{
        key: "field_address",
        name: "address",
        type: "group",
        label: "Address",
        subFields: [
          { key: "field_street", name: "street", type: "text", label: "Street" },
          { key: "field_city", name: "city", type: "text", label: "City" },
          { key: "field_zip", name: "zip", type: "text", label: "ZIP" },
        ],
      }],
    }];

    const { schemaCode } = generateAcfTemplate([], groups);

    expect(schemaCode).toContain("address: z.object({ street: z.string(), city: z.string(), zip: z.string() })");
  });

  it("generates repeater as z.array of z.object", () => {
    const groups: AcfFieldGroup[] = [{
      title: "Team",
      key: "group_team",
      fields: [{
        key: "field_members",
        name: "members",
        type: "repeater",
        label: "Members",
        subFields: [
          { key: "field_name", name: "name", type: "text", label: "Name" },
          { key: "field_role", name: "role", type: "text", label: "Role" },
        ],
      }],
    }];

    const { schemaCode } = generateAcfTemplate([], groups);

    expect(schemaCode).toContain("members: z.array(z.object({ name: z.string(), role: z.string() }))");
  });

  it("generates post_object as z.number()", () => {
    const groups: AcfFieldGroup[] = [{
      title: "Related",
      key: "group_rel",
      fields: [
        { key: "field_ref", name: "related_post", type: "post_object", label: "Related Post" },
      ],
    }];

    const { schemaCode } = generateAcfTemplate([], groups);

    expect(schemaCode).toContain("related_post: z.number()");
  });

  it("generates relationship as z.array(z.number())", () => {
    const groups: AcfFieldGroup[] = [{
      title: "Related",
      key: "group_rel",
      fields: [
        { key: "field_rels", name: "related_posts", type: "relationship", label: "Related Posts" },
      ],
    }];

    const { schemaCode } = generateAcfTemplate([], groups);

    expect(schemaCode).toContain("related_posts: z.array(z.number())");
  });

  it("generates clone as z.any() with comment", () => {
    const groups: AcfFieldGroup[] = [{
      title: "Shared",
      key: "group_shared",
      fields: [
        { key: "field_clone", name: "shared_section", type: "clone", label: "Shared Section" },
      ],
    }];

    const { schemaCode } = generateAcfTemplate([], groups);

    expect(schemaCode).toContain("shared_section: z.any()");
    expect(schemaCode).toContain("clone");
  });

  it("falls back to data inference when no field definitions provided", () => {
    const fields: AcfFieldInfo[] = [
      makeField({ name: "title", fieldKey: "field_001", inferredType: "string" }),
    ];

    // No fieldGroups argument → data inference
    const { schemaCode } = generateAcfTemplate(fields);

    expect(schemaCode).toContain("title: z.string()");
    expect(schemaCode).toContain("field_001");
  });

  it("prefers field definitions over data inference when both provided", () => {
    const fields: AcfFieldInfo[] = [
      makeField({ name: "title", fieldKey: "field_001", inferredType: "string" }),
    ];
    const groups: AcfFieldGroup[] = [{
      title: "Hero",
      key: "group_hero",
      fields: [
        { key: "field_def_title", name: "def_title", type: "text", label: "Title" },
      ],
    }];

    const { schemaCode } = generateAcfTemplate(fields, groups);

    // Should use definition-based field, not inference-based
    expect(schemaCode).toContain("def_title: z.string()");
    expect(schemaCode).toContain("field_def_title");
    // The inference field should NOT appear
    expect(schemaCode).not.toContain("field_001");
  });

  it("generates accessor code from field definitions", () => {
    const groups: AcfFieldGroup[] = [{
      title: "Hero",
      key: "group_hero",
      fields: [
        { key: "field_heading", name: "heading", type: "text", label: "Heading" },
      ],
    }];

    const { accessorCode } = generateAcfTemplate([], groups);

    expect(accessorCode).toContain("export function getAcfFields");
    expect(accessorCode).toContain('raw.heading = meta["heading"]');
    expect(accessorCode).toContain("heading → field_heading");
  });

  it("merges fields from multiple groups", () => {
    const groups: AcfFieldGroup[] = [
      {
        title: "Group A",
        key: "group_a",
        fields: [{ key: "field_a1", name: "a1", type: "text", label: "A1" }],
      },
      {
        title: "Group B",
        key: "group_b",
        fields: [{ key: "field_b1", name: "b1", type: "number", label: "B1" }],
      },
    ];

    const { schemaCode } = generateAcfTemplate([], groups);

    expect(schemaCode).toContain("a1: z.string()");
    expect(schemaCode).toContain("b1: z.coerce.number()");
  });
});
