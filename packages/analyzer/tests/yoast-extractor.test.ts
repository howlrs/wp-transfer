import { describe, it, expect } from "vitest";
import {
  extractYoastMeta,
  extractSeoMeta,
  resolveYoastPlaceholders,
  generateYoastMetadataCode,
} from "../src/yoast-extractor.js";

describe("extractYoastMeta", () => {
  it("extracts Yoast meta from post meta record", () => {
    const meta: Record<string, unknown> = {
      _yoast_wpseo_title: "My SEO Title %%sep%% %%sitename%%",
      _yoast_wpseo_metadesc: "My meta description",
      _yoast_wpseo_canonical: "https://example.com/my-post/",
      _yoast_wpseo_focuskw: "my keyword",
    };

    const result = extractYoastMeta(meta);

    expect(result.title).toBe("My SEO Title %%sep%% %%sitename%%");
    expect(result.description).toBe("My meta description");
    expect(result.canonical).toBe("https://example.com/my-post/");
    expect(result.focusKeyword).toBe("my keyword");
    expect(result.ogTitle).toBeNull();
    expect(result.ogDescription).toBeNull();
    expect(result.ogImage).toBeNull();
  });

  it("returns null fields when no Yoast meta present", () => {
    const meta: Record<string, unknown> = {
      _edit_last: "1",
      some_other_key: "value",
    };

    const result = extractYoastMeta(meta);

    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
    expect(result.canonical).toBeNull();
    expect(result.ogTitle).toBeNull();
    expect(result.ogDescription).toBeNull();
    expect(result.ogImage).toBeNull();
    expect(result.focusKeyword).toBeNull();
  });

  it("extracts OpenGraph overrides", () => {
    const meta: Record<string, unknown> = {
      "_yoast_wpseo_opengraph-title": "OG Title Override",
      "_yoast_wpseo_opengraph-description": "OG Description Override",
      "_yoast_wpseo_opengraph-image": "https://example.com/og-image.jpg",
    };

    const result = extractYoastMeta(meta);

    expect(result.ogTitle).toBe("OG Title Override");
    expect(result.ogDescription).toBe("OG Description Override");
    expect(result.ogImage).toBe("https://example.com/og-image.jpg");
    expect(result.title).toBeNull();
  });
});

describe("resolveYoastPlaceholders", () => {
  it("resolves %%title%%, %%sep%%, and %%sitename%%", () => {
    const context = {
      postTitle: "Hello World",
      siteName: "My Blog",
      separator: "|",
    };

    const result = resolveYoastPlaceholders(
      "%%title%% %%sep%% %%sitename%%",
      context,
    );

    expect(result).toBe("Hello World | My Blog");
  });

  it("resolves %%primary_category%%", () => {
    const context = {
      postTitle: "My Post",
      siteName: "My Site",
      separator: "-",
      primaryCategory: "Technology",
    };

    const result = resolveYoastPlaceholders(
      "%%title%% in %%primary_category%%",
      context,
    );

    expect(result).toBe("My Post in Technology");
  });

  it("strips unresolved placeholders and cleans up whitespace", () => {
    const context = {
      postTitle: "My Post",
      siteName: "My Site",
      separator: "|",
    };

    const result = resolveYoastPlaceholders(
      "%%title%% %%unknown_var%% %%sitename%%",
      context,
    );

    expect(result).toBe("My Post My Site");
  });

  it("handles string with no placeholders", () => {
    const context = {
      postTitle: "My Post",
      siteName: "My Site",
      separator: "|",
    };

    const result = resolveYoastPlaceholders("Plain title text", context);

    expect(result).toBe("Plain title text");
  });

  it("resolves %%author%% and %%date%% placeholders", () => {
    const context = {
      postTitle: "My Post",
      siteName: "My Site",
      separator: "|",
      author: "John Doe",
      date: "2024-01-15",
    };
    const result = resolveYoastPlaceholders("%%title%% by %%author%% on %%date%%", context);
    expect(result).toBe("My Post by John Doe on 2024-01-15");
  });

  it("resolves %%modified%%, %%excerpt%%, and %%category_title%%", () => {
    const context = {
      postTitle: "My Post",
      siteName: "My Site",
      separator: "|",
      modified: "2024-03-01",
      excerpt: "A brief summary",
      categoryTitle: "Technology",
    };
    const result = resolveYoastPlaceholders("%%excerpt%% | Updated %%modified%% in %%category_title%%", context);
    expect(result).toBe("A brief summary | Updated 2024-03-01 in Technology");
  });

  it("treats missing optional context fields as empty string", () => {
    const context = {
      postTitle: "My Post",
      siteName: "My Site",
      separator: "|",
    };
    const result = resolveYoastPlaceholders("%%title%% by %%author%%", context);
    expect(result).toBe("My Post by");
  });
});

describe("generateYoastMetadataCode", () => {
  it("generates Next.js generateMetadata function", () => {
    const yoast = {
      title: "My Page Title",
      description: "My page description",
      canonical: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      focusKeyword: null,
    };

    const code = generateYoastMetadataCode(yoast);

    expect(code).toContain('import type { Metadata } from "next"');
    expect(code).toContain("generateMetadata");
    expect(code).toContain("My Page Title");
    expect(code).toContain("My page description");
  });

  it("includes openGraph section when OG overrides are present", () => {
    const yoast = {
      title: "My Page",
      description: "My desc",
      canonical: null,
      ogTitle: "OG Override Title",
      ogDescription: "OG Override Desc",
      ogImage: "https://example.com/image.jpg",
      focusKeyword: null,
    };

    const code = generateYoastMetadataCode(yoast);

    expect(code).toContain("openGraph");
    expect(code).toContain("OG Override Title");
    expect(code).toContain("OG Override Desc");
    expect(code).toContain("https://example.com/image.jpg");
  });

  it("includes alternates.canonical when canonical is set", () => {
    const yoast = {
      title: "My Page",
      description: null,
      canonical: "https://example.com/my-page/",
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      focusKeyword: null,
    };

    const code = generateYoastMetadataCode(yoast);

    expect(code).toContain("alternates");
    expect(code).toContain("canonical");
    expect(code).toContain("https://example.com/my-page/");
  });
});

describe("extractSeoMeta (Rank Math support)", () => {
  it("extracts Rank Math meta keys", () => {
    const meta: Record<string, unknown> = {
      rank_math_title: "RM Title",
      rank_math_description: "RM Description",
      rank_math_canonical_url: "https://example.com/rm-post/",
      rank_math_focus_keyword: "rm keyword",
    };
    const result = extractSeoMeta(meta);
    expect(result.title).toBe("RM Title");
    expect(result.description).toBe("RM Description");
    expect(result.canonical).toBe("https://example.com/rm-post/");
    expect(result.focusKeyword).toBe("rm keyword");
  });

  it("prefers Yoast keys over Rank Math when both present", () => {
    const meta: Record<string, unknown> = {
      _yoast_wpseo_title: "Yoast Title",
      rank_math_title: "RM Title",
    };
    const result = extractSeoMeta(meta);
    expect(result.title).toBe("Yoast Title");
  });

  it("extractYoastMeta is an alias for extractSeoMeta", () => {
    expect(extractYoastMeta).toBe(extractSeoMeta);
  });
});

describe("resolveYoastPlaceholders — page and focuskw", () => {
  it("resolves %%page%% to empty string (runtime placeholder)", () => {
    const context = {
      postTitle: "My Post",
      siteName: "My Site",
      separator: "|",
    };
    const result = resolveYoastPlaceholders("%%title%% %%sep%% Page %%page%%", context);
    expect(result).toBe("My Post | Page");
  });

  it("resolves %%focuskw%% to empty string (SEO settings placeholder)", () => {
    const context = {
      postTitle: "My Post",
      siteName: "My Site",
      separator: "|",
    };
    const result = resolveYoastPlaceholders("%%title%% - %%focuskw%%", context);
    expect(result).toBe("My Post -");
  });

  it("resolves %%excerpt%% from context", () => {
    const context = {
      postTitle: "My Post",
      siteName: "My Site",
      separator: "|",
      excerpt: "A short summary",
    };
    const result = resolveYoastPlaceholders("%%excerpt%% %%sep%% %%sitename%%", context);
    expect(result).toBe("A short summary | My Site");
  });
});
