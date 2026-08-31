import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSafeOutputFile } from "../src/commands/analyze-php.js";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "wp-transfer-safe-output-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("writeSafeOutputFile", () => {
  it("rejects a symlinked output subdirectory without writing outside the root", async () => {
    const directory = temporaryDirectory();
    const output = join(directory, "output");
    const outside = join(directory, "outside");
    mkdirSync(output);
    mkdirSync(outside);
    symlinkSync(outside, join(output, "app"));

    await expect(writeSafeOutputFile(output, "app/route.ts", "blocked")).rejects.toThrow("Unsafe output directory component");
    expect(existsSync(join(outside, "route.ts"))).toBe(false);
  });

  it("rejects a symlinked target file without overwriting its destination", async () => {
    const directory = temporaryDirectory();
    const output = join(directory, "output");
    const outsideFile = join(directory, "outside.txt");
    mkdirSync(output);
    writeFileSync(outsideFile, "original");
    symlinkSync(outsideFile, join(output, "report.md"));

    await expect(writeSafeOutputFile(output, "report.md", "blocked")).rejects.toThrow("Unsafe output target");
    expect(readFileSync(outsideFile, "utf8")).toBe("original");
  });

  it("writes through an existing normal directory", async () => {
    const directory = temporaryDirectory();
    const output = join(directory, "output");
    mkdirSync(join(output, "app"), { recursive: true });

    await writeSafeOutputFile(output, "app/route.ts", "safe");
    expect(readFileSync(join(output, "app", "route.ts"), "utf8")).toBe("safe");
  });

  it("rejects traversal paths", async () => {
    const directory = temporaryDirectory();
    const output = join(directory, "output");

    await expect(writeSafeOutputFile(output, "../outside.txt", "blocked")).rejects.toThrow("Unsafe output path");
    expect(existsSync(join(directory, "outside.txt"))).toBe(false);
  });
});
