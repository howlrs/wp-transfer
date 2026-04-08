import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "../src/index.js";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/wxr");

describe("parseWxr — minimal.xml", () => {
  function openMinimal() {
    return createReadStream(resolve(fixturesDir, "minimal.xml"), "utf-8");
  }

  it("extracts 2 posts (Hello World + Sample Page) with correct fields", async () => {
    const result = await parseWxr(openMinimal());

    expect(result.posts).toHaveLength(2);

    const post = result.posts[0];
    expect(post.title).toBe("Hello World");
    expect(post.slug).toBe("hello-world");
    expect(post.status).toBe("publish");
    expect(post.type).toBe("post");

    const page = result.posts[1];
    expect(page.title).toBe("Sample Page");
    expect(page.slug).toBe("sample-page");
    expect(page.status).toBe("publish");
    expect(page.type).toBe("page");
  });

  it("extracts 1 author with login=admin and email=admin@example.com", async () => {
    const result = await parseWxr(openMinimal());

    expect(result.users).toHaveLength(1);
    expect(result.users[0].login).toBe("admin");
    expect(result.users[0].email).toBe("admin@example.com");
    expect(result.users[0].displayName).toBe("Admin User");
  });

  it("extracts taxonomy terms (uncategorized category + hello tag)", async () => {
    const result = await parseWxr(openMinimal());

    expect(result.taxonomies.length).toBeGreaterThanOrEqual(2);

    const category = result.taxonomies.find((t) => t.taxonomy === "category");
    expect(category).toBeDefined();
    expect(category!.slug).toBe("uncategorized");
    expect(category!.name).toBe("Uncategorized");

    const tag = result.taxonomies.find((t) => t.taxonomy === "post_tag");
    expect(tag).toBeDefined();
    expect(tag!.slug).toBe("hello");
    expect(tag!.name).toBe("Hello");
  });

  it("extracts site metadata (title, url, wpVersion)", async () => {
    const result = await parseWxr(openMinimal());

    expect(result.siteTitle).toBe("Test Site");
    expect(result.siteUrl).toBe("https://example.com");
    expect(result.wpVersion).toBe("6.7");
  });
});

describe("parseWxr — acf-fields.xml", () => {
  function openAcf() {
    return createReadStream(resolve(fixturesDir, "acf-fields.xml"), "utf-8");
  }

  it("extracts post meta from ACF fields", async () => {
    const result = await parseWxr(openAcf());

    expect(result.posts).toHaveLength(1);
    const post = result.posts[0];
    const meta = post.meta;

    expect(meta["price"]).toBe("29.99");
    expect(meta["_price"]).toBe("field_abc123");
    expect(meta["color"]).toBe("red");
    expect(meta["_color"]).toBe("field_def456");
    expect(meta["is_featured"]).toBe("1");
    expect(meta["_is_featured"]).toBe("field_ghi789");
    expect(meta["_yoast_wpseo_title"]).toBe(
      "Product Page - Best Product %%sep%% %%sitename%%",
    );
    expect(meta["_yoast_wpseo_metadesc"]).toBe(
      "Buy the best product at an affordable price.",
    );
  });
});
