/**
 * Cross-Feature Integration Utilities
 *
 * Optional augmentations for WooCommerce × Multisite × i18n combinations.
 * Each function is a pure transformation — pass in scaffold output, get augmented output back.
 */

export interface CrossFeatureFlags {
  hasMultisite: boolean;
  hasWooCommerce: boolean;
  hasI18n: boolean;
  locales?: string[];
  defaultLocale?: string;
}

/**
 * Augment WooCommerce Prisma schema with siteId when Multisite is active.
 *
 * Inserts `siteId Int` and a `Site` relation into the Product model,
 * and adds `@@index([siteId])` before the closing brace.
 */
export function augmentWooPrismaForMultisite(wooPrismaSchema: string): string {
  const modelStart = wooPrismaSchema.indexOf("model Product {");
  if (modelStart === -1) {
    return wooPrismaSchema;
  }

  // Find the first newline after "model Product {" to insert fields after the opening line
  const firstNewline = wooPrismaSchema.indexOf("\n", modelStart);
  if (firstNewline === -1) {
    return wooPrismaSchema;
  }

  const siteIdFields =
    "  siteId           Int\n" +
    "  site             Site                    @relation(fields: [siteId], references: [id])";

  const withSiteId =
    wooPrismaSchema.slice(0, firstNewline + 1) +
    siteIdFields +
    "\n" +
    wooPrismaSchema.slice(firstNewline + 1);

  // Find closing brace of Product model in the updated string
  const modelStartUpdated = withSiteId.indexOf("model Product {");
  const closingBrace = withSiteId.indexOf("\n}", modelStartUpdated);
  if (closingBrace === -1) {
    return withSiteId;
  }

  const indexLine = "\n  @@index([siteId])";

  return (
    withSiteId.slice(0, closingBrace) +
    indexLine +
    withSiteId.slice(closingBrace)
  );
}

/**
 * Augment WooCommerce scaffold paths with [locale] prefix when i18n is active.
 *
 * Rewrites `app/(shop)/` paths to `app/[locale]/(shop)/`.
 * File content is not modified.
 */
export function augmentWooScaffoldForI18n(
  scaffoldFiles: { path: string; content: string }[],
  _locales: string[],
  _defaultLocale: string,
): { path: string; content: string }[] {
  return scaffoldFiles.map((file) => {
    if (!file.path.startsWith("app/(shop)/")) {
      return file;
    }
    return {
      path: file.path.replace("app/(shop)/", "app/[locale]/(shop)/"),
      content: file.content,
    };
  });
}

/**
 * Augment i18n middleware for Multisite (add site-scoped locale config note).
 *
 * Appends a TODO comment block to middleware.ts explaining per-site locale config.
 */
export function augmentI18nForMultisite(
  i18nFiles: { path: string; content: string }[],
): { path: string; content: string }[] {
  const multisiteComment =
    "\n// TODO: For Multisite + i18n, configure per-site locale settings.\n" +
    "// Each site may support different locales. Consider storing locale config in the Site model.\n";

  return i18nFiles.map((file) => {
    if (file.path !== "middleware.ts") {
      return file;
    }
    return {
      path: file.path,
      content: file.content + multisiteComment,
    };
  });
}
