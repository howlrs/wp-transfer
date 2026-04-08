import type {
  PluginEntry,
  MigrationPlan,
  MigrationReport,
} from "@wp-transfer/core";
import type { SchemaAnalysisResult } from "./schema-analyzer.js";
import type { CostEstimate } from "./cost-estimator.js";

// ── Types ──────────────────────────────────────────────────────────

export interface ReportInput {
  siteUrl: string;
  wpVersion: string;
  phpVersion?: string;
  themeName: string;
  themeVersion?: string;
  isChildTheme: boolean;
  schema: SchemaAnalysisResult;
  plugins: PluginEntry[];
  userCount: number;
  cost: CostEstimate;
}

// ── Helpers ────────────────────────────────────────────────────────

function buildMigrationPlan(plugins: PluginEntry[]): MigrationPlan {
  const automated: string[] = [];
  const template: string[] = [];
  const llmAssisted: string[] = [];
  const manual: string[] = [];

  for (const plugin of plugins) {
    if (!plugin.active || plugin.migrationStrategy === "not-needed") continue;

    const label = `${plugin.name} (${plugin.slug})`;
    switch (plugin.migrationStrategy) {
      case "automated":
        automated.push(label);
        break;
      case "template":
        template.push(label);
        break;
      case "llm-assisted":
        llmAssisted.push(label);
        break;
      case "manual":
        manual.push(label);
        break;
    }
  }

  return { automated, template, llmAssisted, manual };
}

function wpVersionCompatibilityNote(wpVersion: string): string | undefined {
  const major = parseFloat(wpVersion);
  if (Number.isNaN(major)) return undefined;

  if (major < 4.1) return "WXR 1.0/1.1 — custom post types and term meta may be unavailable.";
  if (major < 4.7) return "WXR 1.2 supported. No REST API — WXR-only analysis.";
  if (major < 5.0) return "WXR 1.2 + REST API v2. Classic editor only (no Gutenberg blocks).";
  if (major < 6.0) return "WXR 1.2 + REST API v2 + Gutenberg block editor.";
  return "WXR 1.2 + REST API v2 + Full Site Editing. Full feature support.";
}

function difficultyStars(n: number): string {
  const clamped = Math.max(0, Math.min(5, Math.round(n)));
  return "\u2605".repeat(clamped) + "\u2606".repeat(5 - clamped);
}

// ── Main ───────────────────────────────────────────────────────────

export function generateReport(input: ReportInput): MigrationReport {
  const migrationPlan = buildMigrationPlan(input.plugins);

  return {
    generatedAt: new Date().toISOString(),
    siteUrl: input.siteUrl,
    wpVersion: input.wpVersion,
    phpVersion: input.phpVersion,
    theme: {
      name: input.themeName,
      version: input.themeVersion,
      isChild: input.isChildTheme,
    },
    contentSummary: input.schema.contentSummary,
    plugins: input.plugins,
    migrationPlan,
    estimatedTotalHours: input.cost.totalHours,
    risks: input.cost.risks,
  };
}

export function reportToMarkdown(report: MigrationReport): string {
  const lines: string[] = [];

  // ─ Title ─
  lines.push(`# Migration Report: ${report.siteUrl}`);
  lines.push("");
  lines.push(`> Generated: ${report.generatedAt}`);
  lines.push("");

  // ─ Site Profile ─
  lines.push("## Site Profile");
  lines.push("");
  lines.push(`| Property | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| WordPress Version | ${report.wpVersion} |`);
  if (report.phpVersion) {
    lines.push(`| PHP Version | ${report.phpVersion} |`);
  }
  lines.push(`| Theme | ${report.theme.name}${report.theme.version ? ` v${report.theme.version}` : ""} |`);
  lines.push(`| Child Theme | ${report.theme.isChild ? "Yes" : "No"} |`);
  const compatNote = wpVersionCompatibilityNote(report.wpVersion);
  if (compatNote) {
    lines.push("");
    lines.push(`> **Compatibility**: ${compatNote}`);
  }
  lines.push("");

  // ─ Content Summary ─
  lines.push("## Content Summary");
  lines.push("");
  lines.push(`| Content Type | Count |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Posts | ${report.contentSummary.posts} |`);
  lines.push(`| Pages | ${report.contentSummary.pages} |`);
  lines.push(`| Media | ${report.contentSummary.media} |`);
  lines.push(`| Users | ${report.contentSummary.users} |`);

  for (const cpt of report.contentSummary.customPostTypes) {
    lines.push(`| ${cpt.name} (CPT) | ${cpt.count} |`);
  }

  if (report.contentSummary.taxonomies.length > 0) {
    lines.push("");
    lines.push("### Taxonomies");
    lines.push("");
    lines.push(`| Taxonomy | Terms | Hierarchical |`);
    lines.push(`| --- | --- | --- |`);
    for (const tax of report.contentSummary.taxonomies) {
      lines.push(
        `| ${tax.name} | ${tax.count} | ${tax.hierarchical ? "Yes" : "No"} |`,
      );
    }
  }
  lines.push("");

  // ─ Plugin Inventory ─
  lines.push("## Plugin Inventory");
  lines.push("");

  if (report.plugins.length === 0) {
    lines.push("No plugins detected.");
  } else {
    lines.push(
      `| Plugin | Status | Strategy | Difficulty | Est. Hours |`,
    );
    lines.push(`| --- | --- | --- | --- | --- |`);
    for (const p of report.plugins) {
      const status = p.active ? "Active" : "Inactive";
      lines.push(
        `| ${p.name} | ${status} | ${p.migrationStrategy} | ${difficultyStars(p.difficulty)} | ${p.estimatedHours}h |`,
      );
    }
  }
  lines.push("");

  // ─ Migration Plan ─
  lines.push("## Migration Plan");
  lines.push("");

  const plan = report.migrationPlan;
  if (plan.automated.length > 0) {
    lines.push("### Automated");
    for (const item of plan.automated) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  if (plan.template.length > 0) {
    lines.push("### Template-based");
    for (const item of plan.template) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  if (plan.llmAssisted.length > 0) {
    lines.push("### LLM-assisted");
    for (const item of plan.llmAssisted) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  if (plan.manual.length > 0) {
    lines.push("### Manual");
    for (const item of plan.manual) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  // ─ Estimated Effort ─
  lines.push("## Estimated Effort");
  lines.push("");
  lines.push(`**Total: ${report.estimatedTotalHours} hours**`);
  lines.push("");

  // ─ Risks ─
  lines.push("## Risks");
  lines.push("");

  if (report.risks.length === 0) {
    lines.push("No significant risks identified.");
  } else {
    lines.push(`| Area | Severity | Description |`);
    lines.push(`| --- | --- | --- |`);
    for (const risk of report.risks) {
      lines.push(`| ${risk.area} | ${risk.severity} | ${risk.description} |`);
    }
  }
  lines.push("");

  return lines.join("\n");
}
