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
