import { ofetch, type $Fetch } from "ofetch";
import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Agent } from "undici";

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
  restNamespace?: string;
  hierarchical: boolean;
}

export interface WpRestClient {
  probeSiteInfo(): Promise<WpSiteInfo>;
  fetchPlugins(): Promise<WpRestPlugin[]>;
  fetchPostTypes(): Promise<WpRestPostType[]>;
  fetchPostCount(postType: string, restNamespace?: string): Promise<number>;
  /** Release sockets held by the guarded HTTP dispatcher when the client is no longer needed. */
  close(): Promise<void>;
}

export type HostnameResolver = (hostname: string) => Promise<readonly string[]>;

/** Injectable only for controlled runtimes and tests; callers normally omit it. */
export interface WpRestClientOptions {
  resolver?: HostnameResolver;
}

// ── SSRF Protection ───────────────────────────────────────────────

const defaultResolver: HostnameResolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((result) => result.address);

function ipv4ToNumber(address: string): number | undefined {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return undefined;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return undefined;
  return (((octets[0]! << 24) >>> 0) + (octets[1]! << 16) + (octets[2]! << 8) + octets[3]!) >>> 0;
}

function isGlobalIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);
  if (value === undefined) return false;
  const inRange = (network: number, bits: number) =>
    (value >>> (32 - bits)) === (network >>> (32 - bits));
  return !(
    inRange(0x00000000, 8) || // unspecified/current network
    inRange(0x0a000000, 8) || // RFC1918
    inRange(0x64400000, 10) || // shared carrier-grade NAT
    inRange(0x7f000000, 8) || // loopback
    inRange(0xa9fe0000, 16) || // link local
    inRange(0xac100000, 12) || // RFC1918
    inRange(0xc0000000, 24) || // IETF protocol assignments
    inRange(0xc0000200, 24) || // documentation
    inRange(0xc0a80000, 16) || // RFC1918
    inRange(0xc6120000, 15) || // benchmark testing
    inRange(0xc6336400, 24) || // documentation
    inRange(0xcb007100, 24) || // documentation
    inRange(0xe0000000, 4) // multicast/reserved
  );
}

function parseIpv6(address: string): number[] | undefined {
  const normalized = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized.includes("%")) return undefined;
  const parts = normalized.split("::");
  if (parts.length > 2) return undefined;
  const parseSide = (side: string): number[] | undefined => {
    if (!side) return [];
    const groups = side.split(":");
    const values: number[] = [];
    for (const group of groups) {
      if (group.includes(".")) {
        const ipv4 = ipv4ToNumber(group);
        if (ipv4 === undefined) return undefined;
        values.push((ipv4 >>> 16) & 0xffff, ipv4 & 0xffff);
      } else if (/^[0-9a-f]{1,4}$/.test(group)) {
        values.push(parseInt(group, 16));
      } else {
        return undefined;
      }
    }
    return values;
  };
  const left = parseSide(parts[0]!);
  const right = parseSide(parts[1] ?? "");
  if (!left || !right) return undefined;
  if (parts.length === 1) return left.length === 8 ? left : undefined;
  const zeroes = 8 - left.length - right.length;
  return zeroes >= 1 ? [...left, ...Array<number>(zeroes).fill(0), ...right] : undefined;
}

function isGlobalIpv6(address: string): boolean {
  const words = parseIpv6(address);
  if (!words) return false;
  const mappedIpv4 = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const compatibleIpv4 = words.slice(0, 6).every((word) => word === 0);
  if (mappedIpv4 || compatibleIpv4) {
    const value = ((words[6]! << 16) | words[7]!) >>> 0;
    return isGlobalIpv4(`${value >>> 24}.${(value >>> 16) & 255}.${(value >>> 8) & 255}.${value & 255}`);
  }
  const first = words[0]!;
  return !(
    words.every((word) => word === 0) || // unspecified
    (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) || // loopback
    (first & 0xfe00) === 0xfc00 || // ULA fc00::/7
    (first & 0xffc0) === 0xfe80 || // link local fe80::/10
    (first & 0xff00) === 0xff00 || // multicast
    (first === 0x2001 && words[1] === 0x0db8) || // documentation
    (first & 0xffc0) === 0xfec0 // deprecated site local
  );
}

/** Whether a literal IP is globally routable (private, loopback and reserved addresses are false). */
export function isGlobalIp(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, "");
  return isIP(normalized) === 4 ? isGlobalIpv4(normalized)
    : isIP(normalized) === 6 ? isGlobalIpv6(normalized)
      : false;
}

async function resolveGlobalAddresses(hostname: string, resolver: HostnameResolver): Promise<readonly string[]> {
  const normalized = hostname.replace(/^\[|\]$/g, "");
  if (normalized.toLowerCase() === "localhost") {
    throw new Error(`URL targets a private/reserved IP address: ${hostname}`);
  }
  if (isIP(normalized)) {
    if (!isGlobalIp(normalized)) throw new Error(`URL targets a private/reserved IP address: ${hostname}`);
    return [normalized];
  }
  const addresses = await resolver(normalized);
  if (addresses.length === 0 || addresses.some((address) => !isGlobalIp(address))) {
    throw new Error(`URL host resolves to a private/reserved IP address: ${hostname}`);
  }
  return addresses;
}

async function validateResolvedHostname(hostname: string, resolver: HostnameResolver): Promise<void> {
  await resolveGlobalAddresses(hostname, resolver);
}

/**
 * Resolve the hostname at socket-connect time and pin the connection to one
 * globally routable answer. The request hostname remains unchanged, so Host
 * and HTTPS certificate/SNI verification continue to use the original host.
 */
export function createGuardedLookup(resolver: HostnameResolver): LookupFunction {
  return (hostname, options, callback): void => {
    const requestedFamily = options.family === "IPv4" ? 4
      : options.family === "IPv6" ? 6
        : options.family ?? 0;
    void resolveGlobalAddresses(hostname, resolver)
      .then((addresses) => {
        const address = addresses.find((candidate) =>
          requestedFamily === 0 || isIP(candidate.replace(/^\[|\]$/g, "")) === requestedFamily,
        );
        if (!address) {
          callback(
            new Error(`No globally routable IPv${requestedFamily} address is available for ${hostname}`) as NodeJS.ErrnoException,
            "",
            0,
          );
          return;
        }
        const normalized = address.replace(/^\[|\]$/g, "");
        callback(null, normalized, isIP(normalized) as 4 | 6);
      })
      .catch((error: unknown) => callback(
        (error instanceof Error ? error : new Error("DNS resolution failed")) as NodeJS.ErrnoException,
        "",
        0,
      ));
  };
}

export function validateUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Never reflect raw input: it can contain pasted credentials or tokens.
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Invalid URL scheme: "${parsed.protocol}". Only http and https are allowed.`,
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL must not include credentials; use explicit authentication options instead.");
  }

  const hostname = parsed.hostname;
  const normalizedHostname = hostname.replace(/^\[|\]$/g, "");
  if (normalizedHostname.toLowerCase() === "localhost" || (isIP(normalizedHostname) && !isGlobalIp(normalizedHostname))) {
    throw new Error(`URL targets a private/reserved IP address: ${hostname}`);
  }
}

// ── Error Sanitisation ────────────────────────────────────────────

function sanitizeError(err: unknown): Error {
  const message =
    err instanceof Error ? err.message : String(err);
  const sanitized = message.replace(
    /Authorization:\s*\S+\s+\S+/gi,
    "Authorization: [REDACTED]",
  );
  return new Error(sanitized);
}

// ── Factory ────────────────────────────────────────────────────────

export function createWpRestClient(
  siteUrl: string,
  auth?: WpRestAuth,
  options: WpRestClientOptions = {},
): WpRestClient {
  validateUrl(siteUrl);
  const parsedUrl = new URL(siteUrl);
  if (auth && parsedUrl.protocol !== "https:") {
    throw new Error("WordPress REST basic authentication requires HTTPS. Refusing to send credentials over HTTP.");
  }
  const resolver = options.resolver ?? defaultResolver;

  const baseURL = siteUrl.replace(/\/+$/, "") + "/wp-json/";

  const headers: Record<string, string> = {};
  if (auth) {
    const encoded = btoa(`${auth.username}:${auth.applicationPassword}`);
    headers["Authorization"] = `Basic ${encoded}`;
  }

  // ofetch forwards this dispatcher to the platform fetch implementation.
  // Its lookup runs for every new socket (including retry/redirect follow-up
  // requests if those options are ever enabled), closing the validation to
  // connection gap that DNS rebinding otherwise exploits.
  const dispatcher = new Agent({
    connect: { lookup: createGuardedLookup(resolver) },
  });

  const api: $Fetch = ofetch.create({
    baseURL,
    headers,
    redirect: "manual",
    // Redirects and retries are disabled until each target can be explicitly
    // authorized. New sockets are guarded by the dispatcher above.
    retry: 0,
    timeout: 30_000,
    dispatcher,
  });

  const withValidatedTarget = async <T>(request: () => Promise<T>): Promise<T> => {
    // This is only an early, user-facing failure check. The Agent lookup above
    // is the authoritative security boundary because it validates the address
    // actually selected for the socket.
    await validateResolvedHostname(parsedUrl.hostname, resolver);
    return request();
  };

  return {
    async probeSiteInfo(): Promise<WpSiteInfo> {
      let data: Record<string, unknown>;
      try {
        data = await withValidatedTarget(() => api<Record<string, unknown>>(""));
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
        const data = await withValidatedTarget(() => api<WpRestPlugin[]>("wp/v2/plugins"));
        return data;
      } catch (err) {
        throw sanitizeError(err);
      }
    },

    async fetchPostTypes(): Promise<WpRestPostType[]> {
      let data: unknown;
      try {
        data = await withValidatedTarget(() => api<Record<string, Record<string, unknown>>>(
          "wp/v2/types",
        ));
      } catch (err) {
        throw sanitizeError(err);
      }

      if (data === null || typeof data !== "object") {
        return [];
      }

      return Object.entries(data as Record<string, Record<string, unknown>>).map(([slug, raw]) => ({
        slug,
        name: String(raw?.["name"] ?? ""),
        ...(raw?.["rest_base"] != null ? { restBase: String(raw["rest_base"]) } : {}),
        ...(raw?.["rest_namespace"] != null
          ? { restNamespace: String(raw["rest_namespace"]) }
          : {}),
        hierarchical: Boolean(raw?.["hierarchical"]),
      }));
    },

    async fetchPostCount(postType: string, restNamespace = "wp/v2"): Promise<number> {
      try {
        const namespace = restNamespace.replace(/^\/+|\/+$/g, "");
        const restBase = postType.replace(/^\/+|\/+$/g, "");
        const validRoutePart = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
        if (!validRoutePart.test(namespace) || !validRoutePart.test(restBase)) {
          throw new Error("Invalid WordPress REST route");
        }
        const response = await withValidatedTarget(() => api.raw(`${namespace}/${restBase}`, {
          query: { per_page: 1 },
        }));
        const total = response.headers.get("x-wp-total");
        if (!total) return 0;
        const count = Number(total);
        if (!Number.isSafeInteger(count) || count < 0) {
          throw new Error(`Invalid X-WP-Total header: ${total}`);
        }
        return count;
      } catch (err) {
        throw sanitizeError(err);
      }
    },

    async close(): Promise<void> {
      await dispatcher.close();
    },
  };
}
