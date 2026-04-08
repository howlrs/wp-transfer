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
  type PhpFileAnalysis,
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
