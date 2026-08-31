/**
 * Pre-flight Check
 *
 * Validates environment and inputs before running migration analysis.
 */
import { existsSync, accessSync, constants, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";

// -- Types --

export interface PreflightCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
}

export interface PreflightReport {
  checks: PreflightCheck[];
  passed: number;
  failed: number;
  warnings: number;
  canProceed: boolean;
}

// -- Check functions --

function checkNodeVersion(): PreflightCheck {
  const version = process.version;
  const major = parseInt(version.slice(1).split(".")[0]!, 10);
  if (major >= 20) {
    return { name: "Node.js version", status: "pass", message: `${version} (>= 20 required)` };
  }
  return { name: "Node.js version", status: "fail", message: `${version} — Node.js 20+ is required` };
}

function checkSourceDirectory(path: string | undefined): PreflightCheck {
  if (!path) {
    return { name: "Source directory", status: "fail", message: "No source path provided" };
  }
  if (!existsSync(path)) {
    return { name: "Source directory", status: "fail", message: `${path} does not exist` };
  }
  return { name: "Source directory", status: "pass", message: path };
}

function checkOutputDirectory(path: string): PreflightCheck {
  let writableAncestor = resolve(path);
  while (!existsSync(writableAncestor)) {
    const parent = dirname(writableAncestor);
    if (parent === writableAncestor) break;
    writableAncestor = parent;
  }

  try {
    if (!statSync(writableAncestor).isDirectory()) {
      return {
        name: "Output directory",
        status: "fail",
        message: `${writableAncestor} is not a directory`,
      };
    }
    accessSync(writableAncestor, constants.W_OK | constants.X_OK);
    return { name: "Output directory", status: "pass", message: `${writableAncestor} is writable` };
  } catch {
    return { name: "Output directory", status: "fail", message: `${writableAncestor} is not writable` };
  }
}

function checkSchemaFile(path: string | undefined): PreflightCheck {
  if (!path) {
    return {
      name: "Schema file",
      status: "warn",
      message: "No schema file specified — Prisma columns will be conservatively inferred from PHP operations",
    };
  }
  if (!existsSync(path)) {
    return { name: "Schema file", status: "fail", message: `${path} does not exist` };
  }
  return { name: "Schema file", status: "pass", message: path };
}

function checkDocker(): PreflightCheck {
  try {
    execSync("docker --version", { stdio: "pipe" });
    return { name: "Docker", status: "pass", message: "Docker is available" };
  } catch {
    return { name: "Docker", status: "warn", message: "Docker not found — Docker scaffold will be generated but untestable" };
  }
}

// -- Public API --

export interface PreflightOptions {
  sourcePath?: string;
  outputPath: string;
  schemaPath?: string;
}

export function runPreflightChecks(options: PreflightOptions): PreflightReport {
  const checks: PreflightCheck[] = [
    checkNodeVersion(),
    checkSourceDirectory(options.sourcePath),
    checkOutputDirectory(options.outputPath),
    checkSchemaFile(options.schemaPath),
    checkDocker(),
  ];

  const passed = checks.filter(c => c.status === "pass").length;
  const failed = checks.filter(c => c.status === "fail").length;
  const warnings = checks.filter(c => c.status === "warn").length;

  return {
    checks,
    passed,
    failed,
    warnings,
    canProceed: failed === 0,
  };
}

/**
 * Format preflight report as a human-readable string.
 */
export function formatPreflightReport(report: PreflightReport): string {
  const lines: string[] = ["Pre-flight Check Results", "=".repeat(40)];

  for (const check of report.checks) {
    const icon = check.status === "pass" ? "[OK]" : check.status === "fail" ? "[FAIL]" : "[WARN]";
    lines.push(`  ${icon} ${check.name}: ${check.message}`);
  }

  lines.push("");
  lines.push(`Summary: ${report.passed} passed, ${report.failed} failed, ${report.warnings} warnings`);
  lines.push(report.canProceed ? "Status: Ready to proceed" : "Status: Cannot proceed — fix failures above");

  return lines.join("\n");
}
