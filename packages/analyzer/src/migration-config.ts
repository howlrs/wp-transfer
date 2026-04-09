/**
 * Migration Configuration
 *
 * Defines and parses migration config from YAML files.
 */
import { z } from "zod";
import { readFileSync } from "node:fs";

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
  woocommerce: z.object({
    key: z.string().optional(),
    secret: z.string().optional(),
  }).optional(),
}).strict();

export type MigrationConfig = z.infer<typeof MigrationConfigSchema>;

// -- Environment variable expansion --

export function expandEnvVars(content: string): string {
  return content.replace(/\$\{(\w+)\}/g, (_match, varName: string) => {
    return process.env[varName] ?? "";
  });
}

// -- Public API --

/**
 * Parse a config file. Supports JSON format with environment variable expansion.
 */
export function loadMigrationConfig(filePath: string): MigrationConfig {
  const raw = readFileSync(filePath, "utf-8");
  const expanded = expandEnvVars(raw);
  const parsed = JSON.parse(expanded) as unknown;
  return MigrationConfigSchema.parse(parsed);
}

/**
 * Merge CLI args over config file values (CLI takes precedence).
 */
export function mergeConfigWithArgs(
  config: Partial<MigrationConfig>,
  args: Record<string, unknown>,
): Partial<MigrationConfig> {
  const merged = { ...config };

  if (args.output && typeof args.output === "string") {
    const prev = merged.output;
    merged.output = { dir: args.output, format: prev?.format ?? "both" };
  }
  if (args.format && typeof args.format === "string") {
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

  return merged;
}
