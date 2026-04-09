import type { WpPost } from "@wp-transfer/core";

export interface MetaBoxDetectionResult {
  detected: boolean;
  fieldCount: number;
  fields: MetaBoxField[];
}

export interface MetaBoxField {
  key: string;
  inferredType: "string" | "number" | "boolean" | "date" | "json" | "unknown";
  sampleValue?: unknown;
}

// ── Exclusion sets ─────────────────────────────────────────────────

const WP_CORE_PREFIXES = [
  "_wp_",
  "_edit_",
  "_thumbnail_id",
  "_encloseme",
  "_pingme",
  "_oembed_",
  "_oembed_time_",
];

const WOO_PREFIXES = [
  "_price",
  "_regular_price",
  "_sale_price",
  "_sku",
  "_stock",
  "_product_",
  "_wc_",
];

const KNOWN_PLUGIN_PREFIXES = [
  "wpml_",
  "pll_",
  "yoast_",
  "_yoast_",
  "rank_math_",
  "_elementor_",
  "_et_",
  "_vc_",
];

function isWpCoreMeta(key: string): boolean {
  if (WP_CORE_PREFIXES.some((p) => key.startsWith(p))) return true;
  // Catch-all for WP internal underscore keys not already excluded
  if (key === "_thumbnail_id") return true;
  return false;
}

function isWooMeta(key: string): boolean {
  return WOO_PREFIXES.some((p) => key.startsWith(p));
}

function isKnownPluginMeta(key: string): boolean {
  return KNOWN_PLUGIN_PREFIXES.some((p) => key.startsWith(p));
}

// A meta key is an ACF key if:
//   - it is NOT underscore-prefixed itself, AND
//   - there exists a corresponding `_<key>` meta whose value starts with "field_"
function isAcfField(key: string, allKeys: Map<string, unknown[]>): boolean {
  if (key.startsWith("_")) return false;
  const underscoreSamples = allKeys.get(`_${key}`);
  if (!underscoreSamples) return false;
  return underscoreSamples.some(
    (v) => typeof v === "string" && v.startsWith("field_"),
  );
}

// ── Type inference ─────────────────────────────────────────────────

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

function inferType(
  value: unknown,
): MetaBoxField["inferredType"] {
  if (value === "" || value === null || value === undefined) return "unknown";

  const str = typeof value === "string" ? value : String(value);

  if (str === "0" || str === "1") return "boolean";

  if (/^-?\d+(\.\d+)?$/.test(str) && str !== "0" && str !== "1") {
    return "number";
  }

  if (DATE_PATTERN.test(str)) return "date";

  if (
    (str.startsWith("{") || str.startsWith("[")) &&
    (() => {
      try {
        JSON.parse(str);
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

export function detectMetaBox(posts: WpPost[]): MetaBoxDetectionResult {
  if (posts.length === 0) {
    return { detected: false, fieldCount: 0, fields: [] };
  }

  // Collect all meta keys and up to 5 sample values each
  const allKeys = new Map<string, unknown[]>();

  for (const post of posts) {
    if (!post.meta) continue;
    for (const [key, value] of Object.entries(post.meta)) {
      if (!allKeys.has(key)) allKeys.set(key, []);
      const samples = allKeys.get(key)!;
      if (samples.length < 5) samples.push(value);
    }
  }

  // Filter down to candidate custom Meta Box fields
  const fields: MetaBoxField[] = [];

  for (const [key, samples] of allKeys) {
    // Skip underscore-prefixed keys (ACF shadow keys, WP internals, etc.)
    if (key.startsWith("_")) continue;

    if (isWpCoreMeta(key)) continue;
    if (isWooMeta(key)) continue;
    if (isKnownPluginMeta(key)) continue;
    if (isAcfField(key, allKeys)) continue;

    const sampleValue = samples[0];
    fields.push({
      key,
      inferredType: inferType(sampleValue),
      sampleValue,
    });
  }

  return {
    detected: fields.length > 0,
    fieldCount: fields.length,
    fields,
  };
}
