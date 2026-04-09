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

  it("skips external URLs", () => {
    const content = '<p>See <a href="https://external.com/page">external</a>.</p>';
    const result = rewriteCrossSiteUrls(content, 1, 10, sites, "subpath");

    expect(result.rewritten).toBe(content);
    expect(result.links).toHaveLength(0);
  });

  it("skips same-site URLs", () => {
    const content = '<p>See <a href="https://example.com/other-post/">local</a>.</p>';
    const result = rewriteCrossSiteUrls(content, 1, 10, sites, "subpath");

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
});
