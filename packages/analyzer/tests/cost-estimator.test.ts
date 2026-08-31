import { describe, it, expect } from "vitest";
import { estimateCost } from "../src/cost-estimator.js";

describe("estimateCost — edge cases", () => {
  it("handles 0 posts and 0 media without errors", () => {
    const result = estimateCost(0, 0, [], false);

    expect(result.totalHours).toBeGreaterThan(0);
    expect(result.breakdown.contentMigration).toBe(4);
    expect(result.breakdown.pluginMigration).toBe(0);
    expect(result.breakdown.themeMigration).toBe(16);
    expect(result.breakdown.testing).toBeGreaterThan(0);
    expect(result.breakdown.deployment).toBe(8);
    expect(result.risks).toEqual([]);
  });

  it("does not produce negative or NaN values with 0 inputs", () => {
    const result = estimateCost(0, 0, [], false);

    for (const [, value] of Object.entries(result.breakdown)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(value)).toBe(false);
    }

    expect(result.totalHours).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(result.totalHours)).toBe(false);
  });

  it("correctly sums breakdown to totalHours", () => {
    const result = estimateCost(0, 0, [], false);
    const { contentMigration, pluginMigration, themeMigration, testing, deployment } = result.breakdown;
    const sum = contentMigration + pluginMigration + themeMigration + testing + deployment;

    expect(result.totalHours).toBe(sum);
  });

  it("accounts for active plugins and reports all high-volume migration risks", () => {
    const result = estimateCost(10_001, 1_001, [
      {
        slug: "storefront", name: "Storefront", active: true, category: "ecommerce",
        migrationStrategy: "manual", difficulty: 4, estimatedHours: 12,
      },
      {
        slug: "layout-builder", name: "Layout Builder", active: true, category: "page-builder",
        migrationStrategy: "template", difficulty: 3, estimatedHours: 8,
      },
      {
        slug: "inactive", name: "Inactive", active: false, category: "other",
        migrationStrategy: "manual", difficulty: 1, estimatedHours: 99,
      },
      {
        slug: "unneeded", name: "Unneeded", active: true, category: "other",
        migrationStrategy: "not-needed", difficulty: 1, estimatedHours: 99,
      },
    ], true);

    expect(result.breakdown.pluginMigration).toBe(20);
    expect(result.breakdown.contentMigration).toBe(50);
    expect(result.risks.map((risk) => risk.area)).toEqual([
      "E-commerce", "Page Builder", "Custom Post Types", "Large Site",
    ]);
    expect(result.totalHours).toBe(
      result.breakdown.contentMigration
      + result.breakdown.pluginMigration
      + result.breakdown.themeMigration
      + result.breakdown.testing
      + result.breakdown.deployment,
    );
  });
});
