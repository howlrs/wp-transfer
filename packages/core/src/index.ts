// WordPress data types
export {
  WpPostStatusSchema,
  WpPostTermSchema,
  WpPostSchema,
  WpUserSchema,
  WpTaxonomyTermSchema,
  WpMediaSchema,
} from "./types/wp.js";
export type {
  WpPostStatus,
  WpPostTerm,
  WpPost,
  WpUser,
  WpTaxonomyTerm,
  WpMedia,
} from "./types/wp.js";

// Plugin inventory types
export {
  PluginCategorySchema,
  MigrationStrategySchema,
  PluginEntrySchema,
} from "./types/plugin-inventory.js";
export type {
  PluginCategory,
  MigrationStrategy,
  PluginEntry,
} from "./types/plugin-inventory.js";

// Migration report types
export {
  ThemeInfoSchema,
  CustomPostTypeSchema,
  TaxonomySummarySchema,
  ContentSummarySchema,
  SeveritySchema,
  RiskEntrySchema,
  MigrationPlanSchema,
  MigrationReportSchema,
} from "./types/migration.js";
export type {
  ThemeInfo,
  CustomPostType,
  TaxonomySummary,
  ContentSummary,
  Severity,
  RiskEntry,
  MigrationPlan,
  MigrationReport,
} from "./types/migration.js";

// Portable Text extensions
export type {
  WptPortableTextBlock,
  WptImageBlock,
  WptEmbedBlock,
  WptCodeBlock,
  WptHtmlBlock,
  WptReferenceBlock,
  WptContentBlock,
} from "./types/portable-text.js";

// Security
export { scanForSecrets } from "./security/secret-scanner.js";
export type { SecretMatch } from "./security/secret-scanner.js";

// WooCommerce types
export {
  WooProductTypeSchema,
  WooStockStatusSchema,
  WooProductAttributeSchema,
  WooProductVariationSchema,
  WooProductSchema,
} from "./types/woocommerce.js";
export type {
  WooProductType,
  WooStockStatus,
  WooProductAttribute,
  WooProductVariation,
  WooProduct,
} from "./types/woocommerce.js";

// Multisite types
export {
  MultisiteModeSchema,
  WpSiteSchema,
  MergedUserSchema,
  UserConflictSchema,
  CrossSiteLinkSchema,
  MultisiteNetworkSchema,
  MultisiteConfigSchema,
} from "./types/multisite.js";
export type {
  MultisiteMode,
  WpSite,
  MergedUser,
  UserConflict,
  CrossSiteLink,
  MultisiteNetwork,
  MultisiteConfig,
} from "./types/multisite.js";
