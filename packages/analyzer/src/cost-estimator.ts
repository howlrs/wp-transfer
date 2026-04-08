import type { PluginEntry, RiskEntry } from "@wp-transfer/core";

// ── Types ──────────────────────────────────────────────────────────

export interface CostBreakdown {
  contentMigration: number;
  pluginMigration: number;
  themeMigration: number;
  testing: number;
  deployment: number;
}

export interface CostEstimate {
  totalHours: number;
  breakdown: CostBreakdown;
  risks: RiskEntry[];
}

// ── Main ───────────────────────────────────────────────────────────

export function estimateCost(
  postCount: number,
  mediaCount: number,
  plugins: PluginEntry[],
  hasCustomPostTypes: boolean,
): CostEstimate {
  // Content migration
  const contentMigration =
    4 + Math.ceil(postCount / 500) * 2 + Math.ceil(mediaCount / 1000) * 2;

  // Plugin migration: sum estimatedHours for active plugins (exclude not-needed)
  const pluginMigration = plugins
    .filter((p) => p.active && p.migrationStrategy !== "not-needed")
    .reduce((sum, p) => sum + p.estimatedHours, 0);

  // Theme migration: 16h base
  const themeMigration = 16;

  // Subtotal for testing calculation
  const subtotal = contentMigration + pluginMigration + themeMigration;

  // Testing: 20% of subtotal
  const testing = Math.ceil(subtotal * 0.2);

  // Deployment: 8h flat
  const deployment = 8;

  const totalHours =
    contentMigration + pluginMigration + themeMigration + testing + deployment;

  // ─ Risk assessment ─
  const risks: RiskEntry[] = [];

  const hasEcommerce = plugins.some(
    (p) => p.active && p.category === "ecommerce",
  );
  if (hasEcommerce) {
    risks.push({
      area: "E-commerce",
      description:
        "WooCommerce or similar e-commerce plugin detected. Product data, orders, and payment integrations require careful migration.",
      severity: "high",
      mitigation:
        "Plan phased migration. Migrate product catalog first, then order history. Use staging environment for payment gateway testing.",
    });
  }

  const hasPageBuilder = plugins.some(
    (p) => p.active && p.category === "page-builder",
  );
  if (hasPageBuilder) {
    risks.push({
      area: "Page Builder",
      description:
        "Page builder plugin detected. Content is stored in proprietary shortcode/block format that needs manual conversion.",
      severity: "high",
      mitigation:
        "Export page builder content early and prototype conversion for the most complex pages first.",
    });
  }

  if (hasCustomPostTypes) {
    risks.push({
      area: "Custom Post Types",
      description:
        "Custom post types detected. These require custom content models and migration logic in the target CMS.",
      severity: "medium",
      mitigation:
        "Map each custom post type to a Next.js content model. Validate field mapping with sample records before full migration.",
    });
  }

  if (postCount > 10000) {
    risks.push({
      area: "Large Site",
      description: `Site has ${postCount.toLocaleString()} posts. Large data volumes increase migration time and risk of data inconsistency.`,
      severity: "medium",
      mitigation:
        "Use incremental migration with checkpointing. Validate record counts and content integrity at each stage.",
    });
  }

  return {
    totalHours,
    breakdown: {
      contentMigration,
      pluginMigration,
      themeMigration,
      testing,
      deployment,
    },
    risks,
  };
}
