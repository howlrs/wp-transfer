import { ofetch, type $Fetch } from "ofetch";
import { validateUrl } from "./rest-client.js";

// -- Types --

export interface WooOrder {
  id: number;
  status: string;
  total: string;
  currency: string;
  customerId: number;
  billing: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  lineItems: {
    productId: number;
    name: string;
    quantity: number;
    total: string;
  }[];
  createdAt: string;
}

export interface WooCustomer {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  billing: {
    address1: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  ordersCount: number;
  totalSpent: string;
}

export interface WooRestClientOptions {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

// -- Normalizers (exported for testing) --

export function normalizeOrder(raw: Record<string, unknown>): WooOrder {
  const billing = (raw["billing"] ?? {}) as Record<string, unknown>;
  const lineItems = Array.isArray(raw["line_items"]) ? raw["line_items"] : [];

  return {
    id: Number(raw["id"] ?? 0),
    status: String(raw["status"] ?? ""),
    total: String(raw["total"] ?? "0"),
    currency: String(raw["currency"] ?? "USD"),
    customerId: Number(raw["customer_id"] ?? 0),
    billing: {
      firstName: String(billing["first_name"] ?? ""),
      lastName: String(billing["last_name"] ?? ""),
      email: String(billing["email"] ?? ""),
      phone: String(billing["phone"] ?? ""),
    },
    lineItems: lineItems.map((item: Record<string, unknown>) => ({
      productId: Number(item["product_id"] ?? 0),
      name: String(item["name"] ?? ""),
      quantity: Number(item["quantity"] ?? 0),
      total: String(item["total"] ?? "0"),
    })),
    createdAt: String(raw["date_created"] ?? ""),
  };
}

export function normalizeCustomer(
  raw: Record<string, unknown>,
): WooCustomer {
  const billing = (raw["billing"] ?? {}) as Record<string, unknown>;

  return {
    id: Number(raw["id"] ?? 0),
    email: String(raw["email"] ?? ""),
    firstName: String(raw["first_name"] ?? ""),
    lastName: String(raw["last_name"] ?? ""),
    billing: {
      address1: String(billing["address_1"] ?? ""),
      city: String(billing["city"] ?? ""),
      state: String(billing["state"] ?? ""),
      postcode: String(billing["postcode"] ?? ""),
      country: String(billing["country"] ?? ""),
    },
    ordersCount: Number(raw["orders_count"] ?? 0),
    totalSpent: String(raw["total_spent"] ?? "0"),
  };
}

// -- URL builder (exported for testing) --

export function buildWooUrl(
  siteUrl: string,
  endpoint: string,
  consumerKey: string,
  consumerSecret: string,
  params: Record<string, string | number> = {},
): string {
  const base = siteUrl.replace(/\/+$/, "");
  const url = new URL(`${base}/wp-json/wc/v3/${endpoint}`);
  url.searchParams.set("consumer_key", consumerKey);
  url.searchParams.set("consumer_secret", consumerSecret);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

// -- Error sanitisation --

function sanitizeError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  const sanitized = message
    .replace(/consumer_key=[^&\s]+/gi, "consumer_key=[REDACTED]")
    .replace(/consumer_secret=[^&\s]+/gi, "consumer_secret=[REDACTED]");
  return new Error(sanitized);
}

// -- Factory --

export function createWooRestClient(options: WooRestClientOptions) {
  const { siteUrl, consumerKey, consumerSecret } = options;

  // SSRF protection
  validateUrl(siteUrl);

  // HTTPS enforcement
  const parsed = new URL(siteUrl);
  if (parsed.protocol !== "https:") {
    throw new Error(
      "WooCommerce API requires HTTPS. Refusing non-HTTPS URL to protect credentials.",
    );
  }

  const baseURL =
    siteUrl.replace(/\/+$/, "") + "/wp-json/wc/v3/";

  const api: $Fetch = ofetch.create({
    baseURL,
    timeout: 30_000,
    query: {
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
    },
  });

  async function fetchPage<T>(
    endpoint: string,
    page: number,
    perPage: number,
  ): Promise<{ data: T[]; totalPages: number }> {
    try {
      const response = await api.raw(endpoint, {
        query: {
          consumer_key: consumerKey,
          consumer_secret: consumerSecret,
          page: String(page),
          per_page: String(perPage),
        },
      });
      const totalPages = parseInt(
        response.headers.get("x-wp-totalpages") ?? "1",
        10,
      );
      return { data: response._data as T[], totalPages };
    } catch (err) {
      throw sanitizeError(err);
    }
  }

  return {
    async fetchOrders(
      page = 1,
      perPage = 100,
    ): Promise<WooOrder[]> {
      const { data } = await fetchPage<Record<string, unknown>>(
        "orders",
        page,
        perPage,
      );
      return data.map(normalizeOrder);
    },

    async fetchAllOrders(): Promise<WooOrder[]> {
      const allOrders: WooOrder[] = [];
      let page = 1;
      let totalPages = 1;

      do {
        const result = await fetchPage<Record<string, unknown>>(
          "orders",
          page,
          100,
        );
        totalPages = result.totalPages;
        allOrders.push(...result.data.map(normalizeOrder));
        page++;
      } while (page <= totalPages);

      return allOrders;
    },

    async fetchCustomers(
      page = 1,
      perPage = 100,
    ): Promise<WooCustomer[]> {
      const { data } = await fetchPage<Record<string, unknown>>(
        "customers",
        page,
        perPage,
      );
      return data.map(normalizeCustomer);
    },

    async fetchAllCustomers(): Promise<WooCustomer[]> {
      const allCustomers: WooCustomer[] = [];
      let page = 1;
      let totalPages = 1;

      do {
        const result = await fetchPage<Record<string, unknown>>(
          "customers",
          page,
          100,
        );
        totalPages = result.totalPages;
        allCustomers.push(...result.data.map(normalizeCustomer));
        page++;
      } while (page <= totalPages);

      return allCustomers;
    },
  };
}
