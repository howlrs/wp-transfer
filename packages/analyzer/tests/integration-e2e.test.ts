import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "@wp-transfer/wxr-parser";
import {
  analyzeSchema,
  parseGutenbergBlocks,
  convertBlocksToPortableText,
  generateBlogScaffold,
} from "../src/index.js";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/wxr");

describe("E2E: WXR parse → schema analysis → blog scaffold (large-500-posts.xml)", () => {
  it("runs the full pipeline and produces correct scaffold output", async () => {
    // Step 1: Parse the 500-post WXR file
    const stream = createReadStream(resolve(fixturesDir, "large-500-posts.xml"), "utf-8");
    const wxr = await parseWxr(stream);

    expect(wxr.siteTitle).toBe("Large Test Site");
    expect(wxr.siteUrl).toBe("https://example.com");
    expect(wxr.posts.length).toBe(500);
    expect(wxr.errors).toHaveLength(0);

    // Step 2: Analyze the schema
    const schema = analyzeSchema(wxr.posts, wxr.taxonomies, wxr.media);

    expect(schema.contentSummary.posts).toBe(500);
    expect(schema.hasYoastSeo).toBe(true);

    // Step 3: Convert Gutenberg blocks from a sample post
    const samplePost = wxr.posts[0]!;
    const blocks = parseGutenbergBlocks(samplePost.content);
    expect(blocks.length).toBeGreaterThan(0);

    const ptBlocks = convertBlocksToPortableText(blocks);
    expect(ptBlocks.length).toBeGreaterThan(0);

    // Verify expected PT block types present
    const ptTypes = new Set(ptBlocks.map((b) => b._type));
    expect(ptTypes).toContain("block");

    // Step 4: Generate the blog scaffold
    const categories = wxr.taxonomies
      .filter((t) => t.taxonomy === "category")
      .map((t) => ({ slug: t.slug, name: t.name, count: 0 }));

    const scaffoldFiles = generateBlogScaffold({
      siteTitle: wxr.siteTitle,
      siteUrl: wxr.siteUrl,
      posts: wxr.posts.map((p) => ({
        slug: p.slug,
        title: p.title,
        date: p.date,
        categories: [],
      })),
      categories,
      hasYoastSeo: schema.hasYoastSeo,
      hasAcfFields: schema.acfFields.length > 0,
      mediaDomains: [],
      wpPermalinkStructure: null,
    });

    // Step 5: Verify all expected scaffold files are present
    const paths = scaffoldFiles.map((f) => f.path);

    expect(paths).toContain("app/layout.tsx");
    expect(paths).toContain("app/globals.css");
    expect(paths).toContain("app/blog/page.tsx");
    expect(paths).toContain("app/blog/[slug]/page.tsx");
    expect(paths).toContain("app/blog/category/[slug]/page.tsx");
    expect(paths).toContain("app/not-found.tsx");
    expect(paths).toContain("lib/content.ts");
    expect(paths).toContain("lib/portable-text.tsx");
    expect(paths).toContain("next.config.ts");

    // Step 6: Verify file-based content layer (>100 posts triggers file-based approach)
    const contentLib = scaffoldFiles.find((f) => f.path === "lib/content.ts")!;
    expect(contentLib.content).toContain("readdirSync");
    expect(contentLib.content).toContain("readFileSync");
    expect(contentLib.content).toContain("content/posts");
    // Static approach would have inline `const posts: Post[] = []`
    expect(contentLib.content).not.toContain("const posts: Post[] = [];");

    // Step 7: Verify post page includes Yoast metadata support
    const postPage = scaffoldFiles.find((f) => f.path === "app/blog/[slug]/page.tsx")!;
    expect(postPage.content).toContain("generateMetadata");

    // Step 8: Verify layout uses the site title
    const layout = scaffoldFiles.find((f) => f.path === "app/layout.tsx")!;
    expect(layout.content).toContain("Large Test Site");
  });

  it("converts blocks from multiple posts without errors", async () => {
    const stream = createReadStream(resolve(fixturesDir, "large-500-posts.xml"), "utf-8");
    const wxr = await parseWxr(stream);

    // Convert blocks from first 20 posts to verify no crashes across varied content
    const samplePosts = wxr.posts.slice(0, 20);
    for (const post of samplePosts) {
      const blocks = parseGutenbergBlocks(post.content);
      const ptBlocks = convertBlocksToPortableText(blocks);
      expect(ptBlocks.length).toBeGreaterThan(0);
    }
  });
});
