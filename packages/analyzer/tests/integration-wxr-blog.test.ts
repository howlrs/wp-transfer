import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "@wp-transfer/wxr-parser";
import {
  analyzeSchema,
  parseGutenbergBlocks,
  convertBlocksToPortableText,
  extractYoastMeta,
  generateBlogScaffold,
  generateVerifyScaffold,
} from "../src/index.js";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/wxr");

describe("Integration: WXR → Blog Scaffold (gutenberg-blocks.xml)", () => {
  it("parses WXR, converts Gutenberg blocks to PT, analyzes schema, and generates scaffolds", async () => {
    // Step 1: Parse WXR
    const stream = createReadStream(resolve(fixturesDir, "gutenberg-blocks.xml"), "utf-8");
    const wxr = await parseWxr(stream);

    expect(wxr.posts.length).toBeGreaterThan(0);

    // Step 2: Convert first post's content via Gutenberg parser + PT converter
    const firstPost = wxr.posts[0]!;
    const blocks = parseGutenbergBlocks(firstPost.content);
    const ptBlocks = convertBlocksToPortableText(blocks);

    expect(ptBlocks.length).toBeGreaterThan(0);

    // Step 3: Verify multiple block types present
    const types = new Set(ptBlocks.map((b) => b._type));
    expect(types).toContain("block");   // paragraph, heading, list items
    expect(types).toContain("image");   // wp:image
    expect(types).toContain("code");    // wp:code
    expect(types).toContain("embed");   // wp:embed

    // Step 4: Analyze schema
    const schema = analyzeSchema(wxr.posts, wxr.taxonomies, wxr.media);
    expect(schema.contentSummary.posts).toBeGreaterThan(0);

    // Step 5: Generate blog scaffold — verify expected file paths present
    const scaffoldInput = {
      siteTitle: wxr.siteTitle,
      siteUrl: wxr.siteUrl,
      posts: wxr.posts.map((p) => ({
        slug: p.slug,
        title: p.title,
        date: p.date,
        categories: [],
      })),
      categories: [],
      hasYoastSeo: schema.hasYoastSeo,
      hasAcfFields: schema.acfFields.length > 0,
      mediaDomains: [],
      wpPermalinkStructure: null,
    };

    const scaffoldFiles = generateBlogScaffold(scaffoldInput);
    const scaffoldPaths = scaffoldFiles.map((f) => f.path);

    expect(scaffoldPaths).toContain("app/layout.tsx");
    expect(scaffoldPaths).toContain("app/globals.css");
    expect(scaffoldPaths).toContain("app/blog/page.tsx");
    expect(scaffoldPaths).toContain("app/blog/[slug]/page.tsx");
    expect(scaffoldPaths).toContain("app/blog/category/[slug]/page.tsx");
    expect(scaffoldPaths).toContain("app/not-found.tsx");
    expect(scaffoldPaths).toContain("lib/content.ts");
    expect(scaffoldPaths).toContain("lib/portable-text.tsx");
    expect(scaffoldPaths).toContain("next.config.ts");

    // Step 6: Generate verify scaffold — verify playwright.config.ts and smoke.spec.ts
    const verifyFiles = generateVerifyScaffold({
      postSlugs: wxr.posts.map((p) => p.slug),
      categorySlugs: [],
    });
    const verifyPaths = verifyFiles.map((f) => f.path);

    expect(verifyPaths).toContain("playwright.config.ts");
    expect(verifyPaths).toContain("e2e/smoke.spec.ts");
  });
});

describe("Integration: WXR → Blog Scaffold (acf-fields.xml)", () => {
  it("parses WXR, detects Yoast + ACF, extracts meta, and generates scaffold with correct imports", async () => {
    // Step 1: Parse WXR
    const stream = createReadStream(resolve(fixturesDir, "acf-fields.xml"), "utf-8");
    const wxr = await parseWxr(stream);

    expect(wxr.posts.length).toBeGreaterThan(0);

    // Step 2: Analyze schema — verify hasYoastSeo and acfFields
    const schema = analyzeSchema(wxr.posts, wxr.taxonomies, wxr.media);
    expect(schema.hasYoastSeo).toBe(true);
    expect(schema.acfFields.length).toBeGreaterThan(0);

    // Step 3: Extract Yoast meta from first post
    const firstPost = wxr.posts[0]!;
    const yoastMeta = extractYoastMeta(firstPost.meta);

    expect(yoastMeta.title).toContain("%%sep%%");
    expect(yoastMeta.description).toBeTruthy();

    // Step 4: Generate scaffold with hasYoastSeo=true, hasAcfFields=true
    const scaffoldFiles = generateBlogScaffold({
      siteTitle: wxr.siteTitle,
      siteUrl: wxr.siteUrl,
      posts: wxr.posts.map((p) => ({
        slug: p.slug,
        title: p.title,
        date: p.date,
        categories: [],
      })),
      categories: [],
      hasYoastSeo: true,
      hasAcfFields: true,
      mediaDomains: [],
      wpPermalinkStructure: null,
    });

    // Step 5: Verify post page contains generateMetadata and getAcfFields
    const postPage = scaffoldFiles.find((f) => f.path === "app/blog/[slug]/page.tsx");
    expect(postPage).toBeDefined();
    expect(postPage!.content).toContain("generateMetadata");
    expect(postPage!.content).toContain("getAcfFields");
  });
});
