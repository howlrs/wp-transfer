import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  analyzePhpDirectory,
  findBlockingPhpSecrets,
  formatPhpSecretFindings,
  loadAiPhpSource,
  resolvePhpSourcePath,
} from "../src/commands/analyze-php.js";

describe("PHP input secret guard", () => {
  it("reports high and medium findings using metadata only", () => {
    const sources = [
      { fileName: "database.php", content: `<?php\n${["define(", "'DB_PASSWORD'", ", 'do-not-use-this-value');"].join("")}` },
      { fileName: "service.php", content: "<?php\napi_key=\"replace-this-value\"" },
    ];

    const findings = findBlockingPhpSecrets(sources);

    expect(findings).toEqual([
      { fileName: "database.php", type: "wp-db-password", line: 2, severity: "high" },
      { fileName: "service.php", type: "generic-secret", line: 2, severity: "medium" },
    ]);
  });

  it("formats safe output without snippets or source values", () => {
    const sourceValue = "do-not-display-this-value";
    const output = formatPhpSecretFindings([
      { fileName: "database.php", type: "wp-db-password", line: 7, severity: "high" },
    ]);

    expect(output).toBe("database.php: wp-db-password (line 7, high)");
    expect(output).not.toContain(sourceValue);
  });

  it("permits clean PHP sources", () => {
    expect(findBlockingPhpSecrets([
      { fileName: "catalog.php", content: "<?php\n$name = $_POST['name'];" },
    ])).toEqual([]);
  });

  it("permits password hashing and request input plumbing while still blocking literals", () => {
    const findings = findBlockingPhpSecrets([
      {
        fileName: "account.php",
        content: `<?php
$password = password_hash($_POST["password"], PASSWORD_DEFAULT);
$token = $_POST["token"];
`,
      },
      { fileName: "config.php", content: "<?php\nsecret_key='literal-secret-value';" },
    ]);

    expect(findings).toEqual([
      { fileName: "config.php", type: "generic-secret", line: 2, severity: "medium" },
    ]);
  });
});

describe("nested PHP source handling", () => {
  it("analyzes same-basename files independently and maps AI input to each exact source", async () => {
    const inputDir = await mkdtemp(join(tmpdir(), "wp-transfer-nested-"));
    try {
      await mkdir(join(inputDir, "catalog"), { recursive: true });
      await mkdir(join(inputDir, "inventory"), { recursive: true });
      await writeFile(join(inputDir, "catalog", "create.php"), "<?php\n$db->query('INSERT INTO catalog (name) VALUES (?)');", "utf8");
      await writeFile(join(inputDir, "inventory", "create.php"), "<?php\n$db->query('INSERT INTO inventory (sku) VALUES (?)');", "utf8");

      const { analyses } = await analyzePhpDirectory(inputDir);
      expect(analyses).toHaveLength(2);
      expect(analyses.map((analysis) => analysis.fileName)).toEqual(["create.php", "create.php"]);
      expect(analyses.map((analysis) => analysis.sourceRelativePath)).toEqual([
        "catalog/create.php",
        "inventory/create.php",
      ]);

      const aiSources = await Promise.all(analyses.map(analysis => loadAiPhpSource(inputDir, analysis)));
      expect(aiSources).toEqual([
        expect.objectContaining({ phpFilePath: "catalog/create.php", phpSource: expect.stringContaining("catalog") }),
        expect.objectContaining({ phpFilePath: "inventory/create.php", phpSource: expect.stringContaining("inventory") }),
      ]);
    } finally {
      await rm(inputDir, { recursive: true, force: true });
    }
  });

  it("rejects absolute and traversal metadata before an AI source read", () => {
    expect(() => resolvePhpSourcePath("/tmp/php-input", "../outside.php")).toThrow("Unsafe PHP source path");
    expect(() => resolvePhpSourcePath("/tmp/php-input", "/etc/passwd")).toThrow("Unsafe PHP source path");
    expect(() => resolvePhpSourcePath("/tmp/php-input", "nested/../../outside.php")).toThrow("Unsafe PHP source path");
  });

  it("skips PHP symlinks that point outside the input root", async () => {
    const inputDir = await mkdtemp(join(tmpdir(), "wp-transfer-input-"));
    const outsideDir = await mkdtemp(join(tmpdir(), "wp-transfer-outside-"));
    try {
      const outsideSource = join(outsideDir, "outside.php");
      await writeFile(outsideSource, "<?php\n$db->query('INSERT INTO hidden_data (name) VALUES (?)');", "utf8");
      try {
        await symlink(outsideSource, join(inputDir, "linked.php"));
      } catch {
        // Some filesystems disallow symlinks; retain a portable test suite.
        return;
      }

      const { analyses } = await analyzePhpDirectory(inputDir);
      expect(analyses).toEqual([]);
      await expect(loadAiPhpSource(inputDir, {
        fileName: "linked.php",
        sourceRelativePath: "linked.php",
      })).rejects.toThrow("regular file within the input directory");
    } finally {
      await rm(inputDir, { recursive: true, force: true });
      await rm(outsideDir, { recursive: true, force: true });
    }
  });
});
