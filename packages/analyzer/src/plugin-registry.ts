import type { PluginCategory, MigrationStrategy } from "@wp-transfer/core";

export interface PluginRegistryEntry {
  category: PluginCategory;
  migrationStrategy: MigrationStrategy;
  difficulty: number;
  estimatedHours: number;
}

export const pluginRegistry: Record<string, PluginRegistryEntry> = {
  "advanced-custom-fields": {
    category: "custom-fields",
    migrationStrategy: "template",
    difficulty: 3,
    estimatedHours: 16,
  },
  "advanced-custom-fields-pro": {
    category: "custom-fields",
    migrationStrategy: "template",
    difficulty: 3,
    estimatedHours: 20,
  },
  "wordpress-seo": {
    category: "seo",
    migrationStrategy: "template",
    difficulty: 2,
    estimatedHours: 8,
  },
  "seo-by-rank-math": {
    category: "seo",
    migrationStrategy: "template",
    difficulty: 2,
    estimatedHours: 8,
  },
  "contact-form-7": {
    category: "forms",
    migrationStrategy: "template",
    difficulty: 3,
    estimatedHours: 12,
  },
  "wpforms-lite": {
    category: "forms",
    migrationStrategy: "template",
    difficulty: 3,
    estimatedHours: 12,
  },
  woocommerce: {
    category: "ecommerce",
    migrationStrategy: "manual",
    difficulty: 5,
    estimatedHours: 120,
  },
  elementor: {
    category: "page-builder",
    migrationStrategy: "manual",
    difficulty: 5,
    estimatedHours: 80,
  },
  js_composer: {
    category: "page-builder",
    migrationStrategy: "manual",
    difficulty: 5,
    estimatedHours: 80,
  },
  "wp-mail-smtp": {
    category: "email",
    migrationStrategy: "template",
    difficulty: 1,
    estimatedHours: 2,
  },
  wordfence: {
    category: "security",
    migrationStrategy: "not-needed",
    difficulty: 1,
    estimatedHours: 0,
  },
  "sitepress-multilingual-cms": {
    category: "multilingual",
    migrationStrategy: "template",
    difficulty: 4,
    estimatedHours: 40,
  },
  polylang: {
    category: "multilingual",
    migrationStrategy: "template",
    difficulty: 3,
    estimatedHours: 24,
  },
  "google-analytics-for-wordpress": {
    category: "analytics",
    migrationStrategy: "automated",
    difficulty: 1,
    estimatedHours: 1,
  },
  "all-in-one-seo-pack": {
    category: "seo",
    migrationStrategy: "template",
    difficulty: 2,
    estimatedHours: 8,
  },
  akismet: {
    category: "security",
    migrationStrategy: "not-needed",
    difficulty: 1,
    estimatedHours: 0,
  },
  "hello-dolly": {
    category: "other",
    migrationStrategy: "not-needed",
    difficulty: 1,
    estimatedHours: 0,
  },
  pods: {
    category: "custom-fields",
    migrationStrategy: "manual",
    difficulty: 4,
    estimatedHours: 24,
  },
};
