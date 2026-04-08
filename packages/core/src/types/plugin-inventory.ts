import { z } from "zod";

export const PluginCategorySchema = z.enum([
  "forms",
  "seo",
  "ecommerce",
  "security",
  "performance",
  "media",
  "social",
  "analytics",
  "backup",
  "multilingual",
  "page-builder",
  "membership",
  "lms",
  "email",
  "custom-fields",
  "other",
]);

export type PluginCategory = z.infer<typeof PluginCategorySchema>;

export const MigrationStrategySchema = z.enum([
  "automated",
  "template",
  "llm-assisted",
  "manual",
  "not-needed",
]);

export type MigrationStrategy = z.infer<typeof MigrationStrategySchema>;

export const PluginEntrySchema = z.object({
  slug: z.string(),
  name: z.string(),
  version: z.string().optional(),
  active: z.boolean(),
  category: PluginCategorySchema,
  migrationStrategy: MigrationStrategySchema,
  difficulty: z.number().int().min(1).max(5),
  estimatedHours: z.number(),
  notes: z.string().optional(),
  templateId: z.string().optional(),
  wpOrgUrl: z.string().optional(),
});

export type PluginEntry = z.infer<typeof PluginEntrySchema>;
