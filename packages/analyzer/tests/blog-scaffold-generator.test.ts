import { describe, it, expect } from "vitest";
import { generateBlogScaffold } from "../src/blog-scaffold-generator.js";
import type { BlogScaffoldInput, ScaffoldFile } from "../src/blog-scaffold-generator.js";

// ── Helpers ──

function makeInput(overrides: Partial<BlogScaffoldInput> = {}): BlogScaffoldInput {
  return {
    siteTitle: "My WP Blog",
    siteUrl: "https://example.com",
    posts: [
      { slug: "hello-world", title: "Hello World", date: "2024-01-15", categories: ["general"] },
      { slug: "second-post", title: "Second Post", date: "2024-02-20", categories: ["tech"] },
    ],
    categories: [
      { slug: "general", name: "General", count: 1 },
      { slug: "tech", name: "Tech", count: 1 },
    ],
    hasYoastSeo: false,
    hasAcfFields: false,
    mediaDomains: ["example.com"],
    wpPermalinkStructure: "/%year%/%monthnum%/%postname%/",
    ...overrides,
  };
}

function findFile(files: ScaffoldFile[], pathPattern: string): ScaffoldFile | undefined {
  return files.find((f) => f.path.includes(pathPattern));
}

// ── Tests ──

describe("Blog Scaffold Generator", () => {
  it("generates blog post page (contains export default, params)", () => {
    const files = generateBlogScaffold(makeInput());
    const postPage = findFile(files, "app/blog/[slug]/page.tsx");

    expect(postPage).toBeDefined();
    expect(postPage!.content).toContain("export default");
    expect(postPage!.content).toContain("params");
  });

  it("generates blog archive page", () => {
    const files = generateBlogScaffold(makeInput());
    const archivePage = findFile(files, "app/blog/page.tsx");

    expect(archivePage).toBeDefined();
    expect(archivePage!.content).toContain("export default");
    expect(archivePage!.content).toContain("getAllPosts");
  });

  it("generates category archive page", () => {
    const files = generateBlogScaffold(makeInput());
    const categoryPage = findFile(files, "app/blog/category/[slug]/page.tsx");

    expect(categoryPage).toBeDefined();
    expect(categoryPage!.content).toContain("export default");
    expect(categoryPage!.content).toContain("getPostsByCategory");
  });

  it("generates 404 page (contains '404')", () => {
    const files = generateBlogScaffold(makeInput());
    const notFoundPage = findFile(files, "app/not-found.tsx");

    expect(notFoundPage).toBeDefined();
    expect(notFoundPage!.content).toContain("404");
  });

  it("generates root layout with site title", () => {
    const files = generateBlogScaffold(makeInput());
    const layout = findFile(files, "app/layout.tsx");

    expect(layout).toBeDefined();
    expect(layout!.content).toContain("My WP Blog");
    expect(layout!.content).toContain("Home");
    expect(layout!.content).toContain("Blog");
  });

  it("includes image remotePatterns in next.config.ts", () => {
    const files = generateBlogScaffold(makeInput({ mediaDomains: ["cdn.example.com", "images.wp.org"] }));
    const config = findFile(files, "next.config.ts");

    expect(config).toBeDefined();
    expect(config!.content).toContain("remotePatterns");
    expect(config!.content).toContain("cdn.example.com");
    expect(config!.content).toContain("images.wp.org");
  });

  it("includes redirects for dated permalink structure", () => {
    const files = generateBlogScaffold(makeInput({ wpPermalinkStructure: "/%year%/%monthnum%/%postname%/" }));
    const config = findFile(files, "next.config.ts");

    expect(config).toBeDefined();
    expect(config!.content).toContain("redirects");
    expect(config!.content).toContain("/blog/:slug");
  });

  it("generates content data layer (getPostBySlug, getAllPosts)", () => {
    const files = generateBlogScaffold(makeInput());
    const contentLib = findFile(files, "lib/content.ts");

    expect(contentLib).toBeDefined();
    expect(contentLib!.content).toContain("getPostBySlug");
    expect(contentLib!.content).toContain("getAllPosts");
    expect(contentLib!.content).toContain("getPostsByCategory");
    expect(contentLib!.content).toContain("getAllCategories");
  });

  it("generates portable text renderer component (PortableTextRenderer)", () => {
    const files = generateBlogScaffold(makeInput());
    const ptRenderer = findFile(files, "lib/portable-text.tsx");

    expect(ptRenderer).toBeDefined();
    expect(ptRenderer!.content).toContain("PortableTextRenderer");
    expect(ptRenderer!.content).toContain("use client");
  });

  it("includes Yoast metadata import when hasYoastSeo is true", () => {
    const files = generateBlogScaffold(makeInput({ hasYoastSeo: true }));
    const postPage = findFile(files, "app/blog/[slug]/page.tsx");

    expect(postPage).toBeDefined();
    expect(postPage!.content).toContain("generateYoastMetadata");
    expect(postPage!.content).toContain("@/lib/yoast-metadata");
  });

  it("includes ACF accessor when hasAcfFields is true", () => {
    const files = generateBlogScaffold(makeInput({ hasAcfFields: true }));
    const postPage = findFile(files, "app/blog/[slug]/page.tsx");

    expect(postPage).toBeDefined();
    expect(postPage!.content).toContain("getAcfFields");
    expect(postPage!.content).toContain("@/lib/acf-fields");
  });

  it("skips redirects when no permalink structure", () => {
    const files = generateBlogScaffold(makeInput({ wpPermalinkStructure: null }));
    const config = findFile(files, "next.config.ts");

    expect(config).toBeDefined();
    expect(config!.content).not.toContain("redirects");
  });

  // ── Security tests ──

  it("escapes site title with special characters", () => {
    const result = generateBlogScaffold(makeInput({
      siteTitle: 'My "Blog"; import("evil")//',
    }));
    const layout = findFile(result, "app/layout.tsx");
    // Quotes must be escaped — the title string literal must not close prematurely
    expect(layout!.content).toContain('My \\"Blog\\"; import(\\"evil\\")//');
    // The not-found page also embeds siteTitle
    const notFound = findFile(result, "app/not-found.tsx");
    expect(notFound!.content).toContain('Back to My \\"Blog\\"');
  });

  it("filters out invalid media domains", () => {
    const result = generateBlogScaffold(makeInput({
      mediaDomains: ["cdn.example.com", 'evil.com"}, {hostname: "hack.com'],
    }));
    const config = findFile(result, "next.config.ts");
    expect(config!.content).toContain("cdn.example.com");
    expect(config!.content).not.toContain("hack.com");
  });

  it("generates PT renderer without dangerouslySetInnerHTML for text blocks", () => {
    const result = generateBlogScaffold(makeInput());
    const pt = findFile(result, "lib/portable-text.tsx");
    // renderSpan should return React elements, not HTML strings
    expect(pt!.content).not.toMatch(/renderSpan.*return.*`<strong>/);
  });

  it("generates safeUrl helper for URL validation", () => {
    const result = generateBlogScaffold(makeInput());
    const pt = findFile(result, "lib/portable-text.tsx");
    expect(pt!.content).toContain("safeUrl");
    expect(pt!.content).toContain("protocol");
  });
});
