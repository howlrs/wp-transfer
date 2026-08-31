import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createFixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "wp-transfer-hygiene-"));
  temporaryDirectories.push(root);
  mkdirSync(join(root, "scripts"));
  cpSync(join(scriptDirectory, "check-repository-hygiene.mjs"), join(root, "scripts/check-repository-hygiene.mjs"));

  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
  }

  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  return root;
}

function runCheck(root: string, extraEnvironment: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["scripts/check-repository-hygiene.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...extraEnvironment },
  });
}

describe("check-repository-hygiene", () => {
  it("reports a likely credential type without printing the value", () => {
    const token = ["gh", "p_", "A".repeat(36)].join("");
    const root = createFixture({ "docs/config.txt": `credential=${token}\n` });

    const result = runCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("docs/config.txt: likely credential (github-token)");
    expect(result.stderr).not.toContain(token);
  });

  it("does not let a generic-secret fixture path bypass a specific key pattern", () => {
    const accessKey = ["AK", "IA", "A".repeat(16)].join("");
    const root = createFixture({
      "packages/core/tests/secret-scanner.test.ts": `const fixture = "${accessKey}";\n`,
    });

    const result = runCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("packages/core/tests/secret-scanner.test.ts: likely credential (aws-access-key)");
    expect(result.stderr).not.toContain(accessKey);
  });

  it("applies the private denylist to both paths and text content", () => {
    const term = ["private", "-customer"].join("");
    const root = createFixture({
      "private-customer.txt": "synthetic fixture\n",
      "docs/notes.txt": "Private-Customer synthetic note\n",
    });

    const result = runCheck(root, { WP_TRANSFER_FORBIDDEN_TERMS: term });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("private-customer.txt: prohibited path");
    expect(result.stderr).toContain("docs/notes.txt: prohibited content");
  });
});
