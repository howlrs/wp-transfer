import type { WxrParseResult } from "@wp-transfer/wxr-parser";
import type { WpSite, MultisiteNetwork } from "@wp-transfer/core";
import { sanitizeSlug } from "./sanitize.js";

interface DetectedSite {
  wxr: WxrParseResult;
  isMain: boolean;
  path: string;
  subdomain?: string;
}

export function detectMultisite(wxrResults: WxrParseResult[]): MultisiteNetwork {
  const empty: MultisiteNetwork = {
    mode: "unknown",
    networkUrl: "",
    sites: [],
    sharedUsers: [],
    userConflicts: [],
    crossSiteLinks: [],
  };

  if (wxrResults.length === 0) return empty;

  const siteUrls = wxrResults.map((w) => w.siteUrl).filter(Boolean);
  const networkUrl = mostCommon(siteUrls) || wxrResults[0]!.siteUrl;

  const detected: DetectedSite[] = wxrResults.map((wxr) => {
    const blogUrl = wxr.blogUrl || wxr.siteUrl;
    const isMain = blogUrl === wxr.siteUrl || blogUrl === networkUrl;
    const path = extractPath(blogUrl, networkUrl);
    const subdomain = extractSubdomain(blogUrl, networkUrl);
    return { wxr, isMain, path, subdomain };
  });

  const mode = determineMode(detected);

  const mainSites = detected.filter((d) => d.isMain);
  const subSites = detected.filter((d) => !d.isMain);

  subSites.sort((a, b) => {
    const keyA = a.subdomain || a.path;
    const keyB = b.subdomain || b.path;
    return keyA.localeCompare(keyB);
  });

  const ordered = mainSites.length > 0
    ? [...mainSites, ...subSites]
    : detected;

  const sites: WpSite[] = ordered.map((d, i) => {
    const siteId = i + 1;
    const isMainSite = i === 0 && (d.isMain || mainSites.length === 0);
    const rawSlug = isMainSite
      ? "main"
      : d.subdomain || d.path.replace(/^\/|\/$/g, "") || `site-${siteId}`;
    const slug = sanitizeSlug(rawSlug) || `site-${siteId}`;

    return {
      siteId,
      slug,
      title: d.wxr.siteTitle,
      baseUrl: d.wxr.blogUrl || d.wxr.siteUrl,
      networkUrl,
      path: isMainSite ? "/" : d.path || "/",
      subdomain: d.subdomain,
    };
  });

  return { mode, networkUrl, sites, sharedUsers: [], userConflicts: [], crossSiteLinks: [] };
}

function determineMode(detected: DetectedSite[]): "subdomain" | "subdirectory" | "unknown" {
  const subs = detected.filter((d) => !d.isMain);
  if (subs.length === 0) return "unknown";
  const hasSubdomain = subs.some((d) => d.subdomain);
  const hasSubpath = subs.some((d) => d.path && d.path !== "/");
  if (hasSubdomain && !hasSubpath) return "subdomain";
  if (hasSubpath && !hasSubdomain) return "subdirectory";
  return "unknown";
}

function extractPath(blogUrl: string, networkUrl: string): string {
  if (!blogUrl || !networkUrl) return "/";
  try {
    const blog = new URL(blogUrl);
    const network = new URL(networkUrl);
    if (blog.hostname !== network.hostname) return "/";
    const relative = blog.pathname.replace(network.pathname.replace(/\/$/, ""), "");
    return relative || "/";
  } catch {
    return "/";
  }
}

function extractSubdomain(blogUrl: string, networkUrl: string): string | undefined {
  if (!blogUrl || !networkUrl) return undefined;
  try {
    const blog = new URL(blogUrl);
    const network = new URL(networkUrl);
    if (blog.hostname === network.hostname) return undefined;
    if (blog.hostname.endsWith(`.${network.hostname}`)) {
      return blog.hostname.replace(`.${network.hostname}`, "");
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function mostCommon(arr: string[]): string {
  const counts = new Map<string, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  let max = 0;
  let result = "";
  for (const [item, count] of counts) {
    if (count > max) { max = count; result = item; }
  }
  return result;
}
