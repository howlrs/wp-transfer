import { z } from "zod";
import { PluginEntrySchema } from "./plugin-inventory.js";

export const ThemeInfoSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  isChild: z.boolean(),
  parentTheme: z.string().optional(),
  templateEngine: z.string().optional(),
});

export type ThemeInfo = z.infer<typeof ThemeInfoSchema>;

export const CustomPostTypeSchema = z.object({
  slug: z.string(),
  name: z.string(),
  count: z.number(),
  hasArchive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export type CustomPostType = z.infer<typeof CustomPostTypeSchema>;

export const TaxonomySummarySchema = z.object({
  slug: z.string(),
  name: z.string(),
  count: z.number(),
  hierarchical: z.boolean(),
});

export type TaxonomySummary = z.infer<typeof TaxonomySummarySchema>;

export const ContentSummarySchema = z.object({
  posts: z.number(),
  pages: z.number(),
  customPostTypes: z.array(CustomPostTypeSchema),
  media: z.number(),
  users: z.number(),
  taxonomies: z.array(TaxonomySummarySchema),
});

export type ContentSummary = z.infer<typeof ContentSummarySchema>;

export const SeveritySchema = z.enum(["low", "medium", "high"]);

export type Severity = z.infer<typeof SeveritySchema>;

export const RiskEntrySchema = z.object({
  area: z.string(),
  description: z.string(),
  severity: SeveritySchema,
  mitigation: z.string(),
});

export type RiskEntry = z.infer<typeof RiskEntrySchema>;

export const MigrationPlanSchema = z.object({
  automated: z.array(z.string()),
  template: z.array(z.string()),
  llmAssisted: z.array(z.string()),
  manual: z.array(z.string()),
});

export type MigrationPlan = z.infer<typeof MigrationPlanSchema>;

export const MigrationReportSchema = z.object({
  generatedAt: z.string(),
  siteUrl: z.string(),
  wpVersion: z.string(),
  phpVersion: z.string().optional(),
  theme: ThemeInfoSchema,
  contentSummary: ContentSummarySchema,
  plugins: z.array(PluginEntrySchema),
  migrationPlan: MigrationPlanSchema,
  estimatedTotalHours: z.number(),
  risks: z.array(RiskEntrySchema),
});

export type MigrationReport = z.infer<typeof MigrationReportSchema>;
