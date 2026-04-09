import type { WpSite, CrossSiteLink } from "@wp-transfer/core";

export interface RewriteResult {
  rewritten: string;
  links: CrossSiteLink[];
}

const HREF_RE = /href="([^"]+)"/g;
const DATE_PERMALINK_RE = /\/\d{4}\/\d{2}\/\d{2}\/([\w-]+)\/?$/;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function rewriteCrossSiteUrls(
  content: string,
  sourceSiteId: number,
  sourcePostId: number,
  sites: WpSite[],
  mode: "subpath" | "subdomain",
): RewriteResult {
  const links: CrossSiteLink[] = [];

  // Filter out source site, normalize URLs, sort by length desc (longest match first)
  const otherSites = sites
    .filter((s) => s.siteId !== sourceSiteId)
    .map((s) => ({ ...s, baseNormalized: s.baseUrl.replace(/\/$/, "") }))
    .sort((a, b) => b.baseNormalized.length - a.baseNormalized.length);

  // No cross-site targets → skip entirely
  if (otherSites.length === 0) {
    return { rewritten: content, links };
  }

  // Build a single compiled regex: matches any target site's baseUrl
  // Sorted longest-first in alternation so the regex engine matches greedily
  const sitePattern = new RegExp(
    otherSites.map((s) => escapeRegex(s.baseNormalized)).join("|"),
  );

  // Build a lookup map: normalized baseUrl → site entry
  const siteLookup = new Map(
    otherSites.map((s) => [s.baseNormalized, s]),
  );

  const rewritten = content.replace(HREF_RE, (match, url: string) => {
    const m = sitePattern.exec(url);
    if (!m) return match;

    const matched = m[0]!;
    // Ensure the match is a proper prefix: URL must be exactly baseUrl or baseUrl + "/"
    const rest = url.slice(matched.length);
    if (rest !== "" && !rest.startsWith("/")) return match;

    const site = siteLookup.get(matched)!;
    const slug = extractSlug(rest);
    if (!slug) return match;

    const rewrittenPath = mode === "subpath"
      ? `/${site.slug}/blog/${slug}`
      : `/blog/${slug}`;

    links.push({
      sourceSiteId,
      targetSiteId: site.siteId,
      sourcePostId,
      originalUrl: url,
      rewrittenPath,
    });

    return `href="${rewrittenPath}"`;
  });

  return { rewritten, links };
}

function extractSlug(path: string): string | null {
  const cleaned = path.replace(/\/$/, "").replace(/^\//, "");
  if (!cleaned) return null;

  // Date-based: /2024/01/15/slug/
  const dateMatch = path.match(DATE_PERMALINK_RE);
  if (dateMatch) return dateMatch[1] ?? null;

  // Default: last segment
  const segments = cleaned.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? null;
}
