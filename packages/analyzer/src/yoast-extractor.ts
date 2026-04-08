/**
 * Yoast SEO metadata extractor.
 *
 * Reads _yoast_wpseo_* post meta keys into a typed YoastMeta object,
 * resolves %%variable%% placeholders, and generates Next.js Metadata API code.
 */

export interface YoastMeta {
  title: string | null;
  description: string | null;
  canonical: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  focusKeyword: string | null;
}

export interface YoastPlaceholderContext {
  postTitle: string;
  siteName: string;
  separator: string;
  primaryCategory?: string;
}

// ── Key mapping ──

const META_KEY_MAP: Record<string, keyof YoastMeta> = {
  _yoast_wpseo_title: "title",
  _yoast_wpseo_metadesc: "description",
  _yoast_wpseo_canonical: "canonical",
  "_yoast_wpseo_opengraph-title": "ogTitle",
  "_yoast_wpseo_opengraph-description": "ogDescription",
  "_yoast_wpseo_opengraph-image": "ogImage",
  _yoast_wpseo_focuskw: "focusKeyword",
};

// ── Public API ──

/**
 * Extract Yoast meta keys from a post meta record.
 * Non-string values and missing keys are returned as null.
 */
export function extractYoastMeta(meta: Record<string, unknown>): YoastMeta {
  const result: YoastMeta = {
    title: null,
    description: null,
    canonical: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    focusKeyword: null,
  };

  for (const [metaKey, field] of Object.entries(META_KEY_MAP)) {
    const value = meta[metaKey];
    if (typeof value === "string" && value.length > 0) {
      (result[field] as string | null) = value;
    }
  }

  return result;
}

/**
 * Resolve %%variable%% placeholders in a Yoast title/description template.
 * Unknown placeholders are stripped and extra whitespace is collapsed.
 */
export function resolveYoastPlaceholders(
  template: string,
  context: YoastPlaceholderContext,
): string {
  const replacements: Record<string, string> = {
    title: context.postTitle,
    sep: context.separator,
    sitename: context.siteName,
    primary_category: context.primaryCategory ?? "",
  };

  // Replace known placeholders with their values, unknown ones with empty string
  const resolved = template.replace(/%%(\w+)%%/g, (_match, key: string) => {
    const lower = key.toLowerCase();
    return lower in replacements ? replacements[lower]! : "";
  });

  // Collapse multiple spaces into one and trim
  return resolved.replace(/\s{2,}/g, " ").trim();
}

/**
 * Generate a Next.js App Router `generateMetadata` function from extracted Yoast data.
 *
 * - Titles with remaining %% patterns become template literals with runtime resolution.
 * - OG overrides produce an openGraph section.
 * - Canonical URL produces an alternates section.
 * - Focus keyword is emitted as a comment.
 */
export function generateYoastMetadataCode(yoast: YoastMeta): string {
  const lines: string[] = [];

  lines.push('import type { Metadata } from "next";');
  lines.push("");

  if (yoast.focusKeyword) {
    lines.push(`// Focus keyword: ${yoast.focusKeyword}`);
  }

  lines.push("export async function generateMetadata(): Promise<Metadata> {");
  lines.push("  return {");

  // Title
  if (yoast.title !== null) {
    const titleValue = formatStringValue(yoast.title);
    lines.push(`    title: ${titleValue},`);
  }

  // Description
  if (yoast.description !== null) {
    lines.push(`    description: ${JSON.stringify(yoast.description)},`);
  }

  // Alternates / canonical
  if (yoast.canonical !== null) {
    lines.push("    alternates: {");
    lines.push(`      canonical: ${JSON.stringify(yoast.canonical)},`);
    lines.push("    },");
  }

  // OpenGraph
  const hasOg = yoast.ogTitle !== null || yoast.ogDescription !== null || yoast.ogImage !== null;
  if (hasOg) {
    lines.push("    openGraph: {");
    if (yoast.ogTitle !== null) {
      lines.push(`      title: ${JSON.stringify(yoast.ogTitle)},`);
    }
    if (yoast.ogDescription !== null) {
      lines.push(`      description: ${JSON.stringify(yoast.ogDescription)},`);
    }
    if (yoast.ogImage !== null) {
      lines.push("      images: [");
      lines.push(`        { url: ${JSON.stringify(yoast.ogImage)} },`);
      lines.push("      ],");
    }
    lines.push("    },");
  }

  lines.push("  };");
  lines.push("}");

  return lines.join("\n");
}

// ── Helpers ──

/**
 * Format a string value for code generation.
 * If it still contains %% placeholders, wrap in a template literal comment;
 * otherwise use a plain JSON string.
 */
function formatStringValue(value: string): string {
  if (value.includes("%%")) {
    // Contains unresolved placeholders — emit as template literal placeholder
    const escaped = value.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
    return `\`${escaped}\` /* TODO: resolve Yoast placeholders */`;
  }
  return JSON.stringify(value);
}
