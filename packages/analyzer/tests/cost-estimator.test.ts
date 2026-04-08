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
});
