/**
 * Run Command — one-command migration verification
 *
 * Runs a generated Next.js project end-to-end:
 * npm ci → docker compose up → prisma migrate → seed → playwright test
 */
import { defineCommand } from "citty";
import { consola } from "consola";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

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
    consola.fail(name);
    return false;
  }
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

    const steps: Array<{ name: string; command: string; optional?: boolean; skip?: boolean }> = [
      { name: "[1/5] Installing dependencies...", command: "npm ci" },
      { name: "[2/5] Starting Docker services...", command: "docker compose up -d --wait", optional: true, skip: args["no-docker"] as boolean },
      { name: "[3/5] Running database migration...", command: "npx prisma migrate deploy" },
      { name: "[4/5] Seeding test data...", command: "npx prisma db seed", optional: true },
      { name: "[5/5] Running tests...", command: "npx playwright test", skip: args["no-test"] as boolean },
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
