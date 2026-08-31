import { afterEach, describe, it, expect, vi } from "vitest";
import { ofetch } from "ofetch";
import {
  normalizeOrder,
  normalizeCustomer,
  buildWooUrl,
  createWooRestClient,
} from "../src/woo-rest-client.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockWooResponses(responses: Array<{ data: Record<string, unknown>[]; totalPages: string }>) {
  const raw = vi.fn();
  for (const response of responses) {
    raw.mockResolvedValueOnce({
      _data: response.data,
      headers: { get: vi.fn((name: string) => name === "x-wp-totalpages" ? response.totalPages : null) },
    });
  }
  vi.spyOn(ofetch, "create").mockReturnValue({ raw } as never);
  return raw;
}

describe("createWooRestClient", () => {
  it("rejects non-HTTPS URLs", () => {
    expect(() =>
      createWooRestClient({
        siteUrl: "http://example.com",
        consumerKey: "ck_test",
        consumerSecret: "cs_test",
      }),
    ).toThrow("requires HTTPS");
  });

  it("rejects private/reserved IPs via SSRF protection", () => {
    expect(() =>
      createWooRestClient({
        siteUrl: "https://127.0.0.1",
        consumerKey: "ck_test",
        consumerSecret: "cs_test",
      }),
    ).toThrow("private/reserved");
  });

  it("accepts valid HTTPS URLs", () => {
    expect(() =>
      createWooRestClient({
        siteUrl: "https://shop.example.com",
        consumerKey: "ck_test",
        consumerSecret: "cs_test",
      }),
    ).not.toThrow();
  });

  it("normalizes every paginated order and customer page", async () => {
    const raw = mockWooResponses([
      { data: [{ id: 1, status: "processing" }], totalPages: "2" },
      { data: [{ id: 2, status: "completed" }], totalPages: "2" },
      { data: [{ id: 3, email: "one@example.com" }], totalPages: "2" },
      { data: [{ id: 4, email: "two@example.com" }], totalPages: "2" },
    ]);
    const client = createWooRestClient({
      siteUrl: "https://shop.example.com",
      consumerKey: "ck_test",
      consumerSecret: "cs_test",
    });

    await expect(client.fetchAllOrders()).resolves.toMatchObject([{ id: 1 }, { id: 2 }]);
    await expect(client.fetchAllCustomers()).resolves.toMatchObject([{ id: 3 }, { id: 4 }]);
    expect(raw).toHaveBeenCalledTimes(4);
    expect(raw).toHaveBeenNthCalledWith(1, "orders", expect.objectContaining({ query: expect.objectContaining({ page: "1", per_page: "100" }) }));
    expect(raw).toHaveBeenNthCalledWith(4, "customers", expect.objectContaining({ query: expect.objectContaining({ page: "2" }) }));
  });

  it("fetches individual order and customer pages with caller pagination", async () => {
    const raw = mockWooResponses([
      { data: [{ id: 10, status: "pending" }], totalPages: "1" },
      { data: [{ id: 20, email: "customer@example.com" }], totalPages: "1" },
    ]);
    const client = createWooRestClient({
      siteUrl: "https://shop.example.com",
      consumerKey: "ck_test",
      consumerSecret: "cs_test",
    });

    await expect(client.fetchOrders(3, 25)).resolves.toMatchObject([{ id: 10, status: "pending" }]);
    await expect(client.fetchCustomers(4, 10)).resolves.toMatchObject([{ id: 20, email: "customer@example.com" }]);
    expect(raw).toHaveBeenNthCalledWith(1, "orders", expect.objectContaining({ query: expect.objectContaining({ page: "3", per_page: "25" }) }));
    expect(raw).toHaveBeenNthCalledWith(2, "customers", expect.objectContaining({ query: expect.objectContaining({ page: "4", per_page: "10" }) }));
  });

  it("redacts WooCommerce credentials when a request fails", async () => {
    const raw = vi.fn().mockRejectedValue(new Error("request failed: consumer_key=example-key&consumer_secret=example-secret"));
    vi.spyOn(ofetch, "create").mockReturnValue({ raw } as never);
    const client = createWooRestClient({
      siteUrl: "https://shop.example.com",
      consumerKey: "ck_test",
      consumerSecret: "cs_test",
    });

    await expect(client.fetchOrders()).rejects.toThrow("consumer_key=[REDACTED]&consumer_secret=[REDACTED]");
  });
});

describe("buildWooUrl", () => {
  it("constructs correct URL with auth params", () => {
    const url = buildWooUrl(
      "https://shop.example.com",
      "orders",
      "ck_abc123",
      "cs_xyz789",
    );

    expect(url).toContain("https://shop.example.com/wp-json/wc/v3/orders");
    expect(url).toContain("consumer_key=ck_abc123");
    expect(url).toContain("consumer_secret=cs_xyz789");
  });

  it("strips trailing slashes from siteUrl", () => {
    const url = buildWooUrl(
      "https://shop.example.com///",
      "customers",
      "ck_key",
      "cs_secret",
    );

    expect(url).toContain("https://shop.example.com/wp-json/wc/v3/customers");
  });

  it("appends extra query params", () => {
    const url = buildWooUrl(
      "https://shop.example.com",
      "orders",
      "ck_key",
      "cs_secret",
      { page: 2, per_page: 50 },
    );

    expect(url).toContain("page=2");
    expect(url).toContain("per_page=50");
  });
});

describe("normalizeOrder", () => {
  it("normalizes order data from WooCommerce API response", () => {
    const raw = {
      id: 123,
      status: "completed",
      total: "59.98",
      currency: "JPY",
      customer_id: 7,
      billing: {
        first_name: "Taro",
        last_name: "Yamada",
        email: "taro@example.com",
        phone: "090-1234-5678",
      },
      line_items: [
        {
          product_id: 10,
          name: "Widget A",
          quantity: 2,
          total: "39.98",
        },
        {
          product_id: 20,
          name: "Widget B",
          quantity: 1,
          total: "20.00",
        },
      ],
      date_created: "2024-06-15T10:30:00",
    };

    const order = normalizeOrder(raw);

    expect(order.id).toBe(123);
    expect(order.status).toBe("completed");
    expect(order.total).toBe("59.98");
    expect(order.currency).toBe("JPY");
    expect(order.customerId).toBe(7);
    expect(order.billing.firstName).toBe("Taro");
    expect(order.billing.lastName).toBe("Yamada");
    expect(order.billing.email).toBe("taro@example.com");
    expect(order.billing.phone).toBe("090-1234-5678");
    expect(order.lineItems).toHaveLength(2);
    expect(order.lineItems[0]).toEqual({
      productId: 10,
      name: "Widget A",
      quantity: 2,
      total: "39.98",
    });
    expect(order.createdAt).toBe("2024-06-15T10:30:00");
  });

  it("handles missing fields with defaults", () => {
    const order = normalizeOrder({});

    expect(order.id).toBe(0);
    expect(order.status).toBe("");
    expect(order.total).toBe("0");
    expect(order.currency).toBe("USD");
    expect(order.customerId).toBe(0);
    expect(order.billing.firstName).toBe("");
    expect(order.billing.email).toBe("");
    expect(order.lineItems).toEqual([]);
    expect(order.createdAt).toBe("");
  });

  it("handles null line_items gracefully", () => {
    const order = normalizeOrder({ line_items: null });
    expect(order.lineItems).toEqual([]);
  });
});

describe("normalizeCustomer", () => {
  it("normalizes customer data from WooCommerce API response", () => {
    const raw = {
      id: 7,
      email: "taro@example.com",
      first_name: "Taro",
      last_name: "Yamada",
      billing: {
        address_1: "1-2-3 Shibuya",
        city: "Tokyo",
        state: "JP13",
        postcode: "150-0002",
        country: "JP",
      },
      orders_count: 5,
      total_spent: "299.95",
    };

    const customer = normalizeCustomer(raw);

    expect(customer.id).toBe(7);
    expect(customer.email).toBe("taro@example.com");
    expect(customer.firstName).toBe("Taro");
    expect(customer.lastName).toBe("Yamada");
    expect(customer.billing.address1).toBe("1-2-3 Shibuya");
    expect(customer.billing.city).toBe("Tokyo");
    expect(customer.billing.state).toBe("JP13");
    expect(customer.billing.postcode).toBe("150-0002");
    expect(customer.billing.country).toBe("JP");
    expect(customer.ordersCount).toBe(5);
    expect(customer.totalSpent).toBe("299.95");
  });

  it("handles missing fields with defaults", () => {
    const customer = normalizeCustomer({});

    expect(customer.id).toBe(0);
    expect(customer.email).toBe("");
    expect(customer.firstName).toBe("");
    expect(customer.lastName).toBe("");
    expect(customer.billing.address1).toBe("");
    expect(customer.billing.city).toBe("");
    expect(customer.billing.country).toBe("");
    expect(customer.ordersCount).toBe(0);
    expect(customer.totalSpent).toBe("0");
  });
});
