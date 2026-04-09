import { describe, it, expect, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { existsSync, rmSync } from "node:fs";

const execFileP = promisify(execFile);

const cliRoot = resolve(import.meta.dirname, "..");
const tsx = resolve(cliRoot, "node_modules/.bin/tsx");
const entry = resolve(cliRoot, "src/index.ts");
const fixtureXml = resolve(cliRoot, "../../fixtures/wxr/minimal.xml");

function run(...args: string[]) {
  return execFileP(tsx, [entry, ...args], {
    cwd: cliRoot,
    timeout: 30_000,
  });
}

/**
 * Run CLI with a minimal env free of vitest variables.
 * vitest 4 virtualises process.env so we provide only essential vars.
 */
function runClean(...args: string[]) {
  return execFileP(tsx, [entry, ...args], {
    cwd: cliRoot,
    timeout: 30_000,
    env: {
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      HOME: process.env.HOME ?? "/tmp",
    },
  });
}

describe("CLI smoke tests", () => {
  const tmpOutput = "/tmp/wp-transfer-smoke-test";

  afterAll(() => {
    for (const ext of [".json", ".md"]) {
      const p = `${tmpOutput}${ext}`;
      if (existsSync(p)) rmSync(p);
    }
  });

  it("--help exits 0 and mentions 'analyze'", async () => {
    const { stdout } = await run("--help");
    expect(stdout).toContain("analyze");
  });

  it("analyze --help exits 0 and mentions source argument", async () => {
    const { stdout } = await run("analyze", "--help");
    expect(stdout).toMatch(/URL|WXR|file/i);
  });

  it("analyze with fixture XML produces JSON output", async () => {
    await runClean(
      "analyze",
      fixtureXml,
      "--output",
      tmpOutput,
      "--format",
      "json",
    );
    // consola may suppress output in CI — verify by file existence
    expect(existsSync(`${tmpOutput}.json`)).toBe(true);
  });

  it("analyze with nonexistent file exits with error", async () => {
    await expect(runClean("analyze", "nonexistent.xml")).rejects.toThrow();
  });
});
