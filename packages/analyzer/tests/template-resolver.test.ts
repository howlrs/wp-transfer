import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveTemplate } from "../src/template-resolver.js";

describe("resolveTemplate", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "tmpl-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns original content when no template dir specified", async () => {
    const result = await resolveTemplate(undefined, {
      path: "app/page.tsx",
      content: "original",
    });
    expect(result).toBe("original");
  });

  it("returns original content when template dir has no matching file", async () => {
    const result = await resolveTemplate(tempDir, {
      path: "app/page.tsx",
      content: "original",
    });
    expect(result).toBe("original");
  });

  it("returns template content when matching file exists", async () => {
    await mkdir(join(tempDir, "app"), { recursive: true });
    await writeFile(join(tempDir, "app/page.tsx"), "custom template", "utf-8");

    const result = await resolveTemplate(tempDir, {
      path: "app/page.tsx",
      content: "original",
    });
    expect(result).toBe("custom template");
  });

  it("handles nested paths correctly", async () => {
    await mkdir(join(tempDir, "app/admin/dashboard"), { recursive: true });
    await writeFile(
      join(tempDir, "app/admin/dashboard/page.tsx"),
      "custom dashboard",
      "utf-8",
    );

    const result = await resolveTemplate(tempDir, {
      path: "app/admin/dashboard/page.tsx",
      content: "original dashboard",
    });
    expect(result).toBe("custom dashboard");
  });

  it("rejects path traversal with ../", async () => {
    const result = await resolveTemplate(tempDir, {
      path: "../../../etc/passwd",
      content: "original",
    });
    expect(result).toBe("original");
  });

  it("rejects path traversal with embedded ../", async () => {
    const result = await resolveTemplate(tempDir, {
      path: "app/../../etc/passwd",
      content: "original",
    });
    expect(result).toBe("original");
  });

  it("rejects absolute paths", async () => {
    const result = await resolveTemplate(tempDir, {
      path: "/etc/passwd",
      content: "original",
    });
    expect(result).toBe("original");
  });
});
