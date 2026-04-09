export {
  createWpRestClient,
  type WpRestAuth,
  type WpSiteInfo,
  type WpRestPlugin,
  type WpRestPostType,
  type WpRestClient,
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
} from "./nextjs-stub-generator.js";

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
  detectPods,
  type PodsDetectionResult,
} from "./pods-detector.js";
