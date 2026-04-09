import type { WpSite, CrossSiteLink } from "@wp-transfer/core";

export interface RewriteResult {
  rewritten: string;
  links: CrossSiteLink[];
}

const HREF_RE = /href="([^"]+)"/g;
const DATE_PERMALINK_RE = /\/\d{4}\/\d{2}\/\d{2}\/([\w-]+)\/?$/;

export function rewriteCrossSiteUrls(
  content: string,
  sourceSiteId: number,
  sourcePostId: number,
  sites: WpSite[],
  mode: "subpath" | "subdomain",
): RewriteResult {
  const links: CrossSiteLink[] = [];

  // Build baseUrl -> site map (sorted by URL length desc to match longest first)
  const siteMap = [...sites]
    .sort((a, b) => b.baseUrl.length - a.baseUrl.length);

  const rewritten = content.replace(HREF_RE, (match, url: string) => {
    for (const site of siteMap) {
      if (site.siteId === sourceSiteId) continue;

      const baseNormalized = site.baseUrl.replace(/\/$/, "");
      if (!url.startsWith(baseNormalized + "/") && url !== baseNormalized) continue;

      const relativePath = url.slice(baseNormalized.length);
      const slug = extractSlug(relativePath);
      if (!slug) continue;

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
    }

    return match;
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
