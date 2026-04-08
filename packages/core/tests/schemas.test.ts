import { describe, it, expect } from "vitest";
import {
  WpPostSchema,
  WpUserSchema,
  WpTaxonomyTermSchema,
  WpMediaSchema,
  PluginEntrySchema,
  PluginCategorySchema,
  MigrationStrategySchema,
  MigrationReportSchema,
  ThemeInfoSchema,
  ContentSummarySchema,
  RiskEntrySchema,
  MigrationPlanSchema,
} from "../src/index.js";

describe("WpPostSchema", () => {
  it("validates a minimal post", () => {
    const post = {
      id: 1,
      title: "Hello World",
      slug: "hello-world",
      status: "publish",
      type: "post",
      content: "<p>Hello</p>",
      excerpt: "",
      date: "2024-01-01T00:00:00",
      modified: "2024-01-01T00:00:00",
      author: 1,
      meta: {},
    };
    const result = WpPostSchema.safeParse(post);
    expect(result.success).toBe(true);
  });

  it("rejects a post without required fields", () => {
    const post = {
      id: 1,
      title: "Hello World",
      // missing slug, status, type, content, excerpt, date, modified, author, meta
    };
    const result = WpPostSchema.safeParse(post);
    expect(result.success).toBe(false);
  });

  it("accepts optional locale field", () => {
    const post = {
      id: 1,
      title: "Hello World",
      slug: "hello-world",
      status: "draft",
      type: "post",
      content: "<p>Hello</p>",
      excerpt: "",
      date: "2024-01-01T00:00:00",
      modified: "2024-01-01T00:00:00",
      author: 1,
      meta: {},
      locale: "ja",
    };
    const result = WpPostSchema.safeParse(post);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe("ja");
    }
  });

  it("rejects invalid status values", () => {
    const post = {
      id: 1,
      title: "Hello World",
      slug: "hello-world",
      status: "invalid-status",
      type: "post",
      content: "",
      excerpt: "",
      date: "2024-01-01T00:00:00",
      modified: "2024-01-01T00:00:00",
      author: 1,
      meta: {},
    };
    const result = WpPostSchema.safeParse(post);
    expect(result.success).toBe(false);
  });
});

describe("PluginEntrySchema", () => {
  it("validates a detected plugin", () => {
    const plugin = {
      slug: "yoast-seo",
      name: "Yoast SEO",
      version: "21.0",
      active: true,
      category: "seo",
      migrationStrategy: "template",
      difficulty: 3,
      estimatedHours: 4,
      notes: "Well-supported migration path",
    };
    const result = PluginEntrySchema.safeParse(plugin);
    expect(result.success).toBe(true);
  });

  it("rejects invalid category", () => {
    const plugin = {
      slug: "test",
      name: "Test",
      active: true,
      category: "not-a-real-category",
      migrationStrategy: "manual",
      difficulty: 1,
      estimatedHours: 1,
    };
    const result = PluginEntrySchema.safeParse(plugin);
    expect(result.success).toBe(false);
  });

  it("rejects difficulty outside 1-5 range", () => {
    const plugin = {
      slug: "test",
      name: "Test",
      active: true,
      category: "seo",
      migrationStrategy: "manual",
      difficulty: 10,
      estimatedHours: 1,
    };
    const result = PluginEntrySchema.safeParse(plugin);
    expect(result.success).toBe(false);
  });
});

describe("MigrationReportSchema", () => {
  it("validates a minimal report", () => {
    const report = {
      generatedAt: "2024-01-01T00:00:00Z",
      siteUrl: "https://example.com",
      wpVersion: "6.4.2",
      theme: {
        name: "Twenty Twenty-Four",
        isChild: false,
      },
      contentSummary: {
        posts: 100,
        pages: 20,
        customPostTypes: [],
        media: 50,
        users: 3,
        taxonomies: [],
      },
      plugins: [],
      migrationPlan: {
        automated: [],
        template: [],
        llmAssisted: [],
        manual: [],
      },
      estimatedTotalHours: 40,
      risks: [],
    };
    const result = MigrationReportSchema.safeParse(report);
    expect(result.success).toBe(true);
  });

  it("validates a report with risks", () => {
    const report = {
      generatedAt: "2024-01-01T00:00:00Z",
      siteUrl: "https://example.com",
      wpVersion: "6.4.2",
      theme: {
        name: "Divi",
        version: "4.22",
        isChild: true,
        parentTheme: "Divi Parent",
      },
      contentSummary: {
        posts: 500,
        pages: 50,
        customPostTypes: [
          { slug: "portfolio", name: "Portfolio", count: 30, hasArchive: true, isPublic: true },
        ],
        media: 200,
        users: 10,
        taxonomies: [
          { slug: "category", name: "Categories", count: 15, hierarchical: true },
        ],
      },
      plugins: [
        {
          slug: "woocommerce",
          name: "WooCommerce",
          version: "8.0",
          active: true,
          category: "ecommerce" as const,
          migrationStrategy: "llm-assisted" as const,
          difficulty: 5,
          estimatedHours: 80,
        },
      ],
      migrationPlan: {
        automated: ["posts", "pages"],
        template: ["seo-meta"],
        llmAssisted: ["woocommerce"],
        manual: ["custom-theme"],
      },
      estimatedTotalHours: 160,
      risks: [
        {
          area: "E-commerce",
          description: "WooCommerce data migration is complex",
          severity: "high" as const,
          mitigation: "Use staged migration with data validation",
        },
      ],
    };
    const result = MigrationReportSchema.safeParse(report);
    expect(result.success).toBe(true);
  });
});
