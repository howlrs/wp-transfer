import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "../src/index.js";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/wxr");

describe("parseWxr — wp-4.7-classic.xml", () => {
  function openFixture() {
    return createReadStream(
      resolve(fixturesDir, "wp-4.7-classic.xml"),
      "utf-8",
    );
  }

  it("extracts WP version 4.7.28 from generator tag", async () => {
    const result = await parseWxr(openFixture());
    expect(result.wpVersion).toBe("4.7.28");
  });

  it("extracts site metadata correctly", async () => {
    const result = await parseWxr(openFixture());
    expect(result.siteTitle).toBe("Classic Editor Site");
    expect(result.siteUrl).toBe("https://classic.example.com");
  });

  it("parses classic editor content as plain HTML (no block comments)", async () => {
    const result = await parseWxr(openFixture());

    expect(result.posts).toHaveLength(2);
    const post = result.posts[0];

    // Classic editor content has NO Gutenberg block comment markers
    expect(post.content).not.toContain("<!-- wp:");
    expect(post.content).not.toContain("<!-- /wp:");

    // But does contain HTML elements
    expect(post.content).toContain("<h2>Welcome to Our Site</h2>");
    expect(post.content).toContain("<strong>bold text</strong>");
    expect(post.content).toContain("<em>italic text</em>");
    expect(post.content).toContain("<blockquote>");
    expect(post.content).toContain("<ul>");
  });

  it("extracts both post and page items", async () => {
    const result = await parseWxr(openFixture());

    expect(result.posts).toHaveLength(2);

    const post = result.posts.find((p) => p.type === "post");
    expect(post).toBeDefined();
    expect(post!.slug).toBe("classic-editor-post");

    const page = result.posts.find((p) => p.type === "page");
    expect(page).toBeDefined();
    expect(page!.slug).toBe("about-us");
  });
});

describe("parseWxr — wp-6.0-fse.xml", () => {
  function openFixture() {
    return createReadStream(
      resolve(fixturesDir, "wp-6.0-fse.xml"),
      "utf-8",
    );
  }

  it("extracts WP version 6.0.9 from generator tag", async () => {
    const result = await parseWxr(openFixture());
    expect(result.wpVersion).toBe("6.0.9");
  });

  it("extracts site metadata correctly", async () => {
    const result = await parseWxr(openFixture());
    expect(result.siteTitle).toBe("FSE Theme Site");
    expect(result.siteUrl).toBe("https://fse.example.com");
  });

  it("detects Gutenberg blocks in post content", async () => {
    const result = await parseWxr(openFixture());

    const post = result.posts.find((p) => p.slug === "fse-blog-post");
    expect(post).toBeDefined();

    // Standard Gutenberg blocks
    expect(post!.content).toContain("<!-- wp:paragraph -->");
    expect(post!.content).toContain("<!-- wp:heading");
    expect(post!.content).toContain("<!-- wp:columns -->");
    expect(post!.content).toContain("<!-- wp:group");
  });

  it("stores FSE template parts and templates as regular posts", async () => {
    const result = await parseWxr(openFixture());

    // wp_template_part and wp_template are stored as posts
    const templatePart = result.posts.find(
      (p) => p.type === "wp_template_part",
    );
    expect(templatePart).toBeDefined();
    expect(templatePart!.slug).toBe("header");

    const template = result.posts.find((p) => p.type === "wp_template");
    expect(template).toBeDefined();
    expect(template!.slug).toBe("single");
  });

  it("preserves FSE block markers (template-part, navigation, site-title)", async () => {
    const result = await parseWxr(openFixture());

    const header = result.posts.find((p) => p.slug === "header");
    expect(header).toBeDefined();
    expect(header!.content).toContain("<!-- wp:template-part");
    expect(header!.content).toContain("<!-- wp:navigation");
    expect(header!.content).toContain("<!-- wp:site-title");

    const single = result.posts.find((p) => p.slug === "single");
    expect(single).toBeDefined();
    expect(single!.content).toContain("<!-- wp:template-part");
    expect(single!.content).toContain("<!-- wp:post-title");
    expect(single!.content).toContain("<!-- wp:post-content");
  });
});
