import type { WpPost } from "@wp-transfer/core";

export interface I18nDetectionResult {
  plugin: "wpml" | "polylang" | null;
  locales: string[];
  defaultLocale: string;
  postLocaleMap: Map<number, string>;
}

const ISO_639_1 = /^[a-z]{2}(-[a-z]{2})?$/i;

function isValidLocale(value: unknown): value is string {
  return typeof value === "string" && ISO_639_1.test(value);
}

function mostFrequent(map: Map<number, string>): string {
  const counts = new Map<string, number>();
  for (const locale of map.values()) {
    counts.set(locale, (counts.get(locale) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [locale, count] of counts) {
    if (count > bestCount) {
      best = locale;
      bestCount = count;
    }
  }
  return best;
}

function tryWpml(posts: WpPost[]): I18nDetectionResult | null {
  const postLocaleMap = new Map<number, string>();

  for (const post of posts) {
    const raw = post.meta["wpml_language"];
    if (isValidLocale(raw)) {
      postLocaleMap.set(post.id, raw.toLowerCase());
    }
  }

  if (postLocaleMap.size === 0) return null;

  const locales = [...new Set(postLocaleMap.values())];
  const defaultLocale = mostFrequent(postLocaleMap);

  return { plugin: "wpml", locales, defaultLocale, postLocaleMap };
}

function tryPolylang(posts: WpPost[]): I18nDetectionResult | null {
  const postLocaleMap = new Map<number, string>();

  for (const post of posts) {
    if (!post.terms) continue;
    for (const term of post.terms) {
      if (term.domain === "language" && isValidLocale(term.slug)) {
        postLocaleMap.set(post.id, term.slug.toLowerCase());
        break;
      }
    }
  }

  if (postLocaleMap.size === 0) return null;

  const locales = [...new Set(postLocaleMap.values())];
  const defaultLocale = mostFrequent(postLocaleMap);

  return { plugin: "polylang", locales, defaultLocale, postLocaleMap };
}

export function detectI18n(posts: WpPost[]): I18nDetectionResult {
  const empty: I18nDetectionResult = {
    plugin: null,
    locales: [],
    defaultLocale: "",
    postLocaleMap: new Map(),
  };

  if (posts.length === 0) return empty;

  return tryWpml(posts) ?? tryPolylang(posts) ?? empty;
}
