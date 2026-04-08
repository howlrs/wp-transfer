import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ofetch before importing the module under test
const mockFetch = vi.fn();
vi.mock("ofetch", () => ({
  ofetch: {
    create: () => mockFetch,
  },
}));

import { createWpRestClient } from "../src/rest-client.js";

describe("WpRestClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
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
  });

  describe("error handling", () => {
    it("propagates connection errors", async () => {
      mockFetch.mockRejectedValueOnce(
        new Error("fetch failed: ECONNREFUSED"),
      );

      const client = createWpRestClient("https://down.example.com");
      await expect(client.probeSiteInfo()).rejects.toThrow("ECONNREFUSED");
    });
  });
});
