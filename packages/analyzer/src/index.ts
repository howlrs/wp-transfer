export {
  createWpRestClient,
  validateUrl,
  type WpRestAuth,
  type WpSiteInfo,
  type WpRestPlugin,
  type WpRestPostType,
  type WpRestClient,
  type WpRestClientOptions,
  type HostnameResolver,
} from "./rest-client.js";

export {
  classifyPlugin,
} from "./plugin-detector.js";

export {
  pluginRegistry,
  type PluginRegistryEntry,
} from "./plugin-registry.js";

export {
  analyzeSchema,
  type AcfFieldInfo,
  type InferredType,
  type SchemaAnalysisResult,
} from "./schema-analyzer.js";

export {
  estimateCost,
  type CostEstimate,
  type CostBreakdown,
} from "./cost-estimator.js";

export {
  generateReport,
  reportToMarkdown,
  type ReportInput,
} from "./report-generator.js";

export {
  analyzePhpFile,
  extractWpVersionFromPhp,
  type PhpFileAnalysis,
  type PhpVersionHint,
  type DbOperation,
  type InputParam,
} from "./php-analyzer.js";

export {
  parseDbSchemaMarkdown,
  generatePrismaSchema,
  parseSchemaToPrisma,
  type PrismaSchemaResult,
  type TableDefinition,
  type ColumnDefinition,
} from "./schema-to-prisma.js";

export {
  generateApiStubs,
  inferRouteMapping,
  routeResourcePath,
  type RouteMapping,
  type GenerateApiStubsOptions,
} from "./nextjs-stub-generator.js";

export {
  toCamelCase,
  toPascalCase,
  toPrismaModelName,
  toPascalModelName,
  toSchemaName,
  pluralizeResource,
  fieldTypeToInputType,
} from "./generator-utils.js";

export {
  generateAdminScaffold,
  type AdminPage,
  type UiFramework,
  type AdminScaffoldOptions,
} from "./admin-scaffold-generator.js";

export {
  generateAuthScaffold,
  isAuthPluginDetected,
  ADMIN_USER_PRISMA_MODEL,
  type AuthScaffoldFile,
  type AuthScaffoldOptions,
} from "./auth-scaffold-generator.js";

export {
  generateDockerScaffold,
  type DockerScaffoldFile,
} from "./docker-scaffold-generator.js";

export {
  parseGutenbergBlocks,
  type GutenbergBlock,
} from "./gutenberg-parser.js";

export {
  convertBlocksToPortableText,
} from "./block-converter.js";

export {
  extractYoastMeta,
  extractSeoMeta,
  resolveYoastPlaceholders,
  generateYoastMetadataCode,
  type YoastMeta,
  type YoastPlaceholderContext,
} from "./yoast-extractor.js";

export {
  generateAcfTemplate,
  type AcfTemplateResult,
} from "./acf-template-generator.js";

export {
  extractAcfFieldGroups,
  type AcfFieldDefinition,
  type AcfLayoutDefinition,
  type AcfFieldGroup,
} from "./acf-field-extractor.js";

export {
  generateBlogScaffold,
  type BlogScaffoldInput,
  type BlogPostInfo,
  type CategoryInfo,
  type ScaffoldFile,
} from "./blog-scaffold-generator.js";

export {
  generateVerifyScaffold,
  type VerifyInput,
  type VerifyScaffoldFile,
  type PhpAnalysisSummary,
  type PhpDbOp,
  type TableInfo,
  type TableColumn,
} from "./verify-generator.js";

export {
  isValidJsIdentifier,
  toSafeIdentifier,
  escapeForStringLiteral,
  sanitizeUrl,
  sanitizeSlug,
  isValidHostname,
  isPathSafe,
} from "./sanitize.js";

export {
  phpUnserialize,
} from "./php-serialize.js";

export {
  transformProducts,
} from "./product-transformer.js";

export {
  generateWooPrismaSchema,
} from "./woo-prisma-generator.js";

export {
  generateWooScaffold,
  type WooScaffoldInput,
} from "./woo-scaffold-generator.js";

export {
  detectI18n,
  type I18nDetectionResult,
} from "./i18n-detector.js";

export {
  generateI18nScaffold,
  type I18nScaffoldInput,
} from "./i18n-scaffold-generator.js";

export {
  detectMultisite,
} from "./multisite-detector.js";

export {
  mergeUsers,
  type UserMergeResult,
} from "./user-merger.js";

export {
  normalizeMedia,
  type MediaNormalizeResult,
  type RemotePattern,
} from "./media-normalizer.js";

export {
  rewriteCrossSiteUrls,
  type RewriteResult,
} from "./cross-site-url-rewriter.js";

export {
  generateMultisitePrismaSchema,
} from "./multisite-prisma-generator.js";

export {
  generateMultisiteScaffold,
  type MultisiteScaffoldInput,
} from "./multisite-scaffold-generator.js";

export {
  resolveTemplate,
  type ScaffoldFileInput,
} from "./template-resolver.js";

export {
  detectPageBuilder,
  type PageBuilderAnalysis,
} from "./page-builder-detector.js";

export {
  detectMetaBox,
  type MetaBoxDetectionResult,
  type MetaBoxField,
} from "./metabox-detector.js";

export {
  detectPods,
  type PodsDetectionResult,
} from "./pods-detector.js";

export {
  createWooRestClient,
  normalizeOrder,
  normalizeCustomer,
  buildWooUrl,
  type WooOrder,
  type WooCustomer,
  type WooRestClientOptions,
} from "./woo-rest-client.js";

export {
  generateWooOrderPrismaSchema,
} from "./woo-order-prisma-generator.js";

export {
  augmentWooPrismaForMultisite,
  augmentWooScaffoldForI18n,
  augmentI18nForMultisite,
  type CrossFeatureFlags,
} from "./cross-feature-utils.js";

export {
  generateRouteWithAi,
  generateRoutesWithAi,
  isClaudeCliAvailable,
  maskCredentials,
  stripMarkdown,
  validateRouteOutput,
  preservesExportedHttpMethods,
  hasNoTopLevelSideEffects,
  hasActiveAccessGuard,
  buildPrompt,
  type AiRouteGeneratorOptions,
  type AiRouteInput,
  type AiRouteOutput,
} from "./ai-route-generator.js";

export {
  parseElementorData,
  convertElementorWidgets,
  extractElementorFromMeta,
  type ElementorWidget,
  type ElementorConversionResult,
} from "./elementor-converter.js";

export {
  parseAcfOptions,
  generateAcfOptionsModule,
  type AcfOptionsField,
  type AcfOptionsResult,
} from "./acf-options-extractor.js";

export {
  runPreflightChecks,
  formatPreflightReport,
  type PreflightCheck,
  type PreflightReport,
  type PreflightOptions,
} from "./preflight.js";

export {
  MigrationConfigSchema,
  loadMigrationConfig,
  mergeConfigWithArgs,
  type MigrationConfig,
} from "./migration-config.js";

export {
  generateMigrationDashboard,
  type DashboardInput,
  type DashboardOutput,
} from "./migration-dashboard-generator.js";
