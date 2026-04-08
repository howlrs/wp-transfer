import { describe, it, expect } from "vitest";
import { analyzeSchema } from "../src/schema-analyzer.js";
import type { WpPost, WpTaxonomyTerm, WpMedia } from "@wp-transfer/core";

function makePost(overrides: Partial<WpPost> = {}): WpPost {
  return {
    id: 1,
    title: "Test",
    slug: "test",
    status: "publish",
    type: "post",
    content: "<p>Hello</p>",
    excerpt: "",
    date: "2024-01-01 00:00:00",
    modified: "2024-01-01 00:00:00",
    author: 1,
    meta: {},
    ...overrides,
  };
}

function makeTaxonomy(
  overrides: Partial<WpTaxonomyTerm> = {},
): WpTaxonomyTerm {
  return {
    id: 1,
    name: "Uncategorized",
    slug: "uncategorized",
    taxonomy: "category",
    ...overrides,
  };
}

function makeMedia(overrides: Partial<WpMedia> = {}): WpMedia {
  return {
    id: 1,
    title: "image.jpg",
    url: "https://example.com/image.jpg",
    mimeType: "image/jpeg",
    ...overrides,
  };
}

describe("analyzeSchema", () => {
  it("detects custom post types", () => {
    const posts = [
      makePost({ id: 1, type: "post" }),
      makePost({ id: 2, type: "product", title: "Product A" }),
      makePost({ id: 3, type: "product", title: "Product B" }),
    ];

    const result = analyzeSchema(posts, [], []);

    expect(result.customPostTypes).toHaveLength(1);
    expect(result.customPostTypes[0].slug).toBe("product");
    expect(result.customPostTypes[0].count).toBe(2);
  });

  it("detects ACF fields from meta patterns", () => {
    const posts = [
      makePost({
        id: 10,
        meta: {
          price: "29.99",
          _price: "field_abc123",
          color: "red",
          _color: "field_def456",
          _edit_last: "1",
        },
      }),
    ];

    const result = analyzeSchema(posts, [], []);

    expect(result.acfFields).toHaveLength(2);

    const priceField = result.acfFields.find((f) => f.name === "price");
    expect(priceField).toBeDefined();
    expect(priceField!.fieldKey).toBe("field_abc123");
    expect(priceField!.sampleValues).toContain("29.99");

    const colorField = result.acfFields.find((f) => f.name === "color");
    expect(colorField).toBeDefined();
    expect(colorField!.fieldKey).toBe("field_def456");
  });

  it("detects Yoast SEO meta", () => {
    const posts = [
      makePost({
        meta: {
          _yoast_wpseo_title: "My Title",
          _yoast_wpseo_metadesc: "My description",
        },
      }),
    ];

    const result = analyzeSchema(posts, [], []);

    expect(result.hasYoastSeo).toBe(true);
    expect(result.yoastMetaCount).toBe(2);
    expect(result.hasRankMath).toBe(false);
  });

  it("computes content summary", () => {
    const posts = [
      makePost({ id: 1, type: "post" }),
      makePost({ id: 2, type: "page" }),
    ];
    const taxonomies = [
      makeTaxonomy({ id: 1, taxonomy: "category" }),
    ];
    const media = [makeMedia({ id: 1 })];

    const result = analyzeSchema(posts, taxonomies, media, 5);

    expect(result.contentSummary.posts).toBe(1);
    expect(result.contentSummary.pages).toBe(1);
    expect(result.contentSummary.media).toBe(1);
    expect(result.contentSummary.users).toBe(5);
    expect(result.contentSummary.taxonomies).toHaveLength(1);
    expect(result.contentSummary.taxonomies[0].slug).toBe("category");
  });
});
