import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  MigrationConfigSchema,
  loadMigrationConfig,
  mergeConfigWithArgs,
  expandEnvVars,
} from "../src/migration-config.js";

const TMP_DIR = join(import.meta.dirname, "__tmp_migration_config__");

function writeTmpJson(name: string, obj: unknown): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const p = join(TMP_DIR, name);
  writeFileSync(p, JSON.stringify(obj));
  return p;
}

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("MigrationConfigSchema", () => {
  it("validates correct input", () => {
    const input = {
      source: { type: "wxr", path: "./export.xml" },
      output: { dir: "./out", format: "json" },
    };
    const result = MigrationConfigSchema.parse(input);
    expect(result.source.type).toBe("wxr");
    expect(result.output.dir).toBe("./out");
  });

  it("rejects invalid source type", () => {
    const input = {
      source: { type: "invalid" },
    };
    expect(() => MigrationConfigSchema.parse(input)).toThrow();
  });

  it("applies default values for output", () => {
    const input = {
      source: { type: "php" },
    };
    const result = MigrationConfigSchema.parse(input);
    expect(result.output.dir).toBe("./output");
    expect(result.output.format).toBe("both");
  });

  it("applies default values for features", () => {
    const input = {
      source: { type: "rest-api", url: "https://example.com" },
    };
    const result = MigrationConfigSchema.parse(input);
    expect(result.features.multisite).toBe(false);
    expect(result.features.aiAssist).toBe(false);
  });

  it("rejects unknown keys via strict mode", () => {
    const input = {
      source: { type: "wxr" },
      unknownField: true,
    };
    expect(() => MigrationConfigSchema.parse(input)).toThrow();
  });

  it("accepts optional woocommerce config", () => {
    const input = {
      source: { type: "wxr" },
      woocommerce: { key: "ck_abc", secret: "cs_xyz" },
    };
    const result = MigrationConfigSchema.parse(input);
    expect(result.woocommerce?.key).toBe("ck_abc");
  });
});

describe("expandEnvVars", () => {
  it("replaces ${VAR} with env value", () => {
    process.env.TEST_MIGRATION_VAR = "hello";
    const result = expandEnvVars("value: ${TEST_MIGRATION_VAR}");
    expect(result).toBe("value: hello");
    delete process.env.TEST_MIGRATION_VAR;
  });

  it("replaces missing vars with empty string", () => {
    delete process.env.NONEXISTENT_VAR_XYZ;
    const result = expandEnvVars("key: ${NONEXISTENT_VAR_XYZ}");
    expect(result).toBe("key: ");
  });
});

describe("loadMigrationConfig", () => {
  it("loads and parses a JSON config file", () => {
    const filePath = writeTmpJson("config.json", {
      source: { type: "wxr", path: "./data.xml" },
    });
    const config = loadMigrationConfig(filePath);
    expect(config.source.type).toBe("wxr");
    expect(config.output.dir).toBe("./output");
  });

  it("expands env vars in config file", () => {
    process.env.TEST_WP_PATH = "/var/wp";
    mkdirSync(TMP_DIR, { recursive: true });
    const filePath = join(TMP_DIR, "env-config.json");
    writeFileSync(filePath, '{"source":{"type":"php","path":"${TEST_WP_PATH}/site"}}');
    const config = loadMigrationConfig(filePath);
    expect(config.source.path).toBe("/var/wp/site");
    delete process.env.TEST_WP_PATH;
  });
});

describe("mergeConfigWithArgs", () => {
  it("CLI output overrides config", () => {
    const config = { output: { dir: "./old", format: "json" as const } };
    const result = mergeConfigWithArgs(config, { output: "./new" });
    expect(result.output?.dir).toBe("./new");
  });

  it("CLI format overrides config", () => {
    const config = { output: { dir: "./out", format: "json" as const } };
    const result = mergeConfigWithArgs(config, { format: "markdown" });
    expect(result.output?.format).toBe("markdown");
  });

  it("CLI multisite overrides config", () => {
    const config = { features: { multisite: false, aiAssist: false } };
    const result = mergeConfigWithArgs(config, { multisite: true });
    expect(result.features?.multisite).toBe(true);
  });

  it("CLI aiAssist overrides config", () => {
    const config = { features: { multisite: false, aiAssist: false } };
    const result = mergeConfigWithArgs(config, { aiAssist: true });
    expect(result.features?.aiAssist).toBe(true);
  });

  it("preserves config values when args are absent", () => {
    const config = {
      source: { type: "wxr" as const },
      output: { dir: "./keep", format: "both" as const },
    };
    const result = mergeConfigWithArgs(config, {});
    expect(result.output?.dir).toBe("./keep");
    expect(result.source?.type).toBe("wxr");
  });
});
