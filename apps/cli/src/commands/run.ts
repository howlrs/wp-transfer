/**
 * Run Command — one-command migration verification
 *
 * Runs a generated Next.js project end-to-end:
 * npm install → docker compose up → prisma generate → prisma db push → seed → playwright test
 */
import { defineCommand } from "citty";
import { consola } from "consola";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/* ── Task 12: Error Recovery Guidance ── */

const ERROR_GUIDANCE: Record<string, string> = {
  "EADDRINUSE": "Port already in use. Run: docker compose down && docker compose up -d --wait",
  "P1001": "Database connection failed. Check: docker compose ps, verify DB is healthy",
  "P3009": "Migration failed. Run: npx prisma migrate reset (WARNING: drops data)",
  "ENOENT": "Command not found. Run: npm ci to install dependencies",
  "ENOMEM": "Out of memory. Increase Docker memory limit in Docker Desktop settings",
};

function getErrorGuidance(error: Error): string | undefined {
  const msg = error.message;
  for (const [pattern, guidance] of Object.entries(ERROR_GUIDANCE)) {
    if (msg.includes(pattern)) return guidance;
  }
  return undefined;
}

function runStep(name: string, command: string, cwd: string, optional = false): boolean {
  consola.start(name);
  try {
    execSync(command, { cwd, stdio: "inherit", timeout: 300_000 });
    consola.success(name);
    return true;
  } catch (error) {
    if (optional) {
      consola.warn(`${name} (skipped: ${(error as Error).message})`);
      return true;
    }
    const guidance = getErrorGuidance(error as Error);
    if (guidance) {
      consola.info(`Recovery hint: ${guidance}`);
    }
    consola.fail(name);
    return false;
  }
}

/* ── Task 11: Migration Coverage Report ── */

export interface CoverageInput {
  phpScripts: number;
  testsGenerated: number;
  testsPassed: number;
  testsFailed: number;
  domains: Array<{
    name: string;
    scripts: number;
    tested: number;
    passed: number;
  }>;
}

export function generateCoverageReport(input: CoverageInput): string {
  const coverage = Math.round((input.testsGenerated / input.phpScripts) * 100);
  const passRate = input.testsGenerated > 0
    ? Math.round((input.testsPassed / input.testsGenerated) * 100)
    : 0;

  const domainRows = input.domains
    .map((d) => `| ${d.name} | ${d.scripts} | ${d.tested} | ${d.passed} | ${d.scripts === d.passed ? "OK" : "NG"} |`)
    .join("\n");

  return `# Migration Coverage Report

## Summary
- **PHP Scripts**: ${input.phpScripts}
- **Tests Generated**: ${input.testsGenerated} (${coverage}%)
- **Tests Passed**: ${input.testsPassed} / ${input.testsGenerated} (${passRate}%)
- **Tests Failed**: ${input.testsFailed}

## Domain Breakdown

| Domain | Scripts | Tested | Passed | Status |
|--------|---------|--------|--------|--------|
${domainRows}

## Verdict
${coverage >= 100 && passRate >= 100 ? "COMPLETE — All scripts tested and passing" : `INCOMPLETE — Coverage ${coverage}%, Pass rate ${passRate}%`}
`;
}

export const runCommand = defineCommand({
  meta: {
    name: "run",
    description: "Run generated project: install → docker → migrate → seed → test",
  },
  args: {
    dir: {
      type: "positional",
      description: "Path to generated project directory",
      required: true,
    },
    "no-docker": {
      type: "boolean",
      description: "Skip Docker Compose (use existing database)",
      default: false,
    },
    "no-test": {
      type: "boolean",
      description: "Skip Playwright tests",
      default: false,
    },
    open: {
      type: "boolean",
      description: "Open test report in browser after completion",
      default: false,
    },
  },
  run: async ({ args }) => {
    const projectDir = resolve(args.dir);

    if (!existsSync(projectDir)) {
      consola.error(`Directory not found: ${projectDir}`);
      process.exit(1);
    }

    if (!existsSync(resolve(projectDir, "package.json"))) {
      consola.error(`No package.json found in ${projectDir}. Run analyze-php first.`);
      process.exit(1);
    }

    consola.box(`wp-transfer run\n${projectDir}`);

    // Set DATABASE_URL for host-side Prisma operations (replace Docker hostname with localhost)
    if (!args["no-docker"]) {
      // Copy .env.example to .env if .env doesn't exist
      const envPath = resolve(projectDir, ".env");
      const envExamplePath = resolve(projectDir, ".env.example");
      if (!existsSync(envPath) && existsSync(envExamplePath)) {
        const { copyFileSync } = await import("node:fs");
        copyFileSync(envExamplePath, envPath);
        consola.info("Created .env from .env.example");
      }
      if (existsSync(envPath)) {
        const envContent = readFileSync(envPath, "utf-8");
        const dbUrlMatch = envContent.match(/DATABASE_URL="?([^"\n]+)"?/);
        if (dbUrlMatch) {
          // Replace Docker service hostname (e.g., @db:) with @localhost:
          const hostUrl = dbUrlMatch[1]!.replace(/@[a-zA-Z_-]+:(\d+)/, "@localhost:$1");
          process.env["DATABASE_URL"] = hostUrl;
          consola.info(`Database URL: ${hostUrl.replace(/:[^:@]+@/, ":***@")}`);
        }
      }
    }

    const steps: Array<{ name: string; command: string; optional?: boolean; skip?: boolean }> = [
      { name: "[1/6] Installing dependencies...", command: "npm install" },
      { name: "[2/6] Starting Docker services...", command: "docker compose up -d --wait", optional: true, skip: args["no-docker"] as boolean },
      { name: "[3/6] Generating Prisma client...", command: "npx prisma generate" },
      { name: "[4/6] Pushing database schema...", command: "npx prisma db push --accept-data-loss" },
      { name: "[5/6] Seeding test data...", command: "npx prisma db seed", optional: true },
      { name: "[6/6] Running tests...", command: "npx playwright test", skip: args["no-test"] as boolean },
    ];

    let passed = 0;
    let failed = 0;

    for (const step of steps) {
      if (step.skip) {
        consola.info(`${step.name} (skipped)`);
        continue;
      }
      const ok = runStep(step.name, step.command, projectDir, step.optional);
      if (ok) passed++;
      else {
        failed++;
        consola.error(`Failed at: ${step.name}`);
        consola.error("Fix the issue and re-run.");
        process.exit(1);
      }
    }

    consola.box([
      "=== Migration Verification Complete ===",
      `Steps: ${passed} passed, ${failed} failed`,
      `Report: ${projectDir}/test-results/index.html`,
      args["no-docker"] ? "" : `Docker: http://localhost:3000 (running)`,
    ].filter(Boolean).join("\n"));

    if (args.open && !args["no-test"]) {
      try {
        execSync(`npx playwright show-report ${projectDir}/test-results`, { cwd: projectDir, stdio: "inherit" });
      } catch {
        // show-report may not be available
      }
    }
  },
});
