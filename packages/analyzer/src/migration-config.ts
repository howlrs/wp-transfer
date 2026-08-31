/**
 * Migration Configuration
 *
 * Defines and parses migration config from JSON files.
 */
import { z } from "zod";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

// -- Schema --

export const MigrationConfigSchema = z.object({
  source: z.object({
    type: z.enum(["php", "wxr", "rest-api"]),
    path: z.string().optional(),
    schema: z.string().optional(),
    url: z.string().url().optional(),
  }),
  output: z.object({
    dir: z.string().default("./output"),
    format: z.enum(["json", "markdown", "both"]).default("both"),
  }).default({ dir: "./output", format: "both" }),
  features: z.object({
    multisite: z.boolean().default(false),
    multisiteMode: z.enum(["subpath", "subdomain"]).optional(),
    aiAssist: z.boolean().default(false),
    aiModel: z.string().optional(),
  }).default({ multisite: false, aiAssist: false }),
  templates: z.string().optional(),
  woocommerce: z.object({
    key: z.string().optional(),
    secret: z.string().optional(),
  }).optional(),
}).strict();

export type MigrationConfig = z.infer<typeof MigrationConfigSchema>;

// -- Environment variable expansion --

export function expandEnvVars(value: string): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, varName: string) => {
    return process.env[varName] ?? "";
  });
}

/** Expand environment placeholders in string values only; object keys are data, not templates. */
export function expandEnvVarsInValues(value: unknown): unknown {
  if (typeof value === "string") return expandEnvVars(value);
  if (Array.isArray(value)) return value.map(expandEnvVarsInValues);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, expandEnvVarsInValues(child)]),
    );
  }
  return value;
}

// -- Public API --

/**
 * Parse a config file. Supports JSON format with environment variable expansion.
 */
export function loadMigrationConfig(filePath: string): MigrationConfig {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  return MigrationConfigSchema.parse(expandEnvVarsInValues(parsed));
}

function resolveFromConfigDirectory(configDirectory: string, path: string): string {
  return isAbsolute(path) ? path : resolve(configDirectory, path);
}

/** Resolve paths declared by a config file relative to that config file's directory. */
export function resolveMigrationConfigPaths(
  config: MigrationConfig,
  configPath: string,
): MigrationConfig {
  const configDirectory = dirname(configPath);
  return {
    ...config,
    source: {
      ...config.source,
      ...(config.source.path
        ? { path: resolveFromConfigDirectory(configDirectory, config.source.path) }
        : {}),
      ...(config.source.schema
        ? { schema: resolveFromConfigDirectory(configDirectory, config.source.schema) }
        : {}),
    },
    output: {
      ...config.output,
      dir: resolveFromConfigDirectory(configDirectory, config.output.dir),
    },
    ...(config.templates
      ? { templates: resolveFromConfigDirectory(configDirectory, config.templates) }
      : {}),
  };
}

/**
 * Merge CLI args over config file values (CLI takes precedence).
 */
export function mergeConfigWithArgs(
  config: Partial<MigrationConfig>,
  args: Record<string, unknown>,
): Partial<MigrationConfig> {
  const merged = { ...config };

  if (typeof args.output === "string") {
    const prev = merged.output;
    merged.output = { dir: args.output, format: prev?.format ?? "both" };
  }
  if (typeof args.format === "string") {
    const prev = merged.output;
    merged.output = { dir: prev?.dir ?? "./output", format: args.format as "json" | "markdown" | "both" };
  }
  if (args.multisite !== undefined) {
    const prev = merged.features;
    merged.features = {
      multisite: Boolean(args.multisite),
      aiAssist: prev?.aiAssist ?? false,
      multisiteMode: prev?.multisiteMode,
      aiModel: prev?.aiModel,
    };
  }
  if (args.aiAssist !== undefined) {
    const prev = merged.features;
    merged.features = {
      multisite: prev?.multisite ?? false,
      aiAssist: Boolean(args.aiAssist),
      multisiteMode: prev?.multisiteMode,
      aiModel: prev?.aiModel,
    };
  }
  if (typeof args.aiModel === "string") {
    const prev = merged.features;
    merged.features = {
      multisite: prev?.multisite ?? false,
      aiAssist: prev?.aiAssist ?? false,
      multisiteMode: prev?.multisiteMode,
      aiModel: args.aiModel,
    };
  }
  if (typeof args.schema === "string" && merged.source) {
    merged.source = { ...merged.source, schema: args.schema };
  }
  if (typeof args.templates === "string") {
    merged.templates = args.templates;
  }

  return merged;
}
