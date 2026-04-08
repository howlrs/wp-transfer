import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ofetch before importing the module under test
const mockFetch = vi.fn() as ReturnType<typeof vi.fn> & { raw: ReturnType<typeof vi.fn> };
mockFetch.raw = vi.fn();

vi.mock("ofetch", () => ({
  ofetch: {
    create: () => mockFetch,
  },
}));

import { createWpRestClient, validateUrl } from "../src/rest-client.js";

describe("validateUrl", () => {
  it("allows http URLs", () => {
    expect(() => validateUrl("http://example.com")).not.toThrow();
  });

  it("allows https URLs", () => {
    expect(() => validateUrl("https://example.com")).not.toThrow();
  });

  it("rejects ftp scheme", () => {
    expect(() => validateUrl("ftp://example.com")).toThrow("Invalid URL scheme");
  });

  it("rejects javascript scheme", () => {
    expect(() => validateUrl("javascript:alert(1)")).toThrow("Invalid URL scheme");
  });

  it("rejects file scheme", () => {
    expect(() => validateUrl("file:///etc/passwd")).toThrow("Invalid URL scheme");
  });

  it("rejects invalid URLs", () => {
    expect(() => validateUrl("not-a-url")).toThrow("Invalid URL");
  });

  it("rejects localhost", () => {
    expect(() => validateUrl("http://localhost")).toThrow("private/reserved");
  });

  it("rejects 127.0.0.1", () => {
    expect(() => validateUrl("http://127.0.0.1")).toThrow("private/reserved");
  });

  it("rejects 10.x.x.x", () => {
    expect(() => validateUrl("http://10.0.0.1")).toThrow("private/reserved");
  });

  it("rejects 172.16-31.x.x", () => {
    expect(() => validateUrl("http://172.16.0.1")).toThrow("private/reserved");
    expect(() => validateUrl("http://172.31.255.255")).toThrow("private/reserved");
  });

  it("allows 172.15.x.x (not private)", () => {
    expect(() => validateUrl("http://172.15.0.1")).not.toThrow();
  });

  it("rejects 192.168.x.x", () => {
    expect(() => validateUrl("http://192.168.1.1")).toThrow("private/reserved");
  });

  it("rejects 169.254.x.x", () => {
    expect(() => validateUrl("http://169.254.169.254")).toThrow("private/reserved");
  });

  it("rejects 0.0.0.0", () => {
    expect(() => validateUrl("http://0.0.0.0")).toThrow("private/reserved");
  });

  it("rejects [::1]", () => {
    expect(() => validateUrl("http://[::1]")).toThrow("private/reserved");
  });
});

describe("WpRestClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.raw.mockReset();
  });

  describe("SSRF protection", () => {
    it("throws when creating client with private IP", () => {
      expect(() => createWpRestClient("http://127.0.0.1")).toThrow(
        "private/reserved",
      );
    });

    it("throws when creating client with localhost", () => {
      expect(() => createWpRestClient("http://localhost")).toThrow(
        "private/reserved",
      );
    });

    it("throws when creating client with non-http scheme", () => {
      expect(() => createWpRestClient("ftp://example.com")).toThrow(
        "Invalid URL scheme",
      );
    });
  });

  describe("probeSiteInfo", () => {
    it("parses site name and namespaces from root endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        name: "My WordPress Site",
        description: "Just another WordPress site",
        url: "https://example.com",
        namespaces: ["wp/v2", "oembed/1.0"],
        authentication: {
          "application-passwords": {
            endpoints: { authorization: "https://example.com/wp-admin/" },
          },
        },
      });

      const client = createWpRestClient("https://example.com");
      const info = await client.probeSiteInfo();

      expect(info.name).toBe("My WordPress Site");
      expect(info.description).toBe("Just another WordPress site");
      expect(info.url).toBe("https://example.com");
      expect(info.namespaces).toContain("wp/v2");
      expect(info.hasApplicationPasswords).toBe(true);
    });

    it("returns hasApplicationPasswords=false when not present", async () => {
      mockFetch.mockResolvedValueOnce({
        name: "Old Site",
        description: "",
        url: "https://old.example.com",
        namespaces: ["wp/v2"],
      });

      const client = createWpRestClient("https://old.example.com");
      const info = await client.probeSiteInfo();

      expect(info.hasApplicationPasswords).toBe(false);
    });
  });

  describe("fetchPlugins", () => {
    it("returns plugin list with auth", async () => {
      const plugins = [
        {
          plugin: "wordpress-seo/wp-seo.php",
          status: "active",
          name: "Yoast SEO",
          version: "21.0",
          author: "Team Yoast",
        },
        {
          plugin: "akismet/akismet.php",
          status: "inactive",
          name: "Akismet Anti-Spam",
          version: "5.3",
        },
      ];
      mockFetch.mockResolvedValueOnce(plugins);

      const client = createWpRestClient("https://example.com", {
        username: "admin",
        applicationPassword: "xxxx xxxx xxxx",
      });
      const result = await client.fetchPlugins();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Yoast SEO");
      expect(result[0].status).toBe("active");
      expect(result[1].plugin).toBe("akismet/akismet.php");
    });
  });

  describe("fetchPostTypes", () => {
    it("converts object response to array", async () => {
      mockFetch.mockResolvedValueOnce({
        post: {
          name: "Posts",
          rest_base: "posts",
          hierarchical: false,
        },
        page: {
          name: "Pages",
          rest_base: "pages",
          hierarchical: true,
        },
        attachment: {
          name: "Media",
          rest_base: "media",
          hierarchical: false,
        },
      });

      const client = createWpRestClient("https://example.com");
      const types = await client.fetchPostTypes();

      expect(types).toHaveLength(3);
      expect(types[0]).toEqual({
        slug: "post",
        name: "Posts",
        restBase: "posts",
        hierarchical: false,
      });
      expect(types[1]).toEqual({
        slug: "page",
        name: "Pages",
        restBase: "pages",
        hierarchical: true,
      });
    });

    it("returns empty array when response is null", async () => {
      mockFetch.mockResolvedValueOnce(null);

      const client = createWpRestClient("https://example.com");
      const types = await client.fetchPostTypes();

      expect(types).toEqual([]);
    });
  });

  describe("fetchPostCount", () => {
    it("reads X-WP-Total header for accurate count", async () => {
      mockFetch.raw.mockResolvedValueOnce({
        headers: new Headers({ "x-wp-total": "42" }),
        _data: [{}],
      });

      const client = createWpRestClient("https://example.com");
      const count = await client.fetchPostCount("posts");

      expect(count).toBe(42);
    });

    it("returns 0 when X-WP-Total header is missing", async () => {
      mockFetch.raw.mockResolvedValueOnce({
        headers: new Headers(),
        _data: [],
      });

      const client = createWpRestClient("https://example.com");
      const count = await client.fetchPostCount("posts");

      expect(count).toBe(0);
    });
  });

  describe("error handling", () => {
    it("sanitizes authorization headers from error messages", async () => {
      mockFetch.mockRejectedValueOnce(
        new Error("fetch failed: Authorization: Basic dXNlcjpwYXNz ECONNREFUSED"),
      );

      const client = createWpRestClient("https://down.example.com");

      try {
        await client.probeSiteInfo();
        expect.unreachable("should have thrown");
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain("ECONNREFUSED");
        expect(message).not.toContain("Basic dXNlcjpwYXNz");
        expect(message).toContain("[REDACTED]");
      }
    });

    it("propagates connection errors without credentials", async () => {
      mockFetch.mockRejectedValueOnce(
        new Error("fetch failed: ECONNREFUSED"),
      );

      const client = createWpRestClient("https://down.example.com");
      await expect(client.probeSiteInfo()).rejects.toThrow("ECONNREFUSED");
    });
  });
});
