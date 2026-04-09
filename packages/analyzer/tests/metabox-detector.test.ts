import { describe, it, expect } from "vitest";
import type { WpPost } from "@wp-transfer/core";
import { detectMetaBox } from "../src/metabox-detector.js";

function makePost(id: number, meta: Record<string, unknown>): WpPost {
  return {
    id,
    title: `Post ${id}`,
    slug: `post-${id}`,
    status: "publish",
    type: "post",
    content: "",
    excerpt: "",
    date: "2024-01-01",
    modified: "2024-01-01",
    author: 1,
    meta,
  };
}

describe("detectMetaBox", () => {
  it("detects custom meta fields excluding known plugins", () => {
    const posts = [
      makePost(1, {
        company_name: "Acme",
        employee_count: "50",
        is_featured: "1",
        // ACF shadow key for a different field — should be excluded entirely
        acf_field: "hello",
        _acf_field: "field_abc123",
        // Yoast — excluded
        _yoast_wpseo_title: "Title",
        // WP core — excluded
        _wp_page_template: "default",
      }),
    ];

    const result = detectMetaBox(posts);
    expect(result.detected).toBe(true);
    const keys = result.fields.map((f) => f.key);
    expect(keys).toContain("company_name");
    expect(keys).toContain("employee_count");
    expect(keys).toContain("is_featured");
    // ACF field must be excluded
    expect(keys).not.toContain("acf_field");
    // Yoast key must be excluded (starts with underscore)
    expect(keys).not.toContain("_yoast_wpseo_title");
  });

  it("excludes ACF field keys (has _key → field_* pair)", () => {
    const posts = [
      makePost(1, {
        // ACF pattern: key + _key pointing to field_*
        bio: "Some bio text",
        _bio: "field_5f1234567890",
        // Non-ACF custom field
        department: "Engineering",
      }),
    ];

    const result = detectMetaBox(posts);
    const keys = result.fields.map((f) => f.key);
    expect(keys).not.toContain("bio");
    expect(keys).toContain("department");
  });

  it("excludes WordPress core meta keys", () => {
    const posts = [
      makePost(1, {
        _wp_attachment_metadata: "{}",
        _edit_lock: "1234567890:1",
        _thumbnail_id: "42",
        _encloseme: "1",
        custom_field: "value",
      }),
    ];

    const result = detectMetaBox(posts);
    const keys = result.fields.map((f) => f.key);
    expect(keys).not.toContain("_wp_attachment_metadata");
    expect(keys).not.toContain("_edit_lock");
    expect(keys).not.toContain("_thumbnail_id");
    expect(keys).not.toContain("_encloseme");
    expect(keys).toContain("custom_field");
  });

  it("infers field types from values", () => {
    const posts = [
      makePost(1, {
        company_name: "Acme Corp",
        employee_count: "50",
        is_active: "1",
        founded_date: "2020-01-15",
        config_json: '{"key":"value"}',
        empty_field: "",
      }),
    ];

    const result = detectMetaBox(posts);
    const byKey = Object.fromEntries(result.fields.map((f) => [f.key, f]));

    expect(byKey["company_name"]?.inferredType).toBe("string");
    expect(byKey["employee_count"]?.inferredType).toBe("number");
    expect(byKey["is_active"]?.inferredType).toBe("boolean");
    expect(byKey["founded_date"]?.inferredType).toBe("date");
    expect(byKey["config_json"]?.inferredType).toBe("json");
    expect(byKey["empty_field"]?.inferredType).toBe("unknown");
  });

  it("returns detected: false when no custom fields", () => {
    const posts = [
      makePost(1, {
        // Only ACF fields and WP core meta
        title_field: "some title",
        _title_field: "field_abc",
        _wp_page_template: "default",
        _yoast_wpseo_title: "SEO Title",
        rank_math_title: "RM Title",
      }),
    ];

    const result = detectMetaBox(posts);
    expect(result.detected).toBe(false);
    expect(result.fieldCount).toBe(0);
    expect(result.fields).toHaveLength(0);
  });

  it("handles empty posts array", () => {
    const result = detectMetaBox([]);
    expect(result.detected).toBe(false);
    expect(result.fieldCount).toBe(0);
    expect(result.fields).toHaveLength(0);
  });

  it("aggregates fields across multiple posts", () => {
    const posts = [
      makePost(1, { company_name: "Acme", office_city: "Tokyo" }),
      makePost(2, { company_name: "Beta", office_city: "Osaka", headcount: "120" }),
    ];

    const result = detectMetaBox(posts);
    const keys = result.fields.map((f) => f.key);
    expect(keys).toContain("company_name");
    expect(keys).toContain("office_city");
    expect(keys).toContain("headcount");
    expect(result.fieldCount).toBe(3);
  });

  it("excludes WooCommerce meta keys", () => {
    const posts = [
      makePost(1, {
        _price: "100",
        _regular_price: "120",
        _sku: "SKU-001",
        _stock: "50",
        _product_type: "simple",
        mb_product_note: "Custom note",
      }),
    ];

    const result = detectMetaBox(posts);
    const keys = result.fields.map((f) => f.key);
    expect(keys).not.toContain("_price");
    expect(keys).not.toContain("_sku");
    expect(keys).toContain("mb_product_note");
  });

  it("includes sample value in field", () => {
    const posts = [makePost(1, { location: "Shibuya" })];
    const result = detectMetaBox(posts);
    const field = result.fields.find((f) => f.key === "location");
    expect(field?.sampleValue).toBe("Shibuya");
  });
});
