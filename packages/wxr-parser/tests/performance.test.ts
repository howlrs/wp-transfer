import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "../src/index.js";

const LARGE_FIXTURE = resolve(__dirname, "../../../fixtures/wxr/large-500-posts.xml");

describe("WXR parser performance", () => {
  it("parses 500-post WXR under 2 seconds", async () => {
    const start = performance.now();
    const result = await parseWxr(createReadStream(LARGE_FIXTURE));
    const elapsed = performance.now() - start;

    expect(result.posts.length).toBe(500);
    expect(elapsed).toBeLessThan(2000);
  });

  it("extracts site metadata from large WXR", async () => {
    const result = await parseWxr(createReadStream(LARGE_FIXTURE));

    expect(result.siteTitle).toBe("Large Test Site");
    expect(result.siteUrl).toBe("https://example.com");
  });

  it("extracts categories from large WXR", async () => {
    const result = await parseWxr(createReadStream(LARGE_FIXTURE));

    expect(result.taxonomies.length).toBeGreaterThanOrEqual(2);
    const catNames = result.taxonomies.map((t) => t.name);
    expect(catNames).toContain("Tech");
    expect(catNames).toContain("News");
  });

  it("extracts Gutenberg blocks from large WXR posts", async () => {
    const result = await parseWxr(createReadStream(LARGE_FIXTURE));

    for (const post of result.posts.slice(0, 10)) {
      expect(post.content.length).toBeGreaterThan(0);
    }
  });

  it("extracts Yoast meta from large WXR posts", async () => {
    const result = await parseWxr(createReadStream(LARGE_FIXTURE));

    const postWithMeta = result.posts.find(
      (p) => p.meta && Object.keys(p.meta).some((k) => k.includes("yoast")),
    );
    expect(postWithMeta).toBeDefined();
  });
});
