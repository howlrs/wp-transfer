import { describe, it, expect } from "vitest";
import { extractAcfFieldGroups } from "../src/acf-field-extractor.js";
import type { WpPost } from "@wp-transfer/core";

// ── Helpers ──

function makePost(overrides: Partial<WpPost> = {}): WpPost {
  return {
    id: 1,
    title: "Test",
    slug: "test",
    status: "publish",
    type: "post",
    content: "",
    excerpt: "",
    date: "2024-01-01 00:00:00",
    modified: "2024-01-01 00:00:00",
    author: 1,
    meta: {},
    ...overrides,
  };
}

/** Build a PHP serialized associative array from key-value pairs. */
function phpSerialize(obj: Record<string, string | number | boolean>): string {
  const entries = Object.entries(obj);
  const parts: string[] = [];
  for (const [key, value] of entries) {
    // Key
    parts.push(`s:${key.length}:"${key}";`);
    // Value
    if (typeof value === "string") {
      parts.push(`s:${value.length}:"${value}";`);
    } else if (typeof value === "number") {
      parts.push(`i:${value};`);
    } else {
      parts.push(`b:${value ? 1 : 0};`);
    }
  }
  return `a:${entries.length}:{${parts.join("")}}`;
}

// ── Tests ──

describe("extractAcfFieldGroups", () => {
  it("returns empty array when no ACF posts found", () => {
    const posts = [
      makePost({ id: 1, type: "post" }),
      makePost({ id: 2, type: "page" }),
    ];
    expect(extractAcfFieldGroups(posts)).toEqual([]);
  });

  it("extracts field group from acf-field-group post type", () => {
    const posts = [
      makePost({
        id: 100,
        type: "acf-field-group",
        title: "Page Fields",
        content: phpSerialize({ key: "group_abc123" }),
      }),
    ];
    const groups = extractAcfFieldGroups(posts);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("Page Fields");
    expect(groups[0].key).toBe("group_abc123");
    expect(groups[0].fields).toEqual([]);
  });

  it("extracts text/image/number field types from acf-field posts", () => {
    const posts = [
      makePost({
        id: 100,
        type: "acf-field-group",
        title: "Hero Fields",
        content: phpSerialize({ key: "group_hero" }),
      }),
      makePost({
        id: 201,
        type: "acf-field",
        title: "Heading",
        parentId: 100,
        content: phpSerialize({
          key: "field_heading",
          name: "heading",
          type: "text",
          label: "Heading",
          required: 1,
        }),
      }),
      makePost({
        id: 202,
        type: "acf-field",
        title: "Hero Image",
        parentId: 100,
        content: phpSerialize({
          key: "field_hero_image",
          name: "hero_image",
          type: "image",
          label: "Hero Image",
          required: 0,
        }),
      }),
      makePost({
        id: 203,
        type: "acf-field",
        title: "Sort Order",
        parentId: 100,
        content: phpSerialize({
          key: "field_sort_order",
          name: "sort_order",
          type: "number",
          label: "Sort Order",
          required: 0,
        }),
      }),
    ];

    const groups = extractAcfFieldGroups(posts);
    expect(groups).toHaveLength(1);
    expect(groups[0].fields).toHaveLength(3);

    const [heading, image, sortOrder] = groups[0].fields;
    expect(heading.key).toBe("field_heading");
    expect(heading.name).toBe("heading");
    expect(heading.type).toBe("text");
    expect(heading.label).toBe("Heading");
    expect(heading.required).toBe(true);

    expect(image.type).toBe("image");
    expect(image.name).toBe("hero_image");
    expect(image.required).toBe(false);

    expect(sortOrder.type).toBe("number");
    expect(sortOrder.name).toBe("sort_order");
  });

  it("extracts repeater with sub-fields", () => {
    const posts = [
      makePost({
        id: 100,
        type: "acf-field-group",
        title: "Team",
        content: phpSerialize({ key: "group_team" }),
      }),
      makePost({
        id: 300,
        type: "acf-field",
        title: "Members",
        parentId: 100,
        content: phpSerialize({
          key: "field_members",
          name: "members",
          type: "repeater",
          label: "Members",
          required: 0,
        }),
      }),
      // Sub-fields of the repeater (parentId = repeater field id)
      makePost({
        id: 301,
        type: "acf-field",
        title: "Name",
        parentId: 300,
        content: phpSerialize({
          key: "field_member_name",
          name: "name",
          type: "text",
          label: "Name",
          required: 1,
        }),
      }),
      makePost({
        id: 302,
        type: "acf-field",
        title: "Role",
        parentId: 300,
        content: phpSerialize({
          key: "field_member_role",
          name: "role",
          type: "text",
          label: "Role",
          required: 0,
        }),
      }),
    ];

    const groups = extractAcfFieldGroups(posts);
    expect(groups).toHaveLength(1);
    expect(groups[0].fields).toHaveLength(1);

    const repeater = groups[0].fields[0];
    expect(repeater.type).toBe("repeater");
    expect(repeater.name).toBe("members");
    expect(repeater.subFields).toHaveLength(2);
    expect(repeater.subFields![0].name).toBe("name");
    expect(repeater.subFields![0].type).toBe("text");
    expect(repeater.subFields![1].name).toBe("role");
  });

  it("extracts flexible content with layouts", () => {
    const posts = [
      makePost({
        id: 100,
        type: "acf-field-group",
        title: "Page Builder",
        content: phpSerialize({ key: "group_builder" }),
      }),
      makePost({
        id: 400,
        type: "acf-field",
        title: "Sections",
        parentId: 100,
        content: phpSerialize({
          key: "field_sections",
          name: "sections",
          type: "flexible_content",
          label: "Sections",
          required: 0,
        }),
      }),
      // Layout: Hero (child of flexible content field)
      makePost({
        id: 401,
        type: "acf-field",
        title: "Hero",
        parentId: 400,
        content: phpSerialize({
          key: "layout_hero",
          name: "hero",
          type: "text", // layout type marker in ACF, but we use parent context
          label: "Hero Section",
        }),
      }),
      // Sub-field of hero layout
      makePost({
        id: 411,
        type: "acf-field",
        title: "Hero Heading",
        parentId: 401,
        content: phpSerialize({
          key: "field_hero_heading",
          name: "heading",
          type: "text",
          label: "Heading",
          required: 1,
        }),
      }),
      // Layout: CTA
      makePost({
        id: 402,
        type: "acf-field",
        title: "CTA",
        parentId: 400,
        content: phpSerialize({
          key: "layout_cta",
          name: "cta",
          type: "text",
          label: "Call to Action",
        }),
      }),
      // Sub-field of CTA layout
      makePost({
        id: 421,
        type: "acf-field",
        title: "CTA Text",
        parentId: 402,
        content: phpSerialize({
          key: "field_cta_text",
          name: "text",
          type: "textarea",
          label: "CTA Text",
          required: 0,
        }),
      }),
      makePost({
        id: 422,
        type: "acf-field",
        title: "Button URL",
        parentId: 402,
        content: phpSerialize({
          key: "field_cta_url",
          name: "button_url",
          type: "url",
          label: "Button URL",
          required: 0,
        }),
      }),
    ];

    const groups = extractAcfFieldGroups(posts);
    expect(groups).toHaveLength(1);

    const fc = groups[0].fields[0];
    expect(fc.type).toBe("flexible_content");
    expect(fc.name).toBe("sections");
    expect(fc.layouts).toHaveLength(2);

    const hero = fc.layouts![0];
    expect(hero.name).toBe("hero");
    expect(hero.label).toBe("Hero Section");
    expect(hero.subFields).toHaveLength(1);
    expect(hero.subFields[0].name).toBe("heading");
    expect(hero.subFields[0].type).toBe("text");

    const cta = fc.layouts![1];
    expect(cta.name).toBe("cta");
    expect(cta.subFields).toHaveLength(2);
    expect(cta.subFields[0].name).toBe("text");
    expect(cta.subFields[1].name).toBe("button_url");
  });

  it("extracts group field with sub-fields", () => {
    const posts = [
      makePost({
        id: 100,
        type: "acf-field-group",
        title: "Contact",
        content: phpSerialize({ key: "group_contact" }),
      }),
      makePost({
        id: 500,
        type: "acf-field",
        title: "Address",
        parentId: 100,
        content: phpSerialize({
          key: "field_address",
          name: "address",
          type: "group",
          label: "Address",
          required: 0,
        }),
      }),
      makePost({
        id: 501,
        type: "acf-field",
        title: "Street",
        parentId: 500,
        content: phpSerialize({
          key: "field_street",
          name: "street",
          type: "text",
          label: "Street",
          required: 1,
        }),
      }),
      makePost({
        id: 502,
        type: "acf-field",
        title: "City",
        parentId: 500,
        content: phpSerialize({
          key: "field_city",
          name: "city",
          type: "text",
          label: "City",
          required: 0,
        }),
      }),
    ];

    const groups = extractAcfFieldGroups(posts);
    const groupField = groups[0].fields[0];
    expect(groupField.type).toBe("group");
    expect(groupField.name).toBe("address");
    expect(groupField.subFields).toHaveLength(2);
    expect(groupField.subFields![0].name).toBe("street");
    expect(groupField.subFields![1].name).toBe("city");
  });

  it("limits nesting depth to 1 level", () => {
    // Repeater > Repeater > Sub-fields — the inner repeater should have no subFields
    const posts = [
      makePost({
        id: 100,
        type: "acf-field-group",
        title: "Nested",
        content: phpSerialize({ key: "group_nested" }),
      }),
      // Outer repeater (depth 0)
      makePost({
        id: 600,
        type: "acf-field",
        title: "Outer Repeater",
        parentId: 100,
        content: phpSerialize({
          key: "field_outer",
          name: "outer",
          type: "repeater",
          label: "Outer",
          required: 0,
        }),
      }),
      // Inner repeater (depth 1 — at the limit)
      makePost({
        id: 601,
        type: "acf-field",
        title: "Inner Repeater",
        parentId: 600,
        content: phpSerialize({
          key: "field_inner",
          name: "inner",
          type: "repeater",
          label: "Inner",
          required: 0,
        }),
      }),
      // Deeply nested field (depth 2 — should be excluded)
      makePost({
        id: 602,
        type: "acf-field",
        title: "Deep Field",
        parentId: 601,
        content: phpSerialize({
          key: "field_deep",
          name: "deep",
          type: "text",
          label: "Deep",
          required: 0,
        }),
      }),
    ];

    const groups = extractAcfFieldGroups(posts);
    const outerRepeater = groups[0].fields[0];
    expect(outerRepeater.type).toBe("repeater");
    expect(outerRepeater.subFields).toHaveLength(1);

    const innerRepeater = outerRepeater.subFields![0];
    expect(innerRepeater.type).toBe("repeater");
    // Nesting capped — inner repeater should have no sub-fields
    expect(innerRepeater.subFields).toBeUndefined();
  });

  it("handles invalid field content gracefully", () => {
    const posts = [
      makePost({
        id: 100,
        type: "acf-field-group",
        title: "Broken",
        content: phpSerialize({ key: "group_broken" }),
      }),
      makePost({
        id: 700,
        type: "acf-field",
        title: "Bad Field",
        parentId: 100,
        content: "not valid php serialized data",
      }),
      makePost({
        id: 701,
        type: "acf-field",
        title: "Good Field",
        parentId: 100,
        content: phpSerialize({
          key: "field_good",
          name: "good",
          type: "text",
          label: "Good",
          required: 0,
        }),
      }),
    ];

    const groups = extractAcfFieldGroups(posts);
    // Bad field is skipped, only the good field extracted
    expect(groups[0].fields).toHaveLength(1);
    expect(groups[0].fields[0].name).toBe("good");
  });

  it("extracts multiple field groups", () => {
    const posts = [
      makePost({
        id: 100,
        type: "acf-field-group",
        title: "Group A",
        content: phpSerialize({ key: "group_a" }),
      }),
      makePost({
        id: 200,
        type: "acf-field-group",
        title: "Group B",
        content: phpSerialize({ key: "group_b" }),
      }),
      makePost({
        id: 101,
        type: "acf-field",
        title: "Field A1",
        parentId: 100,
        content: phpSerialize({
          key: "field_a1",
          name: "a1",
          type: "text",
          label: "A1",
          required: 0,
        }),
      }),
      makePost({
        id: 201,
        type: "acf-field",
        title: "Field B1",
        parentId: 200,
        content: phpSerialize({
          key: "field_b1",
          name: "b1",
          type: "image",
          label: "B1",
          required: 0,
        }),
      }),
    ];

    const groups = extractAcfFieldGroups(posts);
    expect(groups).toHaveLength(2);
    expect(groups[0].title).toBe("Group A");
    expect(groups[0].fields[0].name).toBe("a1");
    expect(groups[1].title).toBe("Group B");
    expect(groups[1].fields[0].name).toBe("b1");
    expect(groups[1].fields[0].type).toBe("image");
  });
});
