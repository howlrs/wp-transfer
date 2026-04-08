# C-Phase MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 1 MVP — Gutenberg-to-Portable-Text conversion, Yoast SEO template, ACF template, WXR blog scaffold, and minimal Playwright verification.

**Architecture:** Five modules built bottom-up: (1) Gutenberg block parser in `analyzer` converts HTML+block-comments to `WptContentBlock[]`, (2) Yoast SEO extractor maps `_yoast_wpseo_*` meta to Next.js Metadata API, (3) ACF template maps detected fields to typed accessors, (4) WXR scaffold generator produces a complete Next.js blog project consuming C1-C3 outputs, (5) Playwright smoke test verifies the generated project builds and renders.

**Tech Stack:** TypeScript 6.0.2, vitest 4.1.3, @portabletext/types 4.0.2, rehype (new dep for HTML parsing), Playwright (new dev dep for C5)

**Gemini Q5 concerns addressed:**
- Image pipeline: URL rewriting to relative paths + `next.config.js` remotePatterns auto-generation
- Permalink compatibility: WP permalink structure detection + `next.config.js` redirects
- OOM: Block converter operates per-post (not full corpus in memory)

---

## File Structure

### New files (C1 — Gutenberg block converter)

| File | Responsibility |
|------|---------------|
| `packages/analyzer/src/gutenberg-parser.ts` | Parse Gutenberg block comments from HTML string, extract block name + attributes + innerHTML |
| `packages/analyzer/src/block-converter.ts` | Convert parsed Gutenberg blocks to `WptContentBlock[]` (PT blocks) |
| `packages/analyzer/tests/gutenberg-parser.test.ts` | Tests for block comment parsing |
| `packages/analyzer/tests/block-converter.test.ts` | Tests for block-to-PT conversion |

### New files (C2 — Yoast SEO template)

| File | Responsibility |
|------|---------------|
| `packages/analyzer/src/yoast-extractor.ts` | Extract Yoast meta from `WpPost.meta`, resolve `%%var%%` placeholders, emit Next.js Metadata object |
| `packages/analyzer/tests/yoast-extractor.test.ts` | Tests for Yoast extraction and placeholder resolution |

### New files (C3 — ACF template)

| File | Responsibility |
|------|---------------|
| `packages/analyzer/src/acf-template-generator.ts` | Generate typed field accessor functions + Zod schema from `AcfFieldInfo[]` |
| `packages/analyzer/tests/acf-template-generator.test.ts` | Tests for ACF template generation |

### New files (C4 — WXR blog scaffold)

| File | Responsibility |
|------|---------------|
| `packages/analyzer/src/blog-scaffold-generator.ts` | Generate complete Next.js blog project from WXR parse result (post pages, archive, category, 404, layout, config) |
| `packages/analyzer/tests/blog-scaffold-generator.test.ts` | Tests for scaffold file generation |

### New files (C5 — Playwright verify)

| File | Responsibility |
|------|---------------|
| `packages/analyzer/src/verify-generator.ts` | Generate Playwright test files + config for a scaffold output directory |
| `packages/analyzer/tests/verify-generator.test.ts` | Tests for Playwright config/test generation |

### Modified files

| File | Change |
|------|--------|
| `packages/analyzer/src/index.ts` | Export new modules |
| `packages/analyzer/package.json` | (if rehype needed — see C1 notes) |
| `fixtures/wxr/gutenberg-blocks.xml` | Add quote, table, separator, list-with-ordered blocks for coverage |
| `apps/cli/src/commands/analyze.ts` | Wire Gutenberg conversion into WXR analysis flow |

---

## Task 1: Gutenberg Block Comment Parser

**Files:**
- Create: `packages/analyzer/src/gutenberg-parser.ts`
- Create: `packages/analyzer/tests/gutenberg-parser.test.ts`
- Modify: `fixtures/wxr/gutenberg-blocks.xml`

### Purpose

Parse Gutenberg block comment structure (`<!-- wp:blockname {"attrs":...} -->...<!-- /wp:blockname -->`) from raw HTML string into a structured AST. This is the foundation for all content conversion.

### Design

Gutenberg blocks use HTML comments as delimiters:
- Opening: `<!-- wp:namespace/blockname {"key":"value"} -->`
- Self-closing: `<!-- wp:separator /-->`
- Closing: `<!-- /wp:namespace/blockname -->`
- Blocks can be nested (e.g., `wp:columns` > `wp:column`)

Use regex-based state machine (no DOM parser needed — block comments are line-oriented).

- [ ] **Step 1: Enhance test fixture with more block types**

Add quote, table, separator, ordered list, and nested column blocks to the fixture:

```xml
<!-- Add before the closing ]]> in fixtures/wxr/gutenberg-blocks.xml, after the embed block -->

<!-- wp:quote -->
<blockquote class="wp-block-quote"><p>To be or not to be.</p><cite>Shakespeare</cite></blockquote>
<!-- /wp:quote -->

<!-- wp:table -->
<figure class="wp-block-table"><table class="has-fixed-layout"><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>Alpha</td><td>1</td></tr><tr><td>Beta</td><td>2</td></tr></tbody></table></figure>
<!-- /wp:table -->

<!-- wp:separator {"className":"is-style-wide"} /-->

<!-- wp:list {"ordered":true} -->
<ol class="wp-block-list"><li>First</li><li>Second</li><li>Third</li></ol>
<!-- /wp:list -->
```

- [ ] **Step 2: Write failing tests for gutenberg-parser**

```typescript
// packages/analyzer/tests/gutenberg-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseGutenbergBlocks, type GutenbergBlock } from "../src/gutenberg-parser.js";

describe("parseGutenbergBlocks", () => {
  it("parses a paragraph block", () => {
    const html = `<!-- wp:paragraph -->
<p>Hello world</p>
<!-- /wp:paragraph -->`;

    const blocks = parseGutenbergBlocks(html);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe("paragraph");
    expect(blocks[0].attributes).toEqual({});
    expect(blocks[0].innerHTML).toContain("<p>Hello world</p>");
  });

  it("parses block attributes as JSON", () => {
    const html = `<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">Title</h2>
<!-- /wp:heading -->`;

    const blocks = parseGutenbergBlocks(html);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe("heading");
    expect(blocks[0].attributes).toEqual({ level: 2 });
  });

  it("parses self-closing blocks", () => {
    const html = `<!-- wp:separator {"className":"is-style-wide"} /-->`;

    const blocks = parseGutenbergBlocks(html);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe("separator");
    expect(blocks[0].attributes).toEqual({ className: "is-style-wide" });
    expect(blocks[0].innerHTML).toBe("");
  });

  it("parses image block with nested attributes", () => {
    const html = `<!-- wp:image {"id":10,"sizeSlug":"large"} -->
<figure class="wp-block-image size-large"><img src="https://example.com/photo.jpg" alt="A photo" class="wp-image-10"/><figcaption class="wp-element-caption">Caption</figcaption></figure>
<!-- /wp:image -->`;

    const blocks = parseGutenbergBlocks(html);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe("image");
    expect(blocks[0].attributes).toEqual({ id: 10, sizeSlug: "large" });
    expect(blocks[0].innerHTML).toContain("photo.jpg");
  });

  it("parses embed block with provider info", () => {
    const html = `<!-- wp:embed {"url":"https://youtube.com/watch?v=abc","type":"video","providerNameSlug":"youtube"} -->
<figure class="wp-block-embed"><div class="wp-block-embed__wrapper">https://youtube.com/watch?v=abc</div></figure>
<!-- /wp:embed -->`;

    const blocks = parseGutenbergBlocks(html);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe("embed");
    expect(blocks[0].attributes.url).toBe("https://youtube.com/watch?v=abc");
    expect(blocks[0].attributes.providerNameSlug).toBe("youtube");
  });

  it("parses multiple blocks in sequence", () => {
    const html = `<!-- wp:paragraph -->
<p>First</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Second</p>
<!-- /wp:paragraph -->`;

    const blocks = parseGutenbergBlocks(html);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].innerHTML).toContain("First");
    expect(blocks[1].innerHTML).toContain("Second");
  });

  it("preserves namespaced block names", () => {
    const html = `<!-- wp:core/paragraph -->
<p>Namespaced</p>
<!-- /wp:core/paragraph -->`;

    const blocks = parseGutenbergBlocks(html);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe("core/paragraph");
  });

  it("handles content with no Gutenberg blocks (classic editor)", () => {
    const html = `<p>Just plain HTML</p><p>No blocks here</p>`;

    const blocks = parseGutenbergBlocks(html);

    // Should return a single "freeform" block wrapping the entire content
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe("freeform");
    expect(blocks[0].innerHTML).toContain("Just plain HTML");
  });

  it("handles empty content", () => {
    const blocks = parseGutenbergBlocks("");
    expect(blocks).toHaveLength(0);
  });

  it("handles malformed block comment gracefully", () => {
    const html = `<!-- wp:paragraph -->
<p>Good block</p>
<!-- /wp:paragraph -->

<!-- wp:broken
<p>Orphaned content</p>

<!-- wp:paragraph -->
<p>Another good block</p>
<!-- /wp:paragraph -->`;

    const blocks = parseGutenbergBlocks(html);

    // Should recover and parse the valid blocks
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks.some(b => b.name === "paragraph")).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/analyzer/tests/gutenberg-parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement gutenberg-parser.ts**

```typescript
// packages/analyzer/src/gutenberg-parser.ts

/**
 * Parse Gutenberg block comments from WordPress post content HTML.
 *
 * Gutenberg uses HTML comments as block delimiters:
 * - Opening:      <!-- wp:blockname {"attrs":...} -->
 * - Self-closing: <!-- wp:blockname {"attrs":...} /-->
 * - Closing:      <!-- /wp:blockname -->
 */

export interface GutenbergBlock {
  /** Block name without "wp:" prefix, e.g. "paragraph", "core/image" */
  name: string;
  /** Parsed JSON attributes from the opening comment */
  attributes: Record<string, unknown>;
  /** Raw HTML between opening and closing comments */
  innerHTML: string;
}

// Matches opening block comment: <!-- wp:name {json} --> or <!-- wp:name -->
const BLOCK_OPEN_RE =
  /<!--\s+wp:([a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?)\s*(\{[^}]*\})?\s*-->/g;

// Matches self-closing block comment: <!-- wp:name {json} /-->
const BLOCK_SELF_CLOSE_RE =
  /<!--\s+wp:([a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?)\s*(\{[^}]*\})?\s*\/-->/g;

// Matches closing block comment: <!-- /wp:name -->
function closingCommentFor(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<!--\\s+/wp:${escaped}\\s*-->`, "g");
}

function parseAttributes(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Parse Gutenberg block comments from a post's content HTML.
 *
 * Returns an ordered array of blocks. Content that appears outside
 * any block comment is wrapped in a "freeform" pseudo-block.
 * Classic editor content (no block comments at all) returns a single
 * freeform block.
 */
export function parseGutenbergBlocks(html: string): GutenbergBlock[] {
  if (!html || !html.trim()) return [];

  // Check if content has any Gutenberg block comments
  const hasBlocks = /<!--\s+wp:/.test(html);
  if (!hasBlocks) {
    return [{ name: "freeform", attributes: {}, innerHTML: html }];
  }

  const blocks: GutenbergBlock[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    // Try to match a self-closing block first (before open block)
    BLOCK_SELF_CLOSE_RE.lastIndex = cursor;
    const selfCloseMatch = BLOCK_SELF_CLOSE_RE.exec(html);

    BLOCK_OPEN_RE.lastIndex = cursor;
    const openMatch = BLOCK_OPEN_RE.exec(html);

    // Determine which match comes first
    const selfClosePos = selfCloseMatch?.index ?? Infinity;
    const openPos = openMatch?.index ?? Infinity;

    if (selfClosePos === Infinity && openPos === Infinity) {
      // No more blocks — remaining content is freeform
      const remaining = html.slice(cursor).trim();
      if (remaining) {
        blocks.push({ name: "freeform", attributes: {}, innerHTML: remaining });
      }
      break;
    }

    if (selfClosePos <= openPos && selfCloseMatch) {
      // Freeform content before this block
      const before = html.slice(cursor, selfCloseMatch.index).trim();
      if (before) {
        blocks.push({ name: "freeform", attributes: {}, innerHTML: before });
      }

      blocks.push({
        name: selfCloseMatch[1],
        attributes: parseAttributes(selfCloseMatch[2]),
        innerHTML: "",
      });

      cursor = selfCloseMatch.index + selfCloseMatch[0].length;
      continue;
    }

    if (openMatch) {
      const blockName = openMatch[1];

      // Check: is this actually a self-closing match too? (regex overlap)
      // Self-closing ends with /-->, open ends with -->
      if (openMatch[0].trimEnd().endsWith("/-->")) {
        const before = html.slice(cursor, openMatch.index).trim();
        if (before) {
          blocks.push({ name: "freeform", attributes: {}, innerHTML: before });
        }
        blocks.push({
          name: blockName,
          attributes: parseAttributes(openMatch[2]),
          innerHTML: "",
        });
        cursor = openMatch.index + openMatch[0].length;
        continue;
      }

      // Find the matching closing comment
      const closingRe = closingCommentFor(blockName);
      closingRe.lastIndex = openMatch.index + openMatch[0].length;
      const closeMatch = closingRe.exec(html);

      if (closeMatch) {
        // Freeform content before this block
        const before = html.slice(cursor, openMatch.index).trim();
        if (before) {
          blocks.push({ name: "freeform", attributes: {}, innerHTML: before });
        }

        const innerStart = openMatch.index + openMatch[0].length;
        const innerEnd = closeMatch.index;
        const innerHTML = html.slice(innerStart, innerEnd).trim();

        blocks.push({
          name: blockName,
          attributes: parseAttributes(openMatch[2]),
          innerHTML,
        });

        cursor = closeMatch.index + closeMatch[0].length;
      } else {
        // No closing comment found — skip past this opening comment
        cursor = openMatch.index + openMatch[0].length;
      }
    }
  }

  return blocks;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/analyzer/tests/gutenberg-parser.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/analyzer/src/gutenberg-parser.ts packages/analyzer/tests/gutenberg-parser.test.ts fixtures/wxr/gutenberg-blocks.xml
git commit -m "feat(analyzer): add Gutenberg block comment parser

Parses wp:blockname HTML comment delimiters into structured
GutenbergBlock[] with name, attributes, and innerHTML.
Handles self-closing blocks, namespaced names, classic editor
fallback (freeform), and malformed comments gracefully."
```

---

## Task 2: Block-to-Portable-Text Converter

**Files:**
- Create: `packages/analyzer/src/block-converter.ts`
- Create: `packages/analyzer/tests/block-converter.test.ts`

### Purpose

Convert `GutenbergBlock[]` (from Task 1) to `WptContentBlock[]` (Portable Text). This is the core content transformation.

### Design

Map each Gutenberg block type to its corresponding Portable Text type:

| Gutenberg Block | PT Type | Notes |
|----------------|---------|-------|
| `paragraph` | `WptPortableTextBlock` | Parse inline HTML (bold/italic/links) to PT marks/spans |
| `heading` | `WptPortableTextBlock` | style="h2"..style="h6" from level attribute |
| `list` | `WptPortableTextBlock` | style="bullet" or style="number" from ordered attribute |
| `image` | `WptImageBlock` | Extract src/alt/caption from innerHTML |
| `quote` | `WptPortableTextBlock` | style="blockquote" |
| `code` | `WptCodeBlock` | Extract code text from `<code>` tag |
| `embed` | `WptEmbedBlock` | url/provider from attributes |
| `table` | `WptHtmlBlock` | Preserve as HTML (too complex for PT) |
| `separator` | `WptPortableTextBlock` | style="separator", no children |
| `freeform` | `WptHtmlBlock` | Classic editor content |
| unknown | `WptHtmlBlock` | Fallback — preserve original HTML |

For inline HTML parsing (bold, italic, links inside paragraphs), use simple regex extraction. Full rehype is overkill for the limited inline markup Gutenberg produces.

- [ ] **Step 1: Write failing tests for block-converter**

```typescript
// packages/analyzer/tests/block-converter.test.ts
import { describe, it, expect } from "vitest";
import { convertBlocksToPortableText } from "../src/block-converter.js";
import type { GutenbergBlock } from "../src/gutenberg-parser.js";
import type {
  WptPortableTextBlock,
  WptImageBlock,
  WptEmbedBlock,
  WptCodeBlock,
  WptHtmlBlock,
} from "@wp-transfer/core";

function makeBlock(overrides: Partial<GutenbergBlock>): GutenbergBlock {
  return { name: "paragraph", attributes: {}, innerHTML: "<p>test</p>", ...overrides };
}

describe("convertBlocksToPortableText", () => {
  it("converts paragraph block to PT block with text", () => {
    const blocks = [makeBlock({
      name: "paragraph",
      innerHTML: "<p>Hello <strong>world</strong></p>",
    })];

    const result = convertBlocksToPortableText(blocks);

    expect(result).toHaveLength(1);
    const block = result[0] as WptPortableTextBlock;
    expect(block._type).toBe("block");
    expect(block.style).toBe("normal");
    // Should have children spans
    expect(block.children.length).toBeGreaterThan(0);
    // One child should contain "world" with bold mark
    const boldChild = block.children.find(
      (c) => "text" in c && c.text === "world",
    );
    expect(boldChild).toBeDefined();
    expect(boldChild!.marks).toContain("strong");
  });

  it("converts heading block with level attribute", () => {
    const blocks = [makeBlock({
      name: "heading",
      attributes: { level: 3 },
      innerHTML: '<h3 class="wp-block-heading">My Heading</h3>',
    })];

    const result = convertBlocksToPortableText(blocks);

    expect(result).toHaveLength(1);
    const block = result[0] as WptPortableTextBlock;
    expect(block._type).toBe("block");
    expect(block.style).toBe("h3");
    expect(block.children[0]).toMatchObject({ text: "My Heading" });
  });

  it("converts unordered list block", () => {
    const blocks = [makeBlock({
      name: "list",
      attributes: {},
      innerHTML: '<ul class="wp-block-list"><li>A</li><li>B</li></ul>',
    })];

    const result = convertBlocksToPortableText(blocks);

    expect(result).toHaveLength(2); // One PT block per list item
    const first = result[0] as WptPortableTextBlock;
    expect(first._type).toBe("block");
    expect(first.listItem).toBe("bullet");
    expect(first.children[0]).toMatchObject({ text: "A" });
  });

  it("converts ordered list block", () => {
    const blocks = [makeBlock({
      name: "list",
      attributes: { ordered: true },
      innerHTML: '<ol class="wp-block-list"><li>First</li><li>Second</li></ol>',
    })];

    const result = convertBlocksToPortableText(blocks);

    expect(result).toHaveLength(2);
    const first = result[0] as WptPortableTextBlock;
    expect(first.listItem).toBe("number");
  });

  it("converts image block", () => {
    const blocks = [makeBlock({
      name: "image",
      attributes: { id: 10, sizeSlug: "large" },
      innerHTML: '<figure class="wp-block-image size-large"><img src="https://example.com/photo.jpg" alt="Photo" class="wp-image-10"/><figcaption class="wp-element-caption">My caption</figcaption></figure>',
    })];

    const result = convertBlocksToPortableText(blocks);

    expect(result).toHaveLength(1);
    const img = result[0] as WptImageBlock;
    expect(img._type).toBe("image");
    expect(img.src).toBe("https://example.com/photo.jpg");
    expect(img.alt).toBe("Photo");
    expect(img.caption).toBe("My caption");
  });

  it("converts code block", () => {
    const blocks = [makeBlock({
      name: "code",
      innerHTML: '<pre class="wp-block-code"><code>const x = 1;</code></pre>',
    })];

    const result = convertBlocksToPortableText(blocks);

    expect(result).toHaveLength(1);
    const code = result[0] as WptCodeBlock;
    expect(code._type).toBe("code");
    expect(code.code).toBe("const x = 1;");
  });

  it("converts embed block", () => {
    const blocks = [makeBlock({
      name: "embed",
      attributes: { url: "https://youtube.com/watch?v=abc", providerNameSlug: "youtube" },
      innerHTML: '<figure class="wp-block-embed"><div>https://youtube.com/watch?v=abc</div></figure>',
    })];

    const result = convertBlocksToPortableText(blocks);

    expect(result).toHaveLength(1);
    const embed = result[0] as WptEmbedBlock;
    expect(embed._type).toBe("embed");
    expect(embed.url).toBe("https://youtube.com/watch?v=abc");
    expect(embed.provider).toBe("youtube");
  });

  it("converts quote block", () => {
    const blocks = [makeBlock({
      name: "quote",
      innerHTML: '<blockquote class="wp-block-quote"><p>To be or not to be.</p><cite>Shakespeare</cite></blockquote>',
    })];

    const result = convertBlocksToPortableText(blocks);

    expect(result).toHaveLength(1);
    const block = result[0] as WptPortableTextBlock;
    expect(block._type).toBe("block");
    expect(block.style).toBe("blockquote");
    expect(block.children.some((c) => "text" in c && c.text.includes("To be or not to be"))).toBe(true);
  });

  it("converts separator to PT block with separator style", () => {
    const blocks = [makeBlock({
      name: "separator",
      attributes: { className: "is-style-wide" },
      innerHTML: "",
    })];

    const result = convertBlocksToPortableText(blocks);

    expect(result).toHaveLength(1);
    const block = result[0] as WptPortableTextBlock;
    expect(block._type).toBe("block");
    expect(block.style).toBe("separator");
  });

  it("falls back to htmlBlock for unknown blocks", () => {
    const blocks = [makeBlock({
      name: "my-plugin/custom-widget",
      innerHTML: '<div class="custom">Custom content</div>',
    })];

    const result = convertBlocksToPortableText(blocks);

    expect(result).toHaveLength(1);
    const block = result[0] as WptHtmlBlock;
    expect(block._type).toBe("htmlBlock");
    expect(block.originalBlockName).toBe("my-plugin/custom-widget");
    expect(block.html).toContain("Custom content");
  });

  it("falls back to htmlBlock for table blocks", () => {
    const blocks = [makeBlock({
      name: "table",
      innerHTML: '<figure class="wp-block-table"><table><tr><td>Data</td></tr></table></figure>',
    })];

    const result = convertBlocksToPortableText(blocks);

    expect(result).toHaveLength(1);
    const block = result[0] as WptHtmlBlock;
    expect(block._type).toBe("htmlBlock");
    expect(block.originalBlockName).toBe("table");
  });

  it("converts freeform (classic editor) content to htmlBlock", () => {
    const blocks = [makeBlock({
      name: "freeform",
      innerHTML: "<p>Classic content</p>",
    })];

    const result = convertBlocksToPortableText(blocks);

    expect(result).toHaveLength(1);
    const block = result[0] as WptHtmlBlock;
    expect(block._type).toBe("htmlBlock");
    expect(block.originalBlockName).toBe("freeform");
  });

  it("generates unique _key for each block", () => {
    const blocks = [
      makeBlock({ name: "paragraph", innerHTML: "<p>A</p>" }),
      makeBlock({ name: "paragraph", innerHTML: "<p>B</p>" }),
      makeBlock({ name: "paragraph", innerHTML: "<p>C</p>" }),
    ];

    const result = convertBlocksToPortableText(blocks);

    const keys = result.map((b) => ("_key" in b ? b._key : undefined));
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(3);
  });

  it("handles paragraph with link markup", () => {
    const blocks = [makeBlock({
      name: "paragraph",
      innerHTML: '<p>Visit <a href="https://example.com">our site</a> today</p>',
    })];

    const result = convertBlocksToPortableText(blocks);

    const block = result[0] as WptPortableTextBlock;
    expect(block.children.length).toBeGreaterThanOrEqual(3);
    // The link child should have a mark
    const linkChild = block.children.find(
      (c) => "text" in c && c.text === "our site",
    );
    expect(linkChild).toBeDefined();
    expect(linkChild!.marks!.length).toBeGreaterThan(0);
    // Should have a markDef for the link
    expect(block.markDefs).toBeDefined();
    expect(block.markDefs!.length).toBeGreaterThan(0);
    expect(block.markDefs![0]).toMatchObject({
      _type: "link",
      href: "https://example.com",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/analyzer/tests/block-converter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement block-converter.ts**

```typescript
// packages/analyzer/src/block-converter.ts

/**
 * Convert Gutenberg blocks to Portable Text content blocks.
 *
 * Maps known Gutenberg block types to their PT equivalents.
 * Unknown blocks fall back to WptHtmlBlock preserving the original HTML.
 */
import type {
  WptPortableTextBlock,
  WptImageBlock,
  WptEmbedBlock,
  WptCodeBlock,
  WptHtmlBlock,
  WptContentBlock,
} from "@wp-transfer/core";
import type { PortableTextSpan } from "@portabletext/types";
import type { GutenbergBlock } from "./gutenberg-parser.js";

let keyCounter = 0;

function genKey(): string {
  return `blk_${Date.now().toString(36)}_${(keyCounter++).toString(36)}`;
}

// ── Inline HTML parsing ──

interface InlineParseResult {
  children: PortableTextSpan[];
  markDefs: Array<{ _key: string; _type: string; href: string }>;
}

/**
 * Parse simple inline HTML (bold, italic, links) into PT spans.
 * Handles: <strong>, <b>, <em>, <i>, <a href>, <code>
 */
function parseInlineHtml(html: string): InlineParseResult {
  const children: PortableTextSpan[] = [];
  const markDefs: Array<{ _key: string; _type: string; href: string }> = [];

  // Remove surrounding <p>...</p> or <blockquote>...<cite>...</cite></blockquote>
  let text = html
    .replace(/^<p[^>]*>/, "")
    .replace(/<\/p>$/, "")
    .replace(/^<blockquote[^>]*>/, "")
    .replace(/<\/blockquote>$/, "")
    .replace(/<\/?cite>/g, "")
    .trim();

  // If there are inner <p> tags, remove them too
  text = text.replace(/<\/?p[^>]*>/g, "");

  // Tokenize inline elements
  const inlineRe =
    /<(strong|b|em|i|code|a)(\s[^>]*)?>(.+?)<\/\1>/gs;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRe.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      if (plain) {
        children.push({ _type: "span", _key: genKey(), text: plain, marks: [] });
      }
    }

    const tag = match[1];
    const attrs = match[2] || "";
    const content = match[3];

    const marks: string[] = [];

    if (tag === "strong" || tag === "b") {
      marks.push("strong");
    } else if (tag === "em" || tag === "i") {
      marks.push("em");
    } else if (tag === "code") {
      marks.push("code");
    } else if (tag === "a") {
      const hrefMatch = attrs.match(/href="([^"]*)"/);
      if (hrefMatch) {
        const defKey = genKey();
        markDefs.push({ _key: defKey, _type: "link", href: hrefMatch[1] });
        marks.push(defKey);
      }
    }

    children.push({ _type: "span", _key: genKey(), text: content, marks });

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining) {
      children.push({ _type: "span", _key: genKey(), text: remaining, marks: [] });
    }
  }

  // If no inline elements found, just return the whole text as one span
  if (children.length === 0 && text) {
    children.push({ _type: "span", _key: genKey(), text, marks: [] });
  }

  return { children, markDefs };
}

// ── HTML extraction helpers ──

function extractImgSrc(html: string): string {
  const match = html.match(/src="([^"]*)"/);
  return match?.[1] ?? "";
}

function extractImgAlt(html: string): string {
  const match = html.match(/alt="([^"]*)"/);
  return match?.[1] ?? "";
}

function extractCaption(html: string): string | undefined {
  const match = html.match(/<figcaption[^>]*>([^<]*)<\/figcaption>/);
  return match?.[1] || undefined;
}

function extractCodeText(html: string): string {
  const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
  return match?.[1] ?? html;
}

function extractListItems(html: string): string[] {
  const items: string[] = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
  let match: RegExpExecArray | null;
  while ((match = liRe.exec(html)) !== null) {
    items.push(match[1].trim());
  }
  return items;
}

// ── Block converters ──

function convertParagraph(block: GutenbergBlock): WptPortableTextBlock {
  const { children, markDefs } = parseInlineHtml(block.innerHTML);
  return {
    _type: "block",
    _key: genKey(),
    style: "normal",
    children,
    markDefs,
  };
}

function convertHeading(block: GutenbergBlock): WptPortableTextBlock {
  const level = (block.attributes.level as number) ?? 2;
  // Strip heading HTML tags
  const text = block.innerHTML
    .replace(/<h[1-6][^>]*>/, "")
    .replace(/<\/h[1-6]>/, "")
    .trim();
  return {
    _type: "block",
    _key: genKey(),
    style: `h${level}`,
    children: [{ _type: "span", _key: genKey(), text, marks: [] }],
    markDefs: [],
  };
}

function convertList(block: GutenbergBlock): WptPortableTextBlock[] {
  const ordered = block.attributes.ordered === true;
  const items = extractListItems(block.innerHTML);
  return items.map((itemHtml) => {
    const { children, markDefs } = parseInlineHtml(`<p>${itemHtml}</p>`);
    return {
      _type: "block" as const,
      _key: genKey(),
      style: "normal",
      listItem: ordered ? "number" : "bullet",
      level: 1,
      children,
      markDefs,
    };
  });
}

function convertImage(block: GutenbergBlock): WptImageBlock {
  return {
    _type: "image",
    _key: genKey(),
    src: extractImgSrc(block.innerHTML),
    alt: extractImgAlt(block.innerHTML) || undefined,
    caption: extractCaption(block.innerHTML),
  };
}

function convertCode(block: GutenbergBlock): WptCodeBlock {
  const codeText = extractCodeText(block.innerHTML);
  const language = (block.attributes.language as string) ?? undefined;
  return {
    _type: "code",
    _key: genKey(),
    code: codeText,
    language,
  };
}

function convertEmbed(block: GutenbergBlock): WptEmbedBlock {
  return {
    _type: "embed",
    _key: genKey(),
    url: (block.attributes.url as string) ?? "",
    provider: (block.attributes.providerNameSlug as string) ?? undefined,
  };
}

function convertQuote(block: GutenbergBlock): WptPortableTextBlock {
  const { children, markDefs } = parseInlineHtml(block.innerHTML);
  return {
    _type: "block",
    _key: genKey(),
    style: "blockquote",
    children,
    markDefs,
  };
}

function convertSeparator(): WptPortableTextBlock {
  return {
    _type: "block",
    _key: genKey(),
    style: "separator",
    children: [{ _type: "span", _key: genKey(), text: "", marks: [] }],
    markDefs: [],
  };
}

function convertToHtmlBlock(block: GutenbergBlock): WptHtmlBlock {
  return {
    _type: "htmlBlock",
    _key: genKey(),
    html: block.innerHTML,
    originalBlockName: block.name,
  };
}

// ── Main ──

/**
 * Convert an array of GutenbergBlock (parsed from post content) to
 * Portable Text WptContentBlock[].
 *
 * Known block types are converted to their typed PT equivalents.
 * Unknown blocks fall back to WptHtmlBlock with the original HTML preserved.
 */
export function convertBlocksToPortableText(
  blocks: GutenbergBlock[],
): WptContentBlock[] {
  const result: WptContentBlock[] = [];

  for (const block of blocks) {
    switch (block.name) {
      case "paragraph":
        result.push(convertParagraph(block));
        break;
      case "heading":
        result.push(convertHeading(block));
        break;
      case "list":
        result.push(...convertList(block));
        break;
      case "image":
        result.push(convertImage(block));
        break;
      case "code":
        result.push(convertCode(block));
        break;
      case "embed":
        result.push(convertEmbed(block));
        break;
      case "quote":
        result.push(convertQuote(block));
        break;
      case "separator":
        result.push(convertSeparator());
        break;
      // Complex or unknown blocks → htmlBlock fallback
      case "table":
      case "freeform":
      default:
        result.push(convertToHtmlBlock(block));
        break;
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/analyzer/tests/block-converter.test.ts`
Expected: All 14 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/analyzer/src/block-converter.ts packages/analyzer/tests/block-converter.test.ts
git commit -m "feat(analyzer): add Gutenberg block to Portable Text converter

Maps paragraph, heading, list, image, code, embed, quote, separator
to typed WptContentBlock. Inline HTML (bold/italic/links) parsed to
PT marks/spans. Unknown blocks fall back to htmlBlock preserving
original HTML. Generates unique keys for all blocks."
```

---

## Task 3: Yoast SEO Metadata Extractor

**Files:**
- Create: `packages/analyzer/src/yoast-extractor.ts`
- Create: `packages/analyzer/tests/yoast-extractor.test.ts`

### Purpose

Extract Yoast SEO metadata from WP post meta and convert to Next.js Metadata API format. Handles Yoast's `%%variable%%` placeholder syntax.

### Design

Yoast stores metadata in post meta keys prefixed with `_yoast_wpseo_`:
- `_yoast_wpseo_title` — SEO title (may contain `%%title%%`, `%%sep%%`, `%%sitename%%`)
- `_yoast_wpseo_metadesc` — Meta description
- `_yoast_wpseo_canonical` — Canonical URL
- `_yoast_wpseo_opengraph-title` — OG title override
- `_yoast_wpseo_opengraph-description` — OG description override
- `_yoast_wpseo_opengraph-image` — OG image override
- `_yoast_wpseo_focuskw` — Focus keyword (informational)

Output: A TypeScript code string for Next.js `generateMetadata()` function.

- [ ] **Step 1: Write failing tests**

```typescript
// packages/analyzer/tests/yoast-extractor.test.ts
import { describe, it, expect } from "vitest";
import {
  extractYoastMeta,
  resolveYoastPlaceholders,
  generateYoastMetadataCode,
  type YoastMeta,
} from "../src/yoast-extractor.js";

describe("extractYoastMeta", () => {
  it("extracts Yoast meta from post meta record", () => {
    const meta: Record<string, unknown> = {
      _yoast_wpseo_title: "My Title %%sep%% %%sitename%%",
      _yoast_wpseo_metadesc: "My description.",
      _yoast_wpseo_canonical: "https://example.com/page",
      price: "29.99",
      _price: "field_abc",
    };

    const result = extractYoastMeta(meta);

    expect(result.title).toBe("My Title %%sep%% %%sitename%%");
    expect(result.description).toBe("My description.");
    expect(result.canonical).toBe("https://example.com/page");
  });

  it("returns null fields when no Yoast meta present", () => {
    const result = extractYoastMeta({ custom_field: "value" });

    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
  });

  it("extracts OpenGraph overrides", () => {
    const meta: Record<string, unknown> = {
      "_yoast_wpseo_opengraph-title": "OG Title",
      "_yoast_wpseo_opengraph-description": "OG Desc",
      "_yoast_wpseo_opengraph-image": "https://example.com/og.jpg",
    };

    const result = extractYoastMeta(meta);

    expect(result.ogTitle).toBe("OG Title");
    expect(result.ogDescription).toBe("OG Desc");
    expect(result.ogImage).toBe("https://example.com/og.jpg");
  });
});

describe("resolveYoastPlaceholders", () => {
  it("resolves %%title%%, %%sep%%, %%sitename%%", () => {
    const result = resolveYoastPlaceholders(
      "%%title%% %%sep%% %%sitename%%",
      { postTitle: "My Post", siteName: "My Blog", separator: "|" },
    );

    expect(result).toBe("My Post | My Blog");
  });

  it("resolves %%primary_category%%", () => {
    const result = resolveYoastPlaceholders(
      "%%title%% in %%primary_category%%",
      { postTitle: "Post", siteName: "Site", separator: "-", primaryCategory: "Tech" },
    );

    expect(result).toBe("Post in Tech");
  });

  it("strips unresolved placeholders", () => {
    const result = resolveYoastPlaceholders(
      "%%title%% %%unknown_var%%",
      { postTitle: "Title", siteName: "Site", separator: "-" },
    );

    expect(result).toBe("Title");
  });

  it("handles string with no placeholders", () => {
    const result = resolveYoastPlaceholders(
      "Static title",
      { postTitle: "Post", siteName: "Site", separator: "-" },
    );

    expect(result).toBe("Static title");
  });
});

describe("generateYoastMetadataCode", () => {
  it("generates Next.js generateMetadata function", () => {
    const yoast: YoastMeta = {
      title: "%%title%% %%sep%% %%sitename%%",
      description: "A great page.",
      canonical: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      focusKeyword: "great",
    };

    const code = generateYoastMetadataCode(yoast);

    expect(code).toContain("export function generateMetadata");
    expect(code).toContain("title:");
    expect(code).toContain("description:");
    // Should use template pattern for placeholders
    expect(code).toContain("%%title%%");
  });

  it("includes openGraph when OG overrides present", () => {
    const yoast: YoastMeta = {
      title: "Title",
      description: "Desc",
      canonical: null,
      ogTitle: "OG Title",
      ogDescription: "OG Desc",
      ogImage: "https://example.com/og.jpg",
      focusKeyword: null,
    };

    const code = generateYoastMetadataCode(yoast);

    expect(code).toContain("openGraph:");
    expect(code).toContain("OG Title");
    expect(code).toContain("og.jpg");
  });

  it("includes alternates.canonical when canonical set", () => {
    const yoast: YoastMeta = {
      title: "Title",
      description: null,
      canonical: "https://example.com/canonical",
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      focusKeyword: null,
    };

    const code = generateYoastMetadataCode(yoast);

    expect(code).toContain("alternates:");
    expect(code).toContain("canonical:");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/analyzer/tests/yoast-extractor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement yoast-extractor.ts**

```typescript
// packages/analyzer/src/yoast-extractor.ts

/**
 * Extract Yoast SEO metadata from WordPress post meta and generate
 * Next.js Metadata API compatible code.
 */

export interface YoastMeta {
  title: string | null;
  description: string | null;
  canonical: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  focusKeyword: string | null;
}

export interface YoastPlaceholderContext {
  postTitle: string;
  siteName: string;
  separator: string;
  primaryCategory?: string;
}

const YOAST_META_MAP: Record<string, keyof YoastMeta> = {
  "_yoast_wpseo_title": "title",
  "_yoast_wpseo_metadesc": "description",
  "_yoast_wpseo_canonical": "canonical",
  "_yoast_wpseo_opengraph-title": "ogTitle",
  "_yoast_wpseo_opengraph-description": "ogDescription",
  "_yoast_wpseo_opengraph-image": "ogImage",
  "_yoast_wpseo_focuskw": "focusKeyword",
};

/**
 * Extract Yoast SEO metadata from a WP post's meta record.
 */
export function extractYoastMeta(
  meta: Record<string, unknown>,
): YoastMeta {
  const result: YoastMeta = {
    title: null,
    description: null,
    canonical: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    focusKeyword: null,
  };

  for (const [metaKey, field] of Object.entries(YOAST_META_MAP)) {
    const value = meta[metaKey];
    if (typeof value === "string" && value.trim()) {
      result[field] = value;
    }
  }

  return result;
}

/**
 * Resolve Yoast %%variable%% placeholders in a template string.
 *
 * Known variables: title, sep, sitename, primary_category, date, excerpt
 * Unknown variables are stripped (removed from output).
 */
export function resolveYoastPlaceholders(
  template: string,
  context: YoastPlaceholderContext,
): string {
  const vars: Record<string, string> = {
    title: context.postTitle,
    sep: context.separator,
    sitename: context.siteName,
    primary_category: context.primaryCategory ?? "",
  };

  let resolved = template.replace(/%%(\w+)%%/g, (_, key: string) => {
    return vars[key] ?? "";
  });

  // Clean up extra whitespace from stripped placeholders
  resolved = resolved.replace(/\s{2,}/g, " ").trim();

  return resolved;
}

/**
 * Generate a Next.js Metadata API helper code string from extracted Yoast meta.
 *
 * Produces a `generateMetadata` function template that can be customized
 * per-page in the generated scaffold.
 */
export function generateYoastMetadataCode(yoast: YoastMeta): string {
  const lines: string[] = [];

  lines.push(`import type { Metadata } from "next";`);
  lines.push(``);
  lines.push(`/**`);
  lines.push(` * Yoast SEO metadata template.`);
  lines.push(` * Original Yoast title pattern: ${yoast.title ?? "(none)"}`);
  if (yoast.focusKeyword) {
    lines.push(` * Focus keyword: ${yoast.focusKeyword}`);
  }
  lines.push(` */`);
  lines.push(`export function generateMetadata(post: {`);
  lines.push(`  title: string;`);
  lines.push(`  excerpt?: string;`);
  lines.push(`  slug: string;`);
  lines.push(`}): Metadata {`);
  lines.push(`  const metadata: Metadata = {};`);
  lines.push(``);

  // Title
  if (yoast.title) {
    if (yoast.title.includes("%%")) {
      lines.push(`  // Yoast pattern: "${yoast.title}"`);
      lines.push(`  // Resolve %%title%%, %%sep%%, %%sitename%% at runtime:`);
      lines.push(`  metadata.title = \`\${post.title} | \${process.env.NEXT_PUBLIC_SITE_NAME ?? "Site"}\`;`);
    } else {
      lines.push(`  metadata.title = "${yoast.title}";`);
    }
  } else {
    lines.push(`  metadata.title = post.title;`);
  }
  lines.push(``);

  // Description
  if (yoast.description) {
    lines.push(`  metadata.description = "${yoast.description}";`);
  } else {
    lines.push(`  metadata.description = post.excerpt ?? "";`);
  }
  lines.push(``);

  // Canonical
  if (yoast.canonical) {
    lines.push(`  metadata.alternates = {`);
    lines.push(`    canonical: "${yoast.canonical}",`);
    lines.push(`  };`);
    lines.push(``);
  }

  // OpenGraph
  const hasOg = yoast.ogTitle || yoast.ogDescription || yoast.ogImage;
  if (hasOg) {
    lines.push(`  metadata.openGraph = {`);
    if (yoast.ogTitle) {
      lines.push(`    title: "${yoast.ogTitle}",`);
    }
    if (yoast.ogDescription) {
      lines.push(`    description: "${yoast.ogDescription}",`);
    }
    if (yoast.ogImage) {
      lines.push(`    images: ["${yoast.ogImage}"],`);
    }
    lines.push(`  };`);
    lines.push(``);
  }

  lines.push(`  return metadata;`);
  lines.push(`}`);

  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/analyzer/tests/yoast-extractor.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/analyzer/src/yoast-extractor.ts packages/analyzer/tests/yoast-extractor.test.ts
git commit -m "feat(analyzer): add Yoast SEO metadata extractor

Extracts _yoast_wpseo_* post meta into typed YoastMeta.
Resolves %%variable%% placeholders (title, sep, sitename, etc).
Generates Next.js Metadata API code template with OG support."
```

---

## Task 4: ACF Template Generator

**Files:**
- Create: `packages/analyzer/src/acf-template-generator.ts`
- Create: `packages/analyzer/tests/acf-template-generator.test.ts`

### Purpose

Generate typed field accessor functions and Zod schemas from detected ACF fields (`AcfFieldInfo[]`). This lets the generated Next.js code access custom fields with type safety.

### Design

From the existing `AcfFieldInfo[]` (already detected by `schema-analyzer.ts`), generate:
1. A Zod schema for the custom fields
2. A typed accessor helper function
3. A TypeScript type export

- [ ] **Step 1: Write failing tests**

```typescript
// packages/analyzer/tests/acf-template-generator.test.ts
import { describe, it, expect } from "vitest";
import { generateAcfTemplate } from "../src/acf-template-generator.js";
import type { AcfFieldInfo, InferredType } from "../src/schema-analyzer.js";

function makeField(
  name: string,
  inferredType: InferredType,
  fieldKey = `field_${name}`,
): AcfFieldInfo {
  return { name, fieldKey, inferredType, sampleValues: [] };
}

describe("generateAcfTemplate", () => {
  it("generates Zod schema from ACF fields", () => {
    const fields = [
      makeField("price", "number"),
      makeField("color", "string"),
      makeField("is_featured", "boolean"),
    ];

    const result = generateAcfTemplate(fields);

    expect(result.schemaCode).toContain("import { z } from");
    expect(result.schemaCode).toContain("price: z.coerce.number()");
    expect(result.schemaCode).toContain("color: z.string()");
    expect(result.schemaCode).toContain("is_featured: z.coerce.boolean()");
    expect(result.schemaCode).toContain("export const AcfFieldsSchema");
    expect(result.schemaCode).toContain("export type AcfFields");
  });

  it("maps date type to z.coerce.date()", () => {
    const fields = [makeField("event_date", "date")];

    const result = generateAcfTemplate(fields);

    expect(result.schemaCode).toContain("event_date: z.coerce.date()");
  });

  it("maps json type to z.unknown()", () => {
    const fields = [makeField("config", "json")];

    const result = generateAcfTemplate(fields);

    expect(result.schemaCode).toContain("config: z.unknown()");
  });

  it("maps unknown type to z.unknown()", () => {
    const fields = [makeField("mystery", "unknown")];

    const result = generateAcfTemplate(fields);

    expect(result.schemaCode).toContain("mystery: z.unknown()");
  });

  it("generates accessor helper function", () => {
    const fields = [
      makeField("price", "number"),
      makeField("color", "string"),
    ];

    const result = generateAcfTemplate(fields);

    expect(result.accessorCode).toContain("export function getAcfFields");
    expect(result.accessorCode).toContain("AcfFieldsSchema.parse");
    // Should reference field keys as comments for traceability
    expect(result.accessorCode).toContain("field_price");
    expect(result.accessorCode).toContain("field_color");
  });

  it("returns empty template for no fields", () => {
    const result = generateAcfTemplate([]);

    expect(result.schemaCode).toContain("// No ACF fields detected");
    expect(result.accessorCode).toContain("// No ACF fields detected");
  });

  it("generates camelCase type name from field name", () => {
    const fields = [makeField("event_start_date", "date")];

    const result = generateAcfTemplate(fields);

    expect(result.schemaCode).toContain("event_start_date:");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/analyzer/tests/acf-template-generator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement acf-template-generator.ts**

```typescript
// packages/analyzer/src/acf-template-generator.ts

/**
 * Generate typed field accessors and Zod schemas from detected ACF fields.
 */
import type { AcfFieldInfo, InferredType } from "./schema-analyzer.js";

export interface AcfTemplateResult {
  /** Zod schema + type export code */
  schemaCode: string;
  /** Accessor function code */
  accessorCode: string;
}

function inferredTypeToZod(t: InferredType): string {
  switch (t) {
    case "string":
      return "z.string()";
    case "number":
      return "z.coerce.number()";
    case "boolean":
      return "z.coerce.boolean()";
    case "date":
      return "z.coerce.date()";
    case "json":
    case "unknown":
      return "z.unknown()";
  }
}

/**
 * Generate Zod schema code and accessor helper from ACF field definitions.
 */
export function generateAcfTemplate(fields: AcfFieldInfo[]): AcfTemplateResult {
  if (fields.length === 0) {
    return {
      schemaCode: "// No ACF fields detected\n",
      accessorCode: "// No ACF fields detected\n",
    };
  }

  // ── Schema code ──
  const schemaLines: string[] = [];
  schemaLines.push(`import { z } from "zod";`);
  schemaLines.push(``);
  schemaLines.push(`export const AcfFieldsSchema = z.object({`);
  for (const field of fields) {
    schemaLines.push(`  ${field.name}: ${inferredTypeToZod(field.inferredType)}, // ${field.fieldKey}`);
  }
  schemaLines.push(`});`);
  schemaLines.push(``);
  schemaLines.push(`export type AcfFields = z.infer<typeof AcfFieldsSchema>;`);

  // ── Accessor code ──
  const accessorLines: string[] = [];
  accessorLines.push(`import { AcfFieldsSchema, type AcfFields } from "./acf-schema";`);
  accessorLines.push(``);
  accessorLines.push(`/**`);
  accessorLines.push(` * Extract and validate ACF custom fields from post meta.`);
  accessorLines.push(` *`);
  accessorLines.push(` * Field key mapping:`);
  for (const field of fields) {
    accessorLines.push(` *   ${field.name} → ${field.fieldKey}`);
  }
  accessorLines.push(` */`);
  accessorLines.push(`export function getAcfFields(`);
  accessorLines.push(`  meta: Record<string, unknown>,`);
  accessorLines.push(`): AcfFields {`);
  accessorLines.push(`  const raw: Record<string, unknown> = {};`);
  for (const field of fields) {
    accessorLines.push(`  raw.${field.name} = meta["${field.name}"];`);
  }
  accessorLines.push(`  return AcfFieldsSchema.parse(raw);`);
  accessorLines.push(`}`);

  return {
    schemaCode: schemaLines.join("\n"),
    accessorCode: accessorLines.join("\n"),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/analyzer/tests/acf-template-generator.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/analyzer/src/acf-template-generator.ts packages/analyzer/tests/acf-template-generator.test.ts
git commit -m "feat(analyzer): add ACF template generator

Generates Zod schema + typed accessor from AcfFieldInfo[].
Maps inferred types to Zod validators (coerce for number/boolean/date).
Includes field key traceability comments."
```

---

## Task 5: WXR Blog Scaffold Generator

**Files:**
- Create: `packages/analyzer/src/blog-scaffold-generator.ts`
- Create: `packages/analyzer/tests/blog-scaffold-generator.test.ts`

### Purpose

Generate a complete Next.js blog project from WXR parse result, consuming outputs from C1-C3.

### Design

Generates the following scaffold files:
1. `app/blog/[slug]/page.tsx` — Individual post page with PT rendering
2. `app/blog/page.tsx` — Blog archive listing
3. `app/blog/category/[slug]/page.tsx` — Category archive
4. `app/not-found.tsx` — 404 page
5. `app/layout.tsx` — Root layout with metadata
6. `next.config.ts` — Config with image remotePatterns + redirects
7. `lib/content.ts` — Data layer (reads exported JSON)
8. `lib/portable-text.tsx` — PT renderer component

Addresses Gemini Q5 concerns:
- **Image pipeline**: `next.config.ts` includes `images.remotePatterns` extracted from WXR media URLs
- **Permalink compatibility**: `next.config.ts` includes `redirects` from detected WP permalink patterns

- [ ] **Step 1: Write failing tests**

```typescript
// packages/analyzer/tests/blog-scaffold-generator.test.ts
import { describe, it, expect } from "vitest";
import {
  generateBlogScaffold,
  type BlogScaffoldInput,
  type ScaffoldFile,
} from "../src/blog-scaffold-generator.js";

function makeInput(overrides: Partial<BlogScaffoldInput> = {}): BlogScaffoldInput {
  return {
    siteTitle: "My Blog",
    siteUrl: "https://example.com",
    posts: [
      {
        slug: "hello-world",
        title: "Hello World",
        date: "2024-01-01",
        categories: ["uncategorized"],
      },
    ],
    categories: [{ slug: "uncategorized", name: "Uncategorized", count: 1 }],
    hasYoastSeo: false,
    hasAcfFields: false,
    mediaDomains: ["example.com"],
    wpPermalinkStructure: null,
    ...overrides,
  };
}

function findFile(files: ScaffoldFile[], pathFragment: string): ScaffoldFile | undefined {
  return files.find((f) => f.path.includes(pathFragment));
}

describe("generateBlogScaffold", () => {
  it("generates blog post page", () => {
    const result = generateBlogScaffold(makeInput());
    const postPage = findFile(result, "blog/[slug]/page.tsx");

    expect(postPage).toBeDefined();
    expect(postPage!.content).toContain("export default");
    expect(postPage!.content).toContain("params");
  });

  it("generates blog archive page", () => {
    const result = generateBlogScaffold(makeInput());
    const archive = findFile(result, "app/blog/page.tsx");

    expect(archive).toBeDefined();
    expect(archive!.content).toContain("export default");
  });

  it("generates category archive page", () => {
    const result = generateBlogScaffold(makeInput());
    const catPage = findFile(result, "category/[slug]/page.tsx");

    expect(catPage).toBeDefined();
    expect(catPage!.content).toContain("export default");
  });

  it("generates 404 page", () => {
    const result = generateBlogScaffold(makeInput());
    const notFound = findFile(result, "not-found.tsx");

    expect(notFound).toBeDefined();
    expect(notFound!.content).toContain("404");
  });

  it("generates root layout with site title", () => {
    const result = generateBlogScaffold(makeInput({ siteTitle: "Cool Blog" }));
    const layout = findFile(result, "app/layout.tsx");

    expect(layout).toBeDefined();
    expect(layout!.content).toContain("Cool Blog");
  });

  it("includes image remotePatterns in next.config.ts", () => {
    const result = generateBlogScaffold(
      makeInput({ mediaDomains: ["cdn.example.com", "images.example.org"] }),
    );
    const config = findFile(result, "next.config.ts");

    expect(config).toBeDefined();
    expect(config!.content).toContain("remotePatterns");
    expect(config!.content).toContain("cdn.example.com");
    expect(config!.content).toContain("images.example.org");
  });

  it("includes redirects for dated permalink structure", () => {
    const result = generateBlogScaffold(
      makeInput({ wpPermalinkStructure: "/%year%/%monthnum%/%postname%/" }),
    );
    const config = findFile(result, "next.config.ts");

    expect(config).toBeDefined();
    expect(config!.content).toContain("redirects");
    expect(config!.content).toContain(":year");
    expect(config!.content).toContain("/blog/:slug");
  });

  it("generates content data layer", () => {
    const result = generateBlogScaffold(makeInput());
    const content = findFile(result, "lib/content.ts");

    expect(content).toBeDefined();
    expect(content!.content).toContain("getPostBySlug");
    expect(content!.content).toContain("getAllPosts");
  });

  it("generates portable text renderer component", () => {
    const result = generateBlogScaffold(makeInput());
    const ptRenderer = findFile(result, "lib/portable-text.tsx");

    expect(ptRenderer).toBeDefined();
    expect(ptRenderer!.content).toContain("PortableTextRenderer");
  });

  it("includes Yoast metadata import when hasYoastSeo is true", () => {
    const result = generateBlogScaffold(makeInput({ hasYoastSeo: true }));
    const postPage = findFile(result, "blog/[slug]/page.tsx");

    expect(postPage!.content).toContain("generateMetadata");
  });

  it("includes ACF accessor when hasAcfFields is true", () => {
    const result = generateBlogScaffold(makeInput({ hasAcfFields: true }));
    const postPage = findFile(result, "blog/[slug]/page.tsx");

    expect(postPage!.content).toContain("getAcfFields");
  });

  it("skips redirects when no permalink structure detected", () => {
    const result = generateBlogScaffold(makeInput({ wpPermalinkStructure: null }));
    const config = findFile(result, "next.config.ts");

    expect(config!.content).not.toContain("redirects");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/analyzer/tests/blog-scaffold-generator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement blog-scaffold-generator.ts**

```typescript
// packages/analyzer/src/blog-scaffold-generator.ts

/**
 * Generate a complete Next.js blog scaffold from WXR analysis output.
 *
 * Produces App Router pages, data layer, Portable Text renderer,
 * and next.config.ts with image domains and permalink redirects.
 */

export interface ScaffoldFile {
  path: string;
  content: string;
}

export interface BlogPostInfo {
  slug: string;
  title: string;
  date: string;
  categories: string[];
}

export interface CategoryInfo {
  slug: string;
  name: string;
  count: number;
}

export interface BlogScaffoldInput {
  siteTitle: string;
  siteUrl: string;
  posts: BlogPostInfo[];
  categories: CategoryInfo[];
  hasYoastSeo: boolean;
  hasAcfFields: boolean;
  mediaDomains: string[];
  wpPermalinkStructure: string | null;
}

// ── File generators ──

function generateLayout(input: BlogScaffoldInput): ScaffoldFile {
  const content = `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "${input.siteTitle}",
    template: \`%s | ${input.siteTitle}\`,
  },
  description: "Migrated from WordPress with wp-transfer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header>
          <nav>
            <a href="/">${input.siteTitle}</a>
            <a href="/blog">Blog</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>&copy; ${new Date().getFullYear()} ${input.siteTitle}</p>
        </footer>
      </body>
    </html>
  );
}
`;
  return { path: "app/layout.tsx", content };
}

function generateBlogArchive(): ScaffoldFile {
  const content = `import { getAllPosts } from "@/lib/content";
import Link from "next/link";

export default async function BlogPage() {
  const posts = await getAllPosts();

  return (
    <div>
      <h1>Blog</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.slug}>
            <Link href={\`/blog/\${post.slug}\`}>
              <h2>{post.title}</h2>
              <time dateTime={post.date}>{post.date}</time>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
`;
  return { path: "app/blog/page.tsx", content };
}

function generateBlogPost(input: BlogScaffoldInput): ScaffoldFile {
  const imports = [`import { getPostBySlug, getAllPosts } from "@/lib/content";`];
  imports.push(`import { PortableTextRenderer } from "@/lib/portable-text";`);
  imports.push(`import { notFound } from "next/navigation";`);

  if (input.hasYoastSeo) {
    imports.push(`import { generateMetadata as generateYoastMetadata } from "@/lib/yoast-metadata";`);
  }
  if (input.hasAcfFields) {
    imports.push(`import { getAcfFields } from "@/lib/acf-fields";`);
  }

  const metadataFn = input.hasYoastSeo
    ? `
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};
  return generateYoastMetadata(post);
}
`
    : `
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};
  return { title: post.title, description: post.excerpt ?? "" };
}
`;

  const acfSection = input.hasAcfFields
    ? `
      {post.meta && (
        <aside>
          <h3>Custom Fields</h3>
          <pre>{JSON.stringify(getAcfFields(post.meta), null, 2)}</pre>
        </aside>
      )}`
    : "";

  const content = `${imports.join("\n")}

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}
${metadataFn}
export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) notFound();

  return (
    <article>
      <h1>{post.title}</h1>
      <time dateTime={post.date}>{post.date}</time>
      <PortableTextRenderer blocks={post.content} />${acfSection}
    </article>
  );
}
`;
  return { path: "app/blog/[slug]/page.tsx", content };
}

function generateCategoryPage(): ScaffoldFile {
  const content = `import { getPostsByCategory, getAllCategories } from "@/lib/content";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const categories = await getAllCategories();
  return categories.map((cat) => ({ slug: cat.slug }));
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const posts = await getPostsByCategory(slug);

  if (posts.length === 0) notFound();

  return (
    <div>
      <h1>Category: {slug}</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.slug}>
            <Link href={\`/blog/\${post.slug}\`}>
              <h2>{post.title}</h2>
              <time dateTime={post.date}>{post.date}</time>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
`;
  return { path: "app/blog/category/[slug]/page.tsx", content };
}

function generateNotFound(input: BlogScaffoldInput): ScaffoldFile {
  const content = `export default function NotFound() {
  return (
    <div>
      <h1>404 — Page Not Found</h1>
      <p>The page you are looking for does not exist on ${input.siteTitle}.</p>
      <a href="/blog">Back to Blog</a>
    </div>
  );
}
`;
  return { path: "app/not-found.tsx", content };
}

function generateContentLib(): ScaffoldFile {
  const content = `import postsData from "@/data/posts.json";

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  excerpt?: string;
  categories: string[];
  content: unknown[]; // WptContentBlock[]
  meta?: Record<string, unknown>;
}

export interface CategorySummary {
  slug: string;
  name: string;
  count: number;
}

const posts: BlogPost[] = postsData as BlogPost[];

export async function getAllPosts(): Promise<BlogPost[]> {
  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  return posts.find((p) => p.slug === slug) ?? null;
}

export async function getPostsByCategory(categorySlug: string): Promise<BlogPost[]> {
  return posts
    .filter((p) => p.categories.includes(categorySlug))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function getAllCategories(): Promise<CategorySummary[]> {
  const map = new Map<string, number>();
  for (const post of posts) {
    for (const cat of post.categories) {
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
  }
  return Array.from(map, ([slug, count]) => ({ slug, name: slug, count }));
}
`;
  return { path: "lib/content.ts", content };
}

function generatePortableTextRenderer(): ScaffoldFile {
  const content = `"use client";

/**
 * Portable Text renderer for wp-transfer converted content.
 * Renders WptContentBlock[] as React components.
 */

interface PTBlock {
  _type: string;
  _key: string;
  [key: string]: unknown;
}

interface PTSpan {
  _type: "span";
  _key: string;
  text: string;
  marks?: string[];
}

interface MarkDef {
  _key: string;
  _type: string;
  href?: string;
}

function renderSpan(span: PTSpan, markDefs: MarkDef[] = []): React.ReactNode {
  let content: React.ReactNode = span.text;

  for (const mark of span.marks ?? []) {
    if (mark === "strong") {
      content = <strong key={span._key + "_s"}>{content}</strong>;
    } else if (mark === "em") {
      content = <em key={span._key + "_e"}>{content}</em>;
    } else if (mark === "code") {
      content = <code key={span._key + "_c"}>{content}</code>;
    } else {
      const def = markDefs.find((d) => d._key === mark);
      if (def?._type === "link" && def.href) {
        content = <a key={span._key + "_a"} href={def.href}>{content}</a>;
      }
    }
  }

  return content;
}

function renderBlock(block: PTBlock): React.ReactNode {
  if (block._type === "block") {
    const children = (block.children as PTSpan[]) ?? [];
    const markDefs = (block.markDefs as MarkDef[]) ?? [];
    const style = (block.style as string) ?? "normal";
    const listItem = block.listItem as string | undefined;

    const rendered = children.map((span) => (
      <span key={span._key}>{renderSpan(span, markDefs)}</span>
    ));

    if (listItem) {
      return <li key={block._key}>{rendered}</li>;
    }

    switch (style) {
      case "h1": return <h1 key={block._key}>{rendered}</h1>;
      case "h2": return <h2 key={block._key}>{rendered}</h2>;
      case "h3": return <h3 key={block._key}>{rendered}</h3>;
      case "h4": return <h4 key={block._key}>{rendered}</h4>;
      case "h5": return <h5 key={block._key}>{rendered}</h5>;
      case "h6": return <h6 key={block._key}>{rendered}</h6>;
      case "blockquote": return <blockquote key={block._key}>{rendered}</blockquote>;
      case "separator": return <hr key={block._key} />;
      default: return <p key={block._key}>{rendered}</p>;
    }
  }

  if (block._type === "image") {
    return (
      <figure key={block._key}>
        <img
          src={block.src as string}
          alt={(block.alt as string) ?? ""}
          loading="lazy"
        />
        {block.caption && <figcaption>{block.caption as string}</figcaption>}
      </figure>
    );
  }

  if (block._type === "code") {
    return (
      <pre key={block._key}>
        <code className={block.language ? \`language-\${block.language}\` : undefined}>
          {block.code as string}
        </code>
      </pre>
    );
  }

  if (block._type === "embed") {
    return (
      <div key={block._key} className="embed-container">
        <a href={block.url as string} target="_blank" rel="noopener noreferrer">
          {(block.provider as string) ?? "Embedded content"}: {block.url as string}
        </a>
      </div>
    );
  }

  if (block._type === "htmlBlock") {
    return (
      <div
        key={block._key}
        dangerouslySetInnerHTML={{ __html: block.html as string }}
      />
    );
  }

  return null;
}

export function PortableTextRenderer({ blocks }: { blocks: unknown[] }) {
  const ptBlocks = blocks as PTBlock[];

  // Group consecutive list items into <ul>/<ol>
  const elements: React.ReactNode[] = [];
  let currentList: PTBlock[] = [];
  let currentListType: string | null = null;

  function flushList() {
    if (currentList.length > 0) {
      const Tag = currentListType === "number" ? "ol" : "ul";
      elements.push(
        <Tag key={currentList[0]._key + "_list"}>
          {currentList.map(renderBlock)}
        </Tag>,
      );
      currentList = [];
      currentListType = null;
    }
  }

  for (const block of ptBlocks) {
    const listItem = block._type === "block" ? (block.listItem as string | undefined) : undefined;

    if (listItem) {
      if (currentListType && currentListType !== listItem) {
        flushList();
      }
      currentListType = listItem;
      currentList.push(block);
    } else {
      flushList();
      elements.push(renderBlock(block));
    }
  }
  flushList();

  return <div className="portable-text">{elements}</div>;
}
`;
  return { path: "lib/portable-text.tsx", content };
}

function generateNextConfig(input: BlogScaffoldInput): ScaffoldFile {
  const lines: string[] = [];
  lines.push(`import type { NextConfig } from "next";`);
  lines.push(``);
  lines.push(`const nextConfig: NextConfig = {`);

  // Image remote patterns
  if (input.mediaDomains.length > 0) {
    lines.push(`  images: {`);
    lines.push(`    remotePatterns: [`);
    for (const domain of input.mediaDomains) {
      lines.push(`      { protocol: "https", hostname: "${domain}" },`);
    }
    lines.push(`    ],`);
    lines.push(`  },`);
  }

  // Redirects for permalink compatibility
  if (input.wpPermalinkStructure) {
    const redirects = generateRedirects(input.wpPermalinkStructure);
    if (redirects.length > 0) {
      lines.push(`  async redirects() {`);
      lines.push(`    return [`);
      for (const r of redirects) {
        lines.push(`      { source: "${r.source}", destination: "${r.destination}", permanent: true },`);
      }
      lines.push(`    ];`);
      lines.push(`  },`);
    }
  }

  lines.push(`};`);
  lines.push(``);
  lines.push(`export default nextConfig;`);

  return { path: "next.config.ts", content: lines.join("\n") };
}

interface RedirectRule {
  source: string;
  destination: string;
}

function generateRedirects(permalinkStructure: string): RedirectRule[] {
  const rules: RedirectRule[] = [];

  // /%year%/%monthnum%/%postname%/ → /blog/:slug
  if (
    permalinkStructure.includes("%year%") &&
    permalinkStructure.includes("%postname%")
  ) {
    rules.push({
      source: "/:year(\\\\d{4})/:month(\\\\d{2})/:slug",
      destination: "/blog/:slug",
    });
  }

  // /%year%/%monthnum%/%day%/%postname%/ → /blog/:slug
  if (
    permalinkStructure.includes("%year%") &&
    permalinkStructure.includes("%day%") &&
    permalinkStructure.includes("%postname%")
  ) {
    rules.push({
      source: "/:year(\\\\d{4})/:month(\\\\d{2})/:day(\\\\d{2})/:slug",
      destination: "/blog/:slug",
    });
  }

  // /%postname%/ (plain) — no redirect needed, but /archives/%post_id% needs one
  if (permalinkStructure.includes("%post_id%")) {
    rules.push({
      source: "/archives/:id(\\\\d+)",
      destination: "/blog",
    });
  }

  return rules;
}

function generateGlobalsCss(): ScaffoldFile {
  return {
    path: "app/globals.css",
    content: `/* Global styles — customize after migration */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; line-height: 1.6; max-width: 48rem; margin: 0 auto; padding: 2rem; }
nav { display: flex; gap: 1rem; margin-bottom: 2rem; }
nav a { text-decoration: none; font-weight: bold; }
article { margin-bottom: 2rem; }
.portable-text img { max-width: 100%; height: auto; }
.portable-text pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; border-radius: 4px; }
.portable-text blockquote { border-left: 3px solid #ccc; padding-left: 1rem; margin: 1rem 0; font-style: italic; }
footer { margin-top: 4rem; padding-top: 1rem; border-top: 1px solid #eee; font-size: 0.875rem; color: #666; }
`,
  };
}

// ── Main ──

/**
 * Generate a complete Next.js blog scaffold from WXR analysis.
 */
export function generateBlogScaffold(input: BlogScaffoldInput): ScaffoldFile[] {
  return [
    generateLayout(input),
    generateGlobalsCss(),
    generateBlogArchive(),
    generateBlogPost(input),
    generateCategoryPage(),
    generateNotFound(input),
    generateContentLib(),
    generatePortableTextRenderer(),
    generateNextConfig(input),
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/analyzer/tests/blog-scaffold-generator.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/analyzer/src/blog-scaffold-generator.ts packages/analyzer/tests/blog-scaffold-generator.test.ts
git commit -m "feat(analyzer): add WXR blog scaffold generator

Generates complete Next.js App Router blog from WXR analysis:
post pages, archive, category, 404, layout, PT renderer, data layer.
Includes next.config.ts with image remotePatterns and WP permalink
redirect rules (Gemini Q5 concerns addressed)."
```

---

## Task 6: Verify Generator (Playwright Test Scaffolding)

**Files:**
- Create: `packages/analyzer/src/verify-generator.ts`
- Create: `packages/analyzer/tests/verify-generator.test.ts`

### Purpose

Generate Playwright E2E test configuration and smoke tests for a scaffolded Next.js project. Verifies: build success, page rendering (200 OK), no console errors.

- [ ] **Step 1: Write failing tests**

```typescript
// packages/analyzer/tests/verify-generator.test.ts
import { describe, it, expect } from "vitest";
import {
  generateVerifyScaffold,
  type VerifyInput,
  type ScaffoldFile,
} from "../src/verify-generator.js";

function makeInput(overrides: Partial<VerifyInput> = {}): VerifyInput {
  return {
    postSlugs: ["hello-world", "second-post"],
    categorySlugs: ["uncategorized", "tech"],
    ...overrides,
  };
}

function findFile(files: ScaffoldFile[], pathFragment: string): ScaffoldFile | undefined {
  return files.find((f) => f.path.includes(pathFragment));
}

describe("generateVerifyScaffold", () => {
  it("generates playwright.config.ts", () => {
    const result = generateVerifyScaffold(makeInput());
    const config = findFile(result, "playwright.config.ts");

    expect(config).toBeDefined();
    expect(config!.content).toContain("defineConfig");
    expect(config!.content).toContain("webServer");
    expect(config!.content).toContain("next dev");
  });

  it("generates smoke test for blog archive", () => {
    const result = generateVerifyScaffold(makeInput());
    const smoke = findFile(result, "smoke.spec.ts");

    expect(smoke).toBeDefined();
    expect(smoke!.content).toContain("/blog");
    expect(smoke!.content).toContain("200");
  });

  it("generates tests for individual post pages", () => {
    const result = generateVerifyScaffold(makeInput());
    const smoke = findFile(result, "smoke.spec.ts");

    expect(smoke!.content).toContain("hello-world");
    expect(smoke!.content).toContain("second-post");
  });

  it("generates test for category pages", () => {
    const result = generateVerifyScaffold(makeInput());
    const smoke = findFile(result, "smoke.spec.ts");

    expect(smoke!.content).toContain("/blog/category/uncategorized");
    expect(smoke!.content).toContain("/blog/category/tech");
  });

  it("generates console error check test", () => {
    const result = generateVerifyScaffold(makeInput());
    const smoke = findFile(result, "smoke.spec.ts");

    expect(smoke!.content).toContain("console");
    expect(smoke!.content).toContain("error");
  });

  it("generates build verification script", () => {
    const result = generateVerifyScaffold(makeInput());
    const build = findFile(result, "verify-build.sh");

    expect(build).toBeDefined();
    expect(build!.content).toContain("next build");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/analyzer/tests/verify-generator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement verify-generator.ts**

```typescript
// packages/analyzer/src/verify-generator.ts

/**
 * Generate Playwright E2E smoke tests for a scaffolded Next.js project.
 *
 * Verifies:
 * 1. Build succeeds (next build)
 * 2. Key pages return 200
 * 3. No console errors on page load
 */

// Re-use the ScaffoldFile type from blog-scaffold-generator
export interface ScaffoldFile {
  path: string;
  content: string;
}

export interface VerifyInput {
  postSlugs: string[];
  categorySlugs: string[];
}

function generatePlaywrightConfig(): ScaffoldFile {
  const content = `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
`;
  return { path: "playwright.config.ts", content };
}

function generateSmokeTest(input: VerifyInput): ScaffoldFile {
  const lines: string[] = [];

  lines.push(`import { test, expect } from "@playwright/test";`);
  lines.push(``);

  // Blog archive
  lines.push(`test("blog archive loads", async ({ page }) => {`);
  lines.push(`  const response = await page.goto("/blog");`);
  lines.push(`  expect(response?.status()).toBe(200);`);
  lines.push(`});`);
  lines.push(``);

  // Individual posts
  for (const slug of input.postSlugs) {
    lines.push(`test("post page: ${slug}", async ({ page }) => {`);
    lines.push(`  const response = await page.goto("/blog/${slug}");`);
    lines.push(`  expect(response?.status()).toBe(200);`);
    lines.push(`});`);
    lines.push(``);
  }

  // Category pages
  for (const slug of input.categorySlugs) {
    lines.push(`test("category page: ${slug}", async ({ page }) => {`);
    lines.push(`  const response = await page.goto("/blog/category/${slug}");`);
    lines.push(`  expect(response?.status()).toBe(200);`);
    lines.push(`});`);
    lines.push(``);
  }

  // Console error check
  lines.push(`test("no console errors on blog archive", async ({ page }) => {`);
  lines.push(`  const errors: string[] = [];`);
  lines.push(`  page.on("console", (msg) => {`);
  lines.push(`    if (msg.type() === "error") errors.push(msg.text());`);
  lines.push(`  });`);
  lines.push(`  await page.goto("/blog");`);
  lines.push(`  await page.waitForLoadState("networkidle");`);
  lines.push(`  expect(errors).toEqual([]);`);
  lines.push(`});`);

  return { path: "e2e/smoke.spec.ts", content: lines.join("\n") };
}

function generateBuildVerifyScript(): ScaffoldFile {
  const content = `#!/bin/bash
set -euo pipefail

echo "=== Build Verification ==="
echo "Running next build..."
npx next build

if [ $? -eq 0 ]; then
  echo "BUILD: PASS"
else
  echo "BUILD: FAIL"
  exit 1
fi

echo ""
echo "=== Verification complete ==="
`;
  return { path: "e2e/verify-build.sh", content };
}

/**
 * Generate Playwright smoke test scaffold for a generated Next.js project.
 */
export function generateVerifyScaffold(input: VerifyInput): ScaffoldFile[] {
  return [
    generatePlaywrightConfig(),
    generateSmokeTest(input),
    generateBuildVerifyScript(),
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/analyzer/tests/verify-generator.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/analyzer/src/verify-generator.ts packages/analyzer/tests/verify-generator.test.ts
git commit -m "feat(analyzer): add Playwright verify scaffold generator

Generates playwright.config.ts, smoke test (200 checks for all
pages + console error assertion), and build verification script."
```

---

## Task 7: Export and Wire Up New Modules

**Files:**
- Modify: `packages/analyzer/src/index.ts`
- Modify: `apps/cli/src/commands/analyze.ts`

### Purpose

Export all new modules from analyzer index. Wire Gutenberg conversion into the WXR analysis flow so `wp-transfer analyze` also converts content to Portable Text.

- [ ] **Step 1: Update analyzer exports**

Add to `packages/analyzer/src/index.ts`:

```typescript
// After existing exports, add:

export {
  parseGutenbergBlocks,
  type GutenbergBlock,
} from "./gutenberg-parser.js";

export {
  convertBlocksToPortableText,
} from "./block-converter.js";

export {
  extractYoastMeta,
  resolveYoastPlaceholders,
  generateYoastMetadataCode,
  type YoastMeta,
  type YoastPlaceholderContext,
} from "./yoast-extractor.js";

export {
  generateAcfTemplate,
  type AcfTemplateResult,
} from "./acf-template-generator.js";

export {
  generateBlogScaffold,
  type BlogScaffoldInput,
  type BlogPostInfo,
  type CategoryInfo,
  type ScaffoldFile,
} from "./blog-scaffold-generator.js";

export {
  generateVerifyScaffold,
  type VerifyInput,
} from "./verify-generator.js";
```

- [ ] **Step 2: Run typecheck to verify exports**

Run: `pnpm -r typecheck`
Expected: All packages pass

- [ ] **Step 3: Wire Gutenberg conversion into analyze command**

In `apps/cli/src/commands/analyze.ts`, add content conversion after WXR parsing. Add these imports:

```typescript
import {
  analyzeSchema,
  estimateCost,
  generateReport,
  reportToMarkdown,
  createWpRestClient,
  classifyPlugin,
  parseGutenbergBlocks,
  convertBlocksToPortableText,
} from "@wp-transfer/analyzer";
```

In the `analyzeFromWxr` function, after `const schema = analyzeSchema(...)`, add:

```typescript
  // Convert Gutenberg content to Portable Text
  consola.start("Converting content to Portable Text...");
  let convertedCount = 0;
  for (const post of wxr.posts) {
    if (post.content && post.content.includes("<!-- wp:")) {
      const blocks = parseGutenbergBlocks(post.content);
      const ptBlocks = convertBlocksToPortableText(blocks);
      (post as Record<string, unknown>).portableText = ptBlocks;
      convertedCount++;
    }
  }
  consola.success(`Converted ${convertedCount}/${wxr.posts.length} posts to Portable Text`);
```

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `npx vitest run`
Expected: All 217+ tests PASS (plus new tests from Tasks 1-6)

- [ ] **Step 5: Commit**

```bash
git add packages/analyzer/src/index.ts apps/cli/src/commands/analyze.ts
git commit -m "feat: wire Gutenberg conversion into WXR analysis pipeline

Export all C-phase modules from analyzer. WXR analysis now
converts Gutenberg block content to Portable Text automatically."
```

---

## Task 8: Integration Test — End-to-End WXR to Blog Scaffold

**Files:**
- Create: `packages/analyzer/tests/integration-wxr-blog.test.ts`

### Purpose

Verify the full pipeline: WXR parse → Gutenberg convert → schema analyze → blog scaffold generation. Uses the existing `gutenberg-blocks.xml` fixture.

- [ ] **Step 1: Write integration test**

```typescript
// packages/analyzer/tests/integration-wxr-blog.test.ts
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

describe("Integration: WXR → Blog Scaffold", () => {
  it("full pipeline with gutenberg-blocks.xml", async () => {
    // 1. Parse WXR
    const stream = createReadStream(resolve(fixturesDir, "gutenberg-blocks.xml"), "utf-8");
    const wxr = await parseWxr(stream);

    expect(wxr.posts.length).toBeGreaterThan(0);

    // 2. Convert Gutenberg content
    const post = wxr.posts[0];
    const blocks = parseGutenbergBlocks(post.content);
    expect(blocks.length).toBeGreaterThan(0);

    const ptBlocks = convertBlocksToPortableText(blocks);
    expect(ptBlocks.length).toBeGreaterThan(0);

    // Should have paragraph, heading, list items, image, code, embed
    const types = new Set(ptBlocks.map((b) => b._type));
    expect(types.has("block")).toBe(true);
    expect(types.has("image")).toBe(true);
    expect(types.has("code")).toBe(true);
    expect(types.has("embed")).toBe(true);

    // 3. Analyze schema
    const schema = analyzeSchema(wxr.posts, wxr.taxonomies, wxr.media, wxr.users.length);

    // 4. Generate blog scaffold
    const scaffold = generateBlogScaffold({
      siteTitle: wxr.siteTitle || "Test Blog",
      siteUrl: wxr.siteUrl || "https://example.com",
      posts: wxr.posts.map((p) => ({
        slug: p.slug,
        title: p.title,
        date: p.date,
        categories: [],
      })),
      categories: [],
      hasYoastSeo: schema.hasYoastSeo,
      hasAcfFields: schema.acfFields.length > 0,
      mediaDomains: ["example.com"],
      wpPermalinkStructure: null,
    });

    // Verify all expected files generated
    expect(scaffold.length).toBeGreaterThanOrEqual(9);
    const paths = scaffold.map((f) => f.path);
    expect(paths).toContain("app/layout.tsx");
    expect(paths).toContain("app/blog/page.tsx");
    expect(paths).toContain("app/blog/[slug]/page.tsx");
    expect(paths).toContain("app/not-found.tsx");
    expect(paths).toContain("lib/content.ts");
    expect(paths).toContain("lib/portable-text.tsx");
    expect(paths).toContain("next.config.ts");

    // 5. Generate verify scaffold
    const verify = generateVerifyScaffold({
      postSlugs: wxr.posts.map((p) => p.slug),
      categorySlugs: [],
    });

    expect(verify.length).toBeGreaterThanOrEqual(3);
    const verifyPaths = verify.map((f) => f.path);
    expect(verifyPaths).toContain("playwright.config.ts");
    expect(verifyPaths).toContain("e2e/smoke.spec.ts");
  });

  it("full pipeline with acf-fields.xml (Yoast + ACF)", async () => {
    const stream = createReadStream(resolve(fixturesDir, "acf-fields.xml"), "utf-8");
    const wxr = await parseWxr(stream);

    const schema = analyzeSchema(wxr.posts, wxr.taxonomies, wxr.media, wxr.users.length);

    // Yoast should be detected
    expect(schema.hasYoastSeo).toBe(true);

    // ACF fields should be detected
    expect(schema.acfFields.length).toBeGreaterThan(0);

    // Extract Yoast meta from first post
    const yoast = extractYoastMeta(wxr.posts[0].meta);
    expect(yoast.title).toContain("%%sep%%");
    expect(yoast.description).toBeTruthy();

    // Scaffold should include Yoast + ACF integration
    const scaffold = generateBlogScaffold({
      siteTitle: "ACF Test",
      siteUrl: "https://example.com",
      posts: wxr.posts.map((p) => ({
        slug: p.slug,
        title: p.title,
        date: p.date,
        categories: [],
      })),
      categories: [],
      hasYoastSeo: schema.hasYoastSeo,
      hasAcfFields: schema.acfFields.length > 0,
      mediaDomains: ["example.com"],
      wpPermalinkStructure: null,
    });

    const postPage = scaffold.find((f) => f.path.includes("[slug]/page.tsx"));
    expect(postPage).toBeDefined();
    expect(postPage!.content).toContain("generateMetadata");
    expect(postPage!.content).toContain("getAcfFields");
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `npx vitest run packages/analyzer/tests/integration-wxr-blog.test.ts`
Expected: All 2 tests PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (217 existing + ~50 new ≈ 267+)

- [ ] **Step 4: Run typecheck**

Run: `pnpm -r typecheck`
Expected: All packages pass

- [ ] **Step 5: Commit**

```bash
git add packages/analyzer/tests/integration-wxr-blog.test.ts
git commit -m "test(analyzer): add integration test for full WXR → blog scaffold pipeline

Verifies end-to-end flow: WXR parse → Gutenberg convert → schema
analyze → blog scaffold → verify scaffold. Tests both Gutenberg
content and ACF/Yoast metadata paths."
```

---

## Task 9: Update HANDOFF.md and Close Relevant Issues

**Files:**
- Modify: `docs/HANDOFF.md`

### Purpose

Mark C1-C5 as complete in the handoff document. Update test count and version notes.

- [ ] **Step 1: Update HANDOFF.md**

Change the C-phase items from `- [ ]` to `- [x]` and update the test count at the top:

```
**テスト:** 267+ / 267+ 全パス  (update to actual count)
```

Mark completed:
```
- [x] C1: Gutenberg → Portable Text → React変換 (WXRブログサイト向け)
- [x] C2: Yoast SEOメタデータ移行テンプレート
- [x] C3: ACFスキーマ移行テンプレート
- [x] C4: Next.js scaffold生成 (WXR版)
- [x] C5: Verify最小版 (Playwright)
```

- [ ] **Step 2: Commit**

```bash
git add docs/HANDOFF.md
git commit -m "docs: mark C-phase MVP tasks as complete"
```

---

## Summary

| Task | Module | Tests | Description |
|------|--------|-------|-------------|
| 1 | gutenberg-parser | ~9 | Parse block comments → GutenbergBlock[] |
| 2 | block-converter | ~14 | GutenbergBlock[] → WptContentBlock[] |
| 3 | yoast-extractor | ~10 | Extract Yoast meta → Next.js Metadata |
| 4 | acf-template-generator | ~7 | AcfFieldInfo[] → Zod schema + accessor |
| 5 | blog-scaffold-generator | ~12 | Full Next.js blog scaffold from WXR |
| 6 | verify-generator | ~6 | Playwright smoke test scaffold |
| 7 | Wire up | 0 (typecheck) | Export + CLI integration |
| 8 | Integration test | ~2 | Full pipeline E2E |
| 9 | Documentation | 0 | HANDOFF update |

**Total new tests: ~60**
**Estimated execution: 9 tasks, each with TDD cycle**
