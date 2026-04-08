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

// ── Factory ────────────────────────────────────────────────────────

export function createWpRestClient(
  siteUrl: string,
  auth?: WpRestAuth,
): WpRestClient {
  const baseURL = siteUrl.replace(/\/+$/, "") + "/wp-json/";

  const headers: Record<string, string> = {};
  if (auth) {
    const encoded = btoa(`${auth.username}:${auth.applicationPassword}`);
    headers["Authorization"] = `Basic ${encoded}`;
  }

  const api: $Fetch = ofetch.create({ baseURL, headers });

  return {
    async probeSiteInfo(): Promise<WpSiteInfo> {
      const data = await api<Record<string, unknown>>("");
      const auth = data["authentication"] as
        | Record<string, unknown>
        | undefined;
      return {
        name: data["name"] as string,
        description: data["description"] as string,
        url: data["url"] as string,
        namespaces: data["namespaces"] as string[],
        hasApplicationPasswords:
          auth !== undefined &&
          "application-passwords" in auth,
      };
    },

    async fetchPlugins(): Promise<WpRestPlugin[]> {
      const data = await api<WpRestPlugin[]>("wp/v2/plugins");
      return data;
    },

    async fetchPostTypes(): Promise<WpRestPostType[]> {
      const data = await api<Record<string, Record<string, unknown>>>(
        "wp/v2/types",
      );
      return Object.entries(data).map(([slug, raw]) => ({
        slug,
        name: raw["name"] as string,
        restBase: (raw["rest_base"] as string | undefined) ?? undefined,
        hierarchical: raw["hierarchical"] as boolean,
      }));
    },

    async fetchPostCount(postType: string): Promise<number> {
      const data = await api<unknown[]>(`wp/v2/${postType}`, {
        query: { per_page: 1 },
      });
      return data.length;
    },
  };
}
