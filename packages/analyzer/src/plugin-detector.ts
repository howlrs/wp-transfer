import type { PluginEntry } from "@wp-transfer/core";
import type { WpRestPlugin } from "./rest-client.js";
import { pluginRegistry } from "./plugin-registry.js";

/**
 * Extract the plugin slug from the REST API plugin path.
 * e.g. "contact-form-7/wp-contact-form-7.php" → "contact-form-7"
 */
function extractSlug(pluginPath: string): string {
  const first = pluginPath.split("/")[0];
  // Single-file plugins: "hello.php" → "hello"
  return first.replace(/\.php$/, "");
}

/**
 * Classify a WordPress plugin from its REST API representation
 * into a structured PluginEntry for the migration report.
 */
export function classifyPlugin(plugin: WpRestPlugin): PluginEntry {
  const slug = extractSlug(plugin.plugin);
  const active = plugin.status === "active";

  // Inactive plugins don't need migration
  if (!active) {
    const registry = pluginRegistry[slug];
    return {
      slug,
      name: plugin.name,
      version: plugin.version,
      active: false,
      category: registry?.category ?? "other",
      migrationStrategy: "not-needed",
      difficulty: registry?.difficulty ?? 1,
      estimatedHours: 0,
    };
  }

  // Known plugin — use registry metadata
  const registry = pluginRegistry[slug];
  if (registry) {
    return {
      slug,
      name: plugin.name,
      version: plugin.version,
      active: true,
      category: registry.category,
      migrationStrategy: registry.migrationStrategy,
      difficulty: registry.difficulty,
      estimatedHours: registry.estimatedHours,
    };
  }

  // Unknown active plugin — needs LLM assistance
  return {
    slug,
    name: plugin.name,
    version: plugin.version,
    active: true,
    category: "other",
    migrationStrategy: "llm-assisted",
    difficulty: 3,
    estimatedHours: 16,
  };
}
