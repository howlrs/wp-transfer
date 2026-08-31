import { describe, it, expect } from "vitest";
import { generateCoverageReport } from "../src/commands/run.js";

describe("generateCoverageReport", () => {
  it("generates markdown report with coverage percentage", () => {
    const report = generateCoverageReport({
      phpScripts: 22,
      testsGenerated: 18,
      testsPassed: 15,
      testsFailed: 3,
      domains: [
        { name: "Product", scripts: 7, tested: 7, passed: 5 },
        { name: "Variant", scripts: 3, tested: 3, passed: 3 },
        { name: "Article", scripts: 8, tested: 6, passed: 5 },
        { name: "Category", scripts: 1, tested: 1, passed: 1 },
        { name: "Account", scripts: 2, tested: 1, passed: 1 },
      ],
    });

    expect(report).toContain("Migration Coverage Report");
    expect(report).toContain("22");
    expect(report).toContain("82%"); // 18/22
    expect(report).toContain("INCOMPLETE");
    expect(report).toContain("Product");
  });

  it("reports COMPLETE when all tests pass", () => {
    const report = generateCoverageReport({
      phpScripts: 5,
      testsGenerated: 5,
      testsPassed: 5,
      testsFailed: 0,
      domains: [{ name: "All", scripts: 5, tested: 5, passed: 5 }],
    });

    expect(report).toContain("COMPLETE");
    expect(report).toContain("100%");
  });
});
