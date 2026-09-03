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

  // Include the source so overlapping bases resolve to the URL's actual owner.
  const normalizedSites = sites
    .map((s) => ({ ...s, baseNormalized: s.baseUrl.replace(/\/$/, "") }))
    .sort((a, b) => b.baseNormalized.length - a.baseNormalized.length);

  // No cross-site targets → skip entirely
  if (!normalizedSites.some((site) => site.siteId !== sourceSiteId)) {
    return { rewritten: content, links };
  }

  // Anchor at the start and require a path boundary so embedded or partially
  // matching base URLs cannot be mistaken for a site's URL.
  const sitePattern = new RegExp(
    `^(?:${normalizedSites.map((s) => escapeRegex(s.baseNormalized)).join("|")})(?=$|/)`,
  );

  // Build a lookup map: normalized baseUrl → site entry
  const siteLookup = new Map(
    normalizedSites.map((s) => [s.baseNormalized, s]),
  );

  const rewritten = content.replace(HREF_RE, (match, url: string) => {
    const m = sitePattern.exec(url);
    if (!m) return match;

    const matched = m[0]!;
    const rest = url.slice(matched.length);
    const site = siteLookup.get(matched)!;
    if (site.siteId === sourceSiteId) return match;

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
