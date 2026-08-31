import { describe, it, expect, vi, beforeEach } from "vitest";

const undiciMocks = vi.hoisted(() => ({ agents: [] as unknown[], closeCalls: 0 }));

// Mock ofetch before importing the module under test
const mockFetch = vi.fn() as ReturnType<typeof vi.fn> & { raw: ReturnType<typeof vi.fn> };
mockFetch.raw = vi.fn();

vi.mock("ofetch", () => ({
  ofetch: {
    create: () => mockFetch,
  },
}));

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
}));

vi.mock("undici", () => ({
  Agent: class {
    constructor(options: unknown) {
      undiciMocks.agents.push(options);
    }

    async close() {
      undiciMocks.closeCalls += 1;
    }
  },
}));

import { createWpRestClient, isGlobalIp, validateUrl } from "../src/rest-client.js";

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

  it("rejects URL userinfo so credentials cannot be logged with the site URL", () => {
    expect(() => validateUrl("https://user:secret@example.com")).toThrow("must not include credentials");
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

  it.each([
    "http://[fc00::1]",
    "http://[fd12:3456::1]",
    "http://[fe80::1]",
    "http://[::ffff:127.0.0.1]",
    "http://[::ffff:10.0.0.1]",
  ])("rejects private IPv6 form %s", (url) => {
    expect(() => validateUrl(url)).toThrow("private/reserved");
  });

  it("classifies only globally routable addresses as global", () => {
    expect(isGlobalIp("8.8.8.8")).toBe(true);
    expect(isGlobalIp("2001:4860:4860::8888")).toBe(true);
    expect(isGlobalIp("::ffff:192.168.1.1")).toBe(false);
  });
});

describe("WpRestClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.raw.mockReset();
    undiciMocks.agents.length = 0;
    undiciMocks.closeCalls = 0;
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

    it("rejects credentials over HTTP before constructing a transport", () => {
      expect(() => createWpRestClient("http://example.com", {
        username: "admin",
        applicationPassword: "app-password",
      })).toThrow("requires HTTPS");
    });

    it("rejects a hostname when any resolved DNS answer is private", async () => {
      const client = createWpRestClient("https://example.com", undefined, {
        resolver: async () => ["93.184.216.34", "10.0.0.8"],
      });

      await expect(client.probeSiteInfo()).rejects.toThrow("resolves to a private/reserved");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("revalidates DNS for each request so a rebinding answer is rejected", async () => {
      const resolver = vi.fn()
        .mockResolvedValueOnce(["93.184.216.34"])
        .mockResolvedValueOnce(["::ffff:127.0.0.1"]);
      const client = createWpRestClient("https://example.com", undefined, { resolver });
      mockFetch.mockResolvedValueOnce({ name: "Public", namespaces: [] });

      await expect(client.probeSiteInfo()).resolves.toMatchObject({ name: "Public" });
      await expect(client.fetchPlugins()).rejects.toThrow("resolves to a private/reserved");
      expect(resolver).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("refuses a private DNS answer at socket lookup time before HTTP is reached", async () => {
      const resolver = vi.fn()
        .mockResolvedValueOnce(["93.184.216.34"])
        .mockResolvedValueOnce(["127.0.0.1"]);
      const client = createWpRestClient("https://example.com", undefined, { resolver });
      mockFetch.mockResolvedValueOnce({ name: "Public", namespaces: [] });

      await client.probeSiteInfo(); // logical-request validation sees a public answer
      const agentOptions = undiciMocks.agents[0] as {
        connect: {
          lookup: (
            hostname: string,
            options: { family?: number },
            callback: (error: Error | null, address: string, family: number) => void,
          ) => void;
        };
      };
      const connection = new Promise<void>((resolve, reject) => {
        agentOptions.connect.lookup("example.com", { family: 0 }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      await expect(connection).rejects.toThrow("resolves to a private/reserved");
      expect(resolver).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await client.close();
      expect(undiciMocks.closeCalls).toBe(1);
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
        book: {
          name: "Books",
          rest_base: "library",
          rest_namespace: "acme/v1",
          hierarchical: false,
        },
      });

      const client = createWpRestClient("https://example.com");
      const types = await client.fetchPostTypes();

      expect(types).toHaveLength(4);
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
      expect(types[3]).toEqual({
        slug: "book",
        name: "Books",
        restBase: "library",
        restNamespace: "acme/v1",
        hierarchical: false,
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

    it.each(["not-a-number", "-1", "1.5"])(
      "rejects malformed X-WP-Total header %s",
      async (total) => {
        mockFetch.raw.mockResolvedValueOnce({
          headers: new Headers({ "x-wp-total": total }),
          _data: [{}],
        });

        const client = createWpRestClient("https://example.com");

        await expect(client.fetchPostCount("posts")).rejects.toThrow(
          "Invalid X-WP-Total header",
        );
      },
    );

    it("uses a custom REST namespace when the post type declares one", async () => {
      mockFetch.raw.mockResolvedValueOnce({
        headers: new Headers({ "x-wp-total": "7" }),
        _data: [{}],
      });

      const client = createWpRestClient("https://example.com");
      const count = await client.fetchPostCount("library", "acme/v1");

      expect(count).toBe(7);
      expect(mockFetch.raw).toHaveBeenCalledWith("acme/v1/library", {
        query: { per_page: 1 },
      });
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
        expect(message).not.toContain("dXNlcjpwYXNz");
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
