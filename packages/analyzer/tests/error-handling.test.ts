import { describe, it, expect } from "vitest";
import { parseGutenbergBlocks } from "../src/gutenberg-parser.js";
import { convertBlocksToPortableText } from "../src/block-converter.js";
import { generatePrismaSchema } from "../src/schema-to-prisma.js";
import { generateBlogScaffold } from "../src/blog-scaffold-generator.js";
import type { BlogScaffoldInput } from "../src/blog-scaffold-generator.js";

// ── parseGutenbergBlocks — empty/null-like inputs ──

describe("parseGutenbergBlocks — empty/null-like inputs", () => {
  it("returns empty array for empty string", () => {
    expect(parseGutenbergBlocks("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(parseGutenbergBlocks("   \n\t  ")).toEqual([]);
  });

  it("returns freeform block for plain text without block comments", () => {
    const blocks = parseGutenbergBlocks("Hello world");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("freeform");
    expect(blocks[0]!.innerHTML).toBe("Hello world");
  });
});

// ── convertBlocksToPortableText — empty array ──

describe("convertBlocksToPortableText — empty array", () => {
  it("returns empty array for empty input", () => {
    expect(convertBlocksToPortableText([])).toEqual([]);
  });
});

// ── generatePrismaSchema — no tables ──

describe("generatePrismaSchema — no tables", () => {
  it("returns valid Prisma header with no models for empty table list", () => {
    const schema = generatePrismaSchema([]);

    expect(schema).toContain("generator client");
    expect(schema).toContain("datasource db");
    expect(schema).not.toContain("model ");
  });

  it("returns valid Prisma header when relations are also empty", () => {
    const schema = generatePrismaSchema([], []);

    expect(schema).toContain("generator client");
    expect(schema).toContain("datasource db");
    expect(schema).not.toContain("model ");
  });
});

// ── generateBlogScaffold — empty posts array ──

describe("generateBlogScaffold — empty posts", () => {
  function makeEmptyInput(): BlogScaffoldInput {
    return {
      siteTitle: "Empty Blog",
      siteUrl: "https://example.com",
      posts: [],
      categories: [],
      hasYoastSeo: false,
      hasAcfFields: false,
      mediaDomains: [],
      wpPermalinkStructure: null,
    };
  }

  it("generates scaffold files without crashing on empty posts", () => {
    const files = generateBlogScaffold(makeEmptyInput());

    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(f.path).toBeTruthy();
      expect(typeof f.content).toBe("string");
    }
  });

  it("includes layout and blog archive even with no posts", () => {
    const files = generateBlogScaffold(makeEmptyInput());

    const paths = files.map((f) => f.path);
    expect(paths).toContain("app/layout.tsx");
    expect(paths).toContain("app/blog/page.tsx");
    expect(paths).toContain("app/blog/[slug]/page.tsx");
  });

  it("uses static content layer for zero posts (not file-based)", () => {
    const files = generateBlogScaffold(makeEmptyInput());
    const contentFile = files.find((f) => f.path === "lib/content.ts");

    expect(contentFile).toBeDefined();
    // Static layer uses in-memory arrays, not fs reads
    expect(contentFile!.content).not.toContain("readdirSync");
  });
});
