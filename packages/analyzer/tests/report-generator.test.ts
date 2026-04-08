import { describe, it, expect } from "vitest";
import { generateReport, reportToMarkdown } from "../src/report-generator.js";
import type { ReportInput } from "../src/report-generator.js";
import type { SchemaAnalysisResult } from "../src/schema-analyzer.js";
import type { CostEstimate } from "../src/cost-estimator.js";
import type { PluginEntry } from "@wp-transfer/core";

function makeInput(overrides?: Partial<ReportInput>): ReportInput {
  const schema: SchemaAnalysisResult = {
    contentSummary: {
      posts: 10,
      pages: 5,
      customPostTypes: [{ slug: "product", name: "product", count: 3 }],
      media: 20,
      users: 2,
      taxonomies: [
        { slug: "category", name: "category", count: 5, hierarchical: true },
      ],
    },
    customPostTypes: [{ slug: "product", name: "product", count: 3 }],
    acfFields: [],
    hasYoastSeo: true,
    hasRankMath: false,
    yoastMetaCount: 10,
    rankMathMetaCount: 0,
  };

  const plugins: PluginEntry[] = [
    {
      slug: "wordpress-seo",
      name: "Yoast SEO",
      version: "21.0",
      active: true,
      category: "seo",
      migrationStrategy: "template",
      difficulty: 2,
      estimatedHours: 8,
    },
    {
      slug: "akismet",
      name: "Akismet",
      version: "5.0",
      active: false,
      category: "security",
      migrationStrategy: "not-needed",
      difficulty: 1,
      estimatedHours: 0,
    },
  ];

  const cost: CostEstimate = {
    totalHours: 42,
    breakdown: {
      contentMigration: 8,
      pluginMigration: 8,
      themeMigration: 16,
      testing: 7,
      deployment: 8,
    },
    risks: [
      {
        area: "Custom Post Types",
        description: "Custom post types detected.",
        severity: "medium",
        mitigation: "Map each custom post type carefully.",
      },
    ],
  };

  return {
    siteUrl: "https://example.com",
    wpVersion: "6.7",
    phpVersion: "8.2",
    themeName: "Twenty Twenty-Four",
    themeVersion: "1.0",
    isChildTheme: false,
    schema,
    plugins,
    userCount: 2,
    cost,
    ...overrides,
  };
}

describe("generateReport", () => {
  it("produces a valid MigrationReport with correct fields", () => {
    const input = makeInput();
    const report = generateReport(input);

    expect(report.siteUrl).toBe("https://example.com");
    expect(report.wpVersion).toBe("6.7");
    expect(report.phpVersion).toBe("8.2");
    expect(report.theme.name).toBe("Twenty Twenty-Four");
    expect(report.theme.isChild).toBe(false);
    expect(report.contentSummary.posts).toBe(10);
    expect(report.contentSummary.pages).toBe(5);
    expect(report.contentSummary.media).toBe(20);
    expect(report.plugins).toHaveLength(2);
    expect(report.estimatedTotalHours).toBe(42);
    expect(report.risks).toHaveLength(1);
    expect(report.generatedAt).toBeDefined();

    // Migration plan should group by strategy
    expect(report.migrationPlan.template).toHaveLength(1);
    expect(report.migrationPlan.template[0]).toContain("Yoast SEO");
  });
});

describe("reportToMarkdown", () => {
  it("produces readable markdown with all sections", () => {
    const input = makeInput();
    const report = generateReport(input);
    const md = reportToMarkdown(report);

    // Title
    expect(md).toContain("# Migration Report: https://example.com");

    // Site Profile section
    expect(md).toContain("## Site Profile");
    expect(md).toContain("6.7");
    expect(md).toContain("8.2");
    expect(md).toContain("Twenty Twenty-Four");

    // Content Summary
    expect(md).toContain("## Content Summary");
    expect(md).toContain("| Posts | 10 |");
    expect(md).toContain("| Pages | 5 |");
    expect(md).toContain("| Media | 20 |");

    // Plugin Inventory
    expect(md).toContain("## Plugin Inventory");
    expect(md).toContain("Yoast SEO");

    // Migration Plan
    expect(md).toContain("## Migration Plan");
    expect(md).toContain("### Template-based");

    // Estimated Effort
    expect(md).toContain("## Estimated Effort");
    expect(md).toContain("42 hours");

    // Risks
    expect(md).toContain("## Risks");
    expect(md).toContain("Custom Post Types");
  });
});
