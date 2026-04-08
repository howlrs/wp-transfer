import { ofetch, type $Fetch } from "ofetch";

// ── Types ──────────────────────────────────────────────────────────

export interface WpRestAuth {
  username: string;
  applicationPassword: string;
}

export interface WpSiteInfo {
  name: string;
  description: string;
  url: string;
  namespaces: string[];
  hasApplicationPasswords: boolean;
}

export interface WpRestPlugin {
  plugin: string;
  status: string;
  name: string;
  version: string;
  author?: string;
}

export interface WpRestPostType {
  slug: string;
  name: string;
  restBase?: string;
  hierarchical: boolean;
}

export interface WpRestClient {
  probeSiteInfo(): Promise<WpSiteInfo>;
  fetchPlugins(): Promise<WpRestPlugin[]>;
  fetchPostTypes(): Promise<WpRestPostType[]>;
  fetchPostCount(postType: string): Promise<number>;
}

// ── SSRF Protection ───────────────────────────────────────────────

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
];

export function validateUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Invalid URL scheme: "${parsed.protocol}". Only http and https are allowed.`,
    );
  }

  const hostname = parsed.hostname;
  for (const pattern of PRIVATE_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(
        `URL targets a private/reserved IP address: ${hostname}`,
      );
    }
  }
}

// ── Error Sanitisation ────────────────────────────────────────────

function sanitizeError(err: unknown): Error {
  const message =
    err instanceof Error ? err.message : String(err);
  const sanitized = message.replace(
    /Authorization:\s*\S+/gi,
    "Authorization: [REDACTED]",
  );
  return new Error(sanitized);
}

// ── Factory ────────────────────────────────────────────────────────

export function createWpRestClient(
  siteUrl: string,
  auth?: WpRestAuth,
): WpRestClient {
  validateUrl(siteUrl);

  const baseURL = siteUrl.replace(/\/+$/, "") + "/wp-json/";

  const headers: Record<string, string> = {};
  if (auth) {
    const encoded = btoa(`${auth.username}:${auth.applicationPassword}`);
    headers["Authorization"] = `Basic ${encoded}`;
  }

  const api: $Fetch = ofetch.create({
    baseURL,
    headers,
    redirect: "manual",
    timeout: 30_000,
  });

  return {
    async probeSiteInfo(): Promise<WpSiteInfo> {
      let data: Record<string, unknown>;
      try {
        data = await api<Record<string, unknown>>("");
      } catch (err) {
        throw sanitizeError(err);
      }

      const auth = data?.["authentication"] as
        | Record<string, unknown>
        | undefined;
      return {
        name: String(data?.["name"] ?? ""),
        description: String(data?.["description"] ?? ""),
        url: String(data?.["url"] ?? ""),
        namespaces: Array.isArray(data?.["namespaces"])
          ? (data["namespaces"] as string[])
          : [],
        hasApplicationPasswords:
          auth !== undefined &&
          auth !== null &&
          "application-passwords" in auth,
      };
    },

    async fetchPlugins(): Promise<WpRestPlugin[]> {
      try {
        const data = await api<WpRestPlugin[]>("wp/v2/plugins");
        return data;
      } catch (err) {
        throw sanitizeError(err);
      }
    },

    async fetchPostTypes(): Promise<WpRestPostType[]> {
      let data: unknown;
      try {
        data = await api<Record<string, Record<string, unknown>>>(
          "wp/v2/types",
        );
      } catch (err) {
        throw sanitizeError(err);
      }

      if (data === null || typeof data !== "object") {
        return [];
      }

      return Object.entries(data as Record<string, Record<string, unknown>>).map(([slug, raw]) => ({
        slug,
        name: String(raw?.["name"] ?? ""),
        restBase: raw?.["rest_base"] != null ? String(raw["rest_base"]) : undefined,
        hierarchical: Boolean(raw?.["hierarchical"]),
      }));
    },

    async fetchPostCount(postType: string): Promise<number> {
      try {
        const response = await api.raw(`wp/v2/${postType}`, {
          query: { per_page: 1 },
        });
        const total = response.headers.get("x-wp-total");
        return total ? parseInt(total, 10) : 0;
      } catch (err) {
        throw sanitizeError(err);
      }
    },
  };
}
