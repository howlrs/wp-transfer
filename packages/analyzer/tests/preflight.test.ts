import { describe, it, expect, vi, afterEach } from "vitest";
import {
  runPreflightChecks,
  formatPreflightReport,
} from "../src/preflight.js";
import type { PreflightReport } from "../src/preflight.js";

describe("runPreflightChecks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Node version check passes on Node 20+", () => {
    const report = runPreflightChecks({ outputPath: "/tmp/out" });
    const nodeCheck = report.checks.find(c => c.name === "Node.js version")!;
    expect(nodeCheck.status).toBe("pass");
    expect(nodeCheck.message).toContain(">= 20 required");
  });

  it("Source directory check fails for non-existent path", () => {
    const report = runPreflightChecks({
      sourcePath: "/no/such/directory/ever",
      outputPath: "/tmp/out",
    });
    const srcCheck = report.checks.find(c => c.name === "Source directory")!;
    expect(srcCheck.status).toBe("fail");
    expect(srcCheck.message).toContain("does not exist");
  });

  it("Source directory check fails when no path given", () => {
    const report = runPreflightChecks({ outputPath: "/tmp/out" });
    const srcCheck = report.checks.find(c => c.name === "Source directory")!;
    expect(srcCheck.status).toBe("fail");
    expect(srcCheck.message).toBe("No source path provided");
  });

  it("Source directory check passes for existing path", () => {
    const report = runPreflightChecks({
      sourcePath: import.meta.dirname,
      outputPath: "/tmp/out",
    });
    const srcCheck = report.checks.find(c => c.name === "Source directory")!;
    expect(srcCheck.status).toBe("pass");
    expect(srcCheck.message).toBe(import.meta.dirname);
  });

  it("Output directory check passes for writable parent", () => {
    const report = runPreflightChecks({
      sourcePath: import.meta.dirname,
      outputPath: "/tmp/test-output",
    });
    const outCheck = report.checks.find(c => c.name === "Output directory")!;
    expect(outCheck.status).toBe("pass");
    expect(outCheck.message).toContain("writable");
  });

  it("Output directory check fails for non-writable parent", () => {
    const report = runPreflightChecks({
      sourcePath: import.meta.dirname,
      outputPath: "/root/no-access/output",
    });
    const outCheck = report.checks.find(c => c.name === "Output directory")!;
    expect(outCheck.status).toBe("fail");
    expect(outCheck.message).toContain("not writable");
  });

  it("Schema file check warns when no path given", () => {
    const report = runPreflightChecks({ outputPath: "/tmp/out" });
    const schemaCheck = report.checks.find(c => c.name === "Schema file")!;
    expect(schemaCheck.status).toBe("warn");
    expect(schemaCheck.message).toContain("Prisma generation will be skipped");
  });

  it("Schema file check fails for non-existent path", () => {
    const report = runPreflightChecks({
      outputPath: "/tmp/out",
      schemaPath: "/no/such/schema.prisma",
    });
    const schemaCheck = report.checks.find(c => c.name === "Schema file")!;
    expect(schemaCheck.status).toBe("fail");
    expect(schemaCheck.message).toContain("does not exist");
  });

  it("canProceed is true when no failures", () => {
    const report = runPreflightChecks({
      sourcePath: import.meta.dirname,
      outputPath: "/tmp/test-output",
    });
    // Source, output pass; schema warns; Docker may pass/warn; Node passes.
    // No failures expected in this scenario.
    expect(report.canProceed).toBe(true);
    expect(report.failed).toBe(0);
  });

  it("canProceed is false when any failure", () => {
    const report = runPreflightChecks({
      sourcePath: "/no/such/path",
      outputPath: "/tmp/out",
    });
    expect(report.canProceed).toBe(false);
    expect(report.failed).toBeGreaterThan(0);
  });

  it("counts passed, failed, and warnings correctly", () => {
    const report = runPreflightChecks({
      sourcePath: import.meta.dirname,
      outputPath: "/tmp/test-output",
    });
    expect(report.passed + report.failed + report.warnings).toBe(report.checks.length);
  });
});

describe("formatPreflightReport", () => {
  it("contains [OK], [FAIL], [WARN] markers", () => {
    const report: PreflightReport = {
      checks: [
        { name: "A", status: "pass", message: "good" },
        { name: "B", status: "fail", message: "bad" },
        { name: "C", status: "warn", message: "maybe" },
      ],
      passed: 1,
      failed: 1,
      warnings: 1,
      canProceed: false,
    };
    const output = formatPreflightReport(report);
    expect(output).toContain("[OK]");
    expect(output).toContain("[FAIL]");
    expect(output).toContain("[WARN]");
  });

  it("shows summary counts", () => {
    const report: PreflightReport = {
      checks: [
        { name: "A", status: "pass", message: "ok" },
        { name: "B", status: "pass", message: "ok" },
      ],
      passed: 2,
      failed: 0,
      warnings: 0,
      canProceed: true,
    };
    const output = formatPreflightReport(report);
    expect(output).toContain("2 passed, 0 failed, 0 warnings");
    expect(output).toContain("Ready to proceed");
  });

  it("shows cannot proceed when failures exist", () => {
    const report: PreflightReport = {
      checks: [
        { name: "A", status: "fail", message: "broken" },
      ],
      passed: 0,
      failed: 1,
      warnings: 0,
      canProceed: false,
    };
    const output = formatPreflightReport(report);
    expect(output).toContain("Cannot proceed");
  });
});
