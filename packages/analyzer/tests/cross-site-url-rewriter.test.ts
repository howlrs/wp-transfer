import { describe, it, expect } from "vitest";
import { rewriteCrossSiteUrls } from "../src/cross-site-url-rewriter.js";
import type { WpSite } from "@wp-transfer/core";

const sites: WpSite[] = [
  { siteId: 1, slug: "main", title: "Main", baseUrl: "https://example.com", networkUrl: "https://example.com", path: "/" },
  { siteId: 2, slug: "site2", title: "Sub", baseUrl: "https://example.com/site2", networkUrl: "https://example.com", path: "/site2" },
];

describe("rewriteCrossSiteUrls", () => {
  it("rewrites cross-site link in subpath mode", () => {
    const content = '<p>See <a href="https://example.com/site2/hello-from-sub/">this post</a>.</p>';
    const result = rewriteCrossSiteUrls(content, 1, 10, sites, "subpath");

    expect(result.rewritten).toContain('href="/site2/blog/hello-from-sub"');
    expect(result.links).toHaveLength(1);
    expect(result.links[0]!.targetSiteId).toBe(2);
    expect(result.links[0]!.rewrittenPath).toBe("/site2/blog/hello-from-sub");
  });

  it("rewrites cross-site link in subdomain mode", () => {
    const content = '<p>See <a href="https://example.com/site2/hello-from-sub/">this post</a>.</p>';
    const result = rewriteCrossSiteUrls(content, 1, 10, sites, "subdomain");

    expect(result.rewritten).toContain('href="/blog/hello-from-sub"');
  });

  it("rewrites link from sub to main site", () => {
    const content = '<p>Read <a href="https://example.com/welcome-to-main/">main post</a>.</p>';
    const result = rewriteCrossSiteUrls(content, 2, 20, sites, "subpath");

    expect(result.rewritten).toContain('href="/main/blog/welcome-to-main"');
    expect(result.links[0]!.targetSiteId).toBe(1);
  });

  it("falls back to the parent site when a nested base is not a path boundary", () => {
    const content = '<a href="https://example.com/site2-extra/main-post/">main post</a>';
    const result = rewriteCrossSiteUrls(content, 2, 20, sites, "subpath");

    expect(result.rewritten).toContain('href="/main/blog/main-post"');
    expect(result.links[0]!.targetSiteId).toBe(1);
  });

  it("skips external URLs", () => {
    const content = '<p>See <a href="https://external.com/page">external</a>.</p>';
    const result = rewriteCrossSiteUrls(content, 1, 10, sites, "subpath");

    expect(result.rewritten).toBe(content);
    expect(result.links).toHaveLength(0);
  });

  it("skips external URLs that contain a target site URL in their path", () => {
    const content = '<a href="https://outside.example/x/https://example.com/site2/post/">external redirect</a>';
    const result = rewriteCrossSiteUrls(content, 1, 10, sites, "subpath");

    expect(result.rewritten).toBe(content);
    expect(result.links).toHaveLength(0);
  });

  it("skips same-site URLs", () => {
    const content = '<p>See <a href="https://example.com/other-post/">local</a>.</p>';
    const result = rewriteCrossSiteUrls(content, 1, 10, sites, "subpath");

    expect(result.links).toHaveLength(0);
  });

  it("skips same-site URLs when the site is nested below another base URL", () => {
    const content = '<a href="https://example.com/site2/local-post/">local</a>';
    const result = rewriteCrossSiteUrls(content, 2, 20, sites, "subpath");

    expect(result.rewritten).toBe(content);
    expect(result.links).toHaveLength(0);
  });

  it("handles content with no links", () => {
    const content = "<p>No links here.</p>";
    const result = rewriteCrossSiteUrls(content, 1, 10, sites, "subpath");

    expect(result.rewritten).toBe(content);
    expect(result.links).toHaveLength(0);
  });

  it("extracts slug from date-based permalink", () => {
    const content = '<a href="https://example.com/site2/2024/01/15/hello-from-sub/">link</a>';
    const result = rewriteCrossSiteUrls(content, 1, 10, sites, "subpath");

    expect(result.links[0]!.rewrittenPath).toBe("/site2/blog/hello-from-sub");
  });

  it("handles 100 sites x 100KB content efficiently", () => {
    // Create 100 mock sites
    const manySites: WpSite[] = Array.from({ length: 100 }, (_, i) => ({
      siteId: i + 1,
      slug: `site${i + 1}`,
      title: `Site ${i + 1}`,
      baseUrl: `https://network.example.com/site${i + 1}`,
      networkUrl: "https://network.example.com",
      path: `/site${i + 1}`,
    }));

    // Build ~100KB content with ~50 cross-site links scattered among filler text
    const filler = "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>\n";
    const chunks: string[] = [];
    for (let i = 0; i < 50; i++) {
      // ~2KB filler between links
      for (let j = 0; j < 31; j++) chunks.push(filler);
      // Insert a cross-site link to a random other site (not site1)
      const targetId = (i % 99) + 2;
      chunks.push(`<p>See <a href="https://network.example.com/site${targetId}/post-${i}/">link</a></p>\n`);
    }
    const content = chunks.join("");
    expect(content.length).toBeGreaterThan(100_000);

    const start = performance.now();
    const result = rewriteCrossSiteUrls(content, 1, 1, manySites, "subpath");
    const elapsed = performance.now() - start;

    expect(result.links).toHaveLength(50);
    expect(elapsed).toBeLessThan(50);
  });
});
