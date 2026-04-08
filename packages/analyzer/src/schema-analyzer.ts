import type {
  WpPost,
  WpTaxonomyTerm,
  WpMedia,
  ContentSummary,
  CustomPostType,
  TaxonomySummary,
} from "@wp-transfer/core";

// ── Types ──────────────────────────────────────────────────────────

export type InferredType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "json"
  | "unknown";

export interface AcfFieldInfo {
  name: string;
  fieldKey: string;
  inferredType: InferredType;
  sampleValues: string[];
}

export interface SchemaAnalysisResult {
  contentSummary: ContentSummary;
  customPostTypes: CustomPostType[];
  acfFields: AcfFieldInfo[];
  hasYoastSeo: boolean;
  hasRankMath: boolean;
  yoastMetaCount: number;
  rankMathMetaCount: number;
}

// ── Constants ──────────────────────────────────────────────────────

const STANDARD_POST_TYPES = new Set([
  "post",
  "page",
  "attachment",
  "revision",
  "nav_menu_item",
]);

const DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

// ── Helpers ────────────────────────────────────────────────────────

function inferType(value: string): InferredType {
  if (value === "") return "unknown";

  // Boolean: "0" or "1"
  if (value === "0" || value === "1") return "boolean";

  // Number: purely numeric (int or float)
  if (/^-?\d+(\.\d+)?$/.test(value) && value !== "0" && value !== "1") {
    return "number";
  }

  // Date: ISO-ish patterns
  if (DATE_PATTERN.test(value)) return "date";

  // JSON: starts with { or [
  if (
    (value.startsWith("{") || value.startsWith("[")) &&
    (() => {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    })()
  ) {
    return "json";
  }

  return "string";
}

// ── Main ───────────────────────────────────────────────────────────

export function analyzeSchema(
  posts: WpPost[],
  taxonomies: WpTaxonomyTerm[],
  media: WpMedia[],
  userCount = 0,
): SchemaAnalysisResult {
  // ─ Count posts by type ─
  const typeCounts = new Map<string, number>();
  for (const post of posts) {
    typeCounts.set(post.type, (typeCounts.get(post.type) ?? 0) + 1);
  }

  const postCount = typeCounts.get("post") ?? 0;
  const pageCount = typeCounts.get("page") ?? 0;

  // Custom post types = everything not in standard set
  const customPostTypes: CustomPostType[] = [];
  for (const [type, count] of typeCounts) {
    if (!STANDARD_POST_TYPES.has(type)) {
      customPostTypes.push({
        slug: type,
        name: type,
        count,
      });
    }
  }

  // ─ Taxonomy summary ─
  const taxMap = new Map<string, { name: string; count: number }>();
  for (const term of taxonomies) {
    const existing = taxMap.get(term.taxonomy);
    if (existing) {
      existing.count += 1;
    } else {
      taxMap.set(term.taxonomy, { name: term.taxonomy, count: 1 });
    }
  }

  const taxonomySummaries: TaxonomySummary[] = [];
  for (const [slug, info] of taxMap) {
    taxonomySummaries.push({
      slug,
      name: info.name,
      count: info.count,
      hierarchical: slug === "category",
    });
  }

  // ─ Scan meta keys across all posts ─
  const metaKeys = new Map<string, unknown[]>(); // key → sample values
  let yoastMetaCount = 0;
  let rankMathMetaCount = 0;
  let hasYoastSeo = false;
  let hasRankMath = false;

  for (const post of posts) {
    if (!post.meta) continue;
    for (const [key, value] of Object.entries(post.meta)) {
      // Yoast detection
      if (key.startsWith("_yoast_wpseo_")) {
        hasYoastSeo = true;
        yoastMetaCount++;
      }

      // Rank Math detection
      if (key.startsWith("rank_math_")) {
        hasRankMath = true;
        rankMathMetaCount++;
      }

      // Collect sample values for all keys
      if (!metaKeys.has(key)) {
        metaKeys.set(key, []);
      }
      const samples = metaKeys.get(key)!;
      if (samples.length < 5) {
        samples.push(value);
      }
    }
  }

  // ─ Detect ACF fields ─
  // ACF pattern: meta has both `<fieldname>` and `_<fieldname>` where
  // the underscore-prefixed value starts with "field_"
  const acfFields: AcfFieldInfo[] = [];

  for (const [key, samples] of metaKeys) {
    if (key.startsWith("_")) continue; // skip underscore keys themselves

    const underscoreKey = `_${key}`;
    const underscoreSamples = metaKeys.get(underscoreKey);
    if (!underscoreSamples) continue;

    // Check if any underscore-prefixed value starts with "field_"
    const isAcf = underscoreSamples.some(
      (v) => typeof v === "string" && v.startsWith("field_"),
    );
    if (!isAcf) continue;

    const fieldKey =
      (underscoreSamples.find(
        (v) => typeof v === "string" && v.startsWith("field_"),
      ) as string) ?? "";

    const sampleStrings = samples
      .map((v) => (typeof v === "string" ? v : String(v)))
      .slice(0, 5);

    const inferredType =
      sampleStrings.length > 0 ? inferType(sampleStrings[0]) : "unknown";

    acfFields.push({
      name: key,
      fieldKey,
      inferredType,
      sampleValues: sampleStrings,
    });
  }

  // ─ Build content summary ─
  const contentSummary: ContentSummary = {
    posts: postCount,
    pages: pageCount,
    customPostTypes,
    media: media.length,
    users: userCount,
    taxonomies: taxonomySummaries,
  };

  return {
    contentSummary,
    customPostTypes,
    acfFields,
    hasYoastSeo,
    hasRankMath,
    yoastMetaCount,
    rankMathMetaCount,
  };
}
