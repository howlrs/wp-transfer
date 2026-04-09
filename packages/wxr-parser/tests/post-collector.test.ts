import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "../src/index.js";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/wxr");

describe("PostCollector — minimal.xml terms field", () => {
  it("captures all category elements as terms with domain, slug, and name", async () => {
    const stream = createReadStream(resolve(fixturesDir, "minimal.xml"), "utf-8");
    const result = await parseWxr(stream);

    const helloWorld = result.posts.find((p) => p.slug === "hello-world");
    expect(helloWorld).toBeDefined();
    expect(helloWorld!.terms).toBeDefined();
    expect(helloWorld!.terms).toHaveLength(2);

    expect(helloWorld!.terms).toContainEqual({
      domain: "category",
      slug: "uncategorized",
      name: "Uncategorized",
    });
    expect(helloWorld!.terms).toContainEqual({
      domain: "post_tag",
      slug: "hello",
      name: "Hello",
    });
  });

  it("leaves terms undefined when post has no category elements", async () => {
    const stream = createReadStream(resolve(fixturesDir, "minimal.xml"), "utf-8");
    const result = await parseWxr(stream);

    const samplePage = result.posts.find((p) => p.slug === "sample-page");
    expect(samplePage).toBeDefined();
    expect(samplePage!.terms).toBeUndefined();
  });
});

describe("PostCollector — gutenberg-blocks.xml", () => {
  function openGutenberg() {
    return createReadStream(
      resolve(fixturesDir, "gutenberg-blocks.xml"),
      "utf-8",
    );
  }

  it("extracts Gutenberg content as raw HTML with block comments", async () => {
    const result = await parseWxr(openGutenberg());

    expect(result.posts).toHaveLength(1);
    const post = result.posts[0];

    // Verify block comment markers are preserved
    expect(post.content).toContain("<!-- wp:paragraph -->");
    expect(post.content).toContain("<!-- /wp:paragraph -->");
    expect(post.content).toContain("<!-- wp:heading");
    expect(post.content).toContain("<!-- wp:image");
    expect(post.content).toContain("<!-- wp:embed");

    // Verify HTML content is present
    expect(post.content).toContain("<strong>bold</strong>");
    expect(post.content).toContain("<em>italic</em>");
    expect(post.content).toContain('<h2 class="wp-block-heading">A Heading</h2>');
    expect(post.content).toContain(
      "https://example.com/wp-content/uploads/2024/01/photo.jpg",
    );
    expect(post.content).toContain("console.log");
    expect(post.content).toContain("youtube.com");
  });
});

describe("PostCollector — acf-fields.xml", () => {
  function openAcf() {
    return createReadStream(resolve(fixturesDir, "acf-fields.xml"), "utf-8");
  }

  it("extracts ACF meta fields correctly", async () => {
    const result = await parseWxr(openAcf());

    expect(result.posts).toHaveLength(1);
    const meta = result.posts[0].meta;

    // ACF value fields
    expect(meta["price"]).toBe("29.99");
    expect(meta["color"]).toBe("red");
    expect(meta["is_featured"]).toBe("1");

    // ACF field reference keys
    expect(meta["_price"]).toBe("field_abc123");
    expect(meta["_color"]).toBe("field_def456");
    expect(meta["_is_featured"]).toBe("field_ghi789");

    // Yoast SEO meta
    expect(meta["_yoast_wpseo_title"]).toBe(
      "Product Page - Best Product %%sep%% %%sitename%%",
    );
    expect(meta["_yoast_wpseo_metadesc"]).toBe(
      "Buy the best product at an affordable price.",
    );
  });
});
