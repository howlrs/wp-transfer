import type { WpMedia } from "@wp-transfer/core";

export interface RemotePattern {
  protocol: string;
  hostname: string;
}

export interface MediaNormalizeResult {
  media: WpMedia[];
  remotePatterns: RemotePattern[];
}

const BLOGS_DIR_RE = /\/wp-content\/blogs\.dir\/(\d+)\/files\//;

export function normalizeMedia(media: WpMedia[], siteId: number): MediaNormalizeResult {
  const normalized = media.map((m) => ({
    ...m,
    url: normalizePath(m.url, siteId),
  }));

  const seen = new Set<string>();
  const remotePatterns: RemotePattern[] = [];
  for (const m of normalized) {
    try {
      const url = new URL(m.url);
      const key = `${url.protocol}//${url.hostname}`;
      if (!seen.has(key)) {
        seen.add(key);
        remotePatterns.push({ protocol: url.protocol.replace(":", ""), hostname: url.hostname });
      }
    } catch {
      // skip invalid URLs
    }
  }

  return { media: normalized, remotePatterns };
}

function normalizePath(url: string, siteId: number): string {
  return url.replace(BLOGS_DIR_RE, `/wp-content/uploads/sites/${siteId}/`);
}
