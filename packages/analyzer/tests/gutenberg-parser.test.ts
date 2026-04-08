import { describe, it, expect } from "vitest";
import { parseGutenbergBlocks } from "../src/gutenberg-parser.js";

describe("parseGutenbergBlocks", () => {
  it("parses a single paragraph block", () => {
    const html = `<!-- wp:paragraph -->
<p>Hello world</p>
<!-- /wp:paragraph -->`;
    const blocks = parseGutenbergBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("paragraph");
    expect(blocks[0]!.attributes).toEqual({});
    expect(blocks[0]!.innerHTML).toBe("\n<p>Hello world</p>\n");
  });

  it("parses a block with JSON attributes (heading with level)", () => {
    const html = `<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">A Heading</h2>
<!-- /wp:heading -->`;
    const blocks = parseGutenbergBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("heading");
    expect(blocks[0]!.attributes).toEqual({ level: 2 });
    expect(blocks[0]!.innerHTML).toContain("<h2");
  });

  it("parses a self-closing block (separator)", () => {
    const html = `<!-- wp:separator {"className":"is-style-wide"} /-->`;
    const blocks = parseGutenbergBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("separator");
    expect(blocks[0]!.attributes).toEqual({ className: "is-style-wide" });
    expect(blocks[0]!.innerHTML).toBe("");
  });

  it("parses a self-closing block without attributes", () => {
    const html = `<!-- wp:separator /-->`;
    const blocks = parseGutenbergBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("separator");
    expect(blocks[0]!.attributes).toEqual({});
    expect(blocks[0]!.innerHTML).toBe("");
  });

  it("parses an image block with nested attributes", () => {
    const html = `<!-- wp:image {"id":10,"sizeSlug":"large"} -->
<figure class="wp-block-image size-large"><img src="https://example.com/photo.jpg" alt="A photo" class="wp-image-10"/><figcaption class="wp-element-caption">Photo caption</figcaption></figure>
<!-- /wp:image -->`;
    const blocks = parseGutenbergBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("image");
    expect(blocks[0]!.attributes).toEqual({ id: 10, sizeSlug: "large" });
    expect(blocks[0]!.innerHTML).toContain("photo.jpg");
  });

  it("parses an embed block with provider info", () => {
    const html = `<!-- wp:embed {"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","type":"video","providerNameSlug":"youtube"} -->
<figure class="wp-block-embed is-type-video is-provider-youtube"><div class="wp-block-embed__wrapper">https://www.youtube.com/watch?v=dQw4w9WgXcQ</div></figure>
<!-- /wp:embed -->`;
    const blocks = parseGutenbergBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("embed");
    expect(blocks[0]!.attributes).toEqual({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      type: "video",
      providerNameSlug: "youtube",
    });
  });

  it("parses multiple blocks in sequence", () => {
    const html = `<!-- wp:paragraph -->
<p>First</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>Second</h3>
<!-- /wp:heading -->

<!-- wp:separator /-->

<!-- wp:paragraph -->
<p>Third</p>
<!-- /wp:paragraph -->`;
    const blocks = parseGutenbergBlocks(html);
    expect(blocks).toHaveLength(4);
    expect(blocks[0]!.name).toBe("paragraph");
    expect(blocks[1]!.name).toBe("heading");
    expect(blocks[1]!.attributes).toEqual({ level: 3 });
    expect(blocks[2]!.name).toBe("separator");
    expect(blocks[2]!.innerHTML).toBe("");
    expect(blocks[3]!.name).toBe("paragraph");
  });

  it("parses namespaced block names (core/paragraph)", () => {
    const html = `<!-- wp:core/paragraph -->
<p>Namespaced</p>
<!-- /wp:core/paragraph -->`;
    const blocks = parseGutenbergBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("core/paragraph");
  });

  it("returns freeform block for classic editor content (no block comments)", () => {
    const html = `<p>This is classic editor content.</p>
<p>No block comments here.</p>`;
    const blocks = parseGutenbergBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("freeform");
    expect(blocks[0]!.attributes).toEqual({});
    expect(blocks[0]!.innerHTML).toBe(html);
  });

  it("returns empty array for empty content", () => {
    expect(parseGutenbergBlocks("")).toEqual([]);
    expect(parseGutenbergBlocks("   ")).toEqual([]);
    expect(parseGutenbergBlocks("\n\n")).toEqual([]);
  });

  it("recovers valid blocks from malformed content", () => {
    const html = `<!-- wp:paragraph -->
<p>Good block</p>
<!-- /wp:paragraph -->

<!-- wp:broken {invalid json} -->
<p>Bad block</p>
<!-- /wp:broken -->

<!-- wp:heading {"level":2} -->
<h2>Also good</h2>
<!-- /wp:heading -->`;
    const blocks = parseGutenbergBlocks(html);
    // Should recover the valid blocks; the broken one may be skipped or have empty attrs
    const names = blocks.map((b) => b.name);
    expect(names).toContain("paragraph");
    expect(names).toContain("heading");
  });

  it("parses nested JSON attributes (Global Styles)", () => {
    const html = `<!-- wp:columns {"style":{"spacing":{"padding":{"top":"20px"}}}} -->
<div class="wp-block-columns">content</div>
<!-- /wp:columns -->`;

    const blocks = parseGutenbergBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("columns");
    expect(blocks[0]!.attributes).toEqual({
      style: { spacing: { padding: { top: "20px" } } },
    });
  });

  it("recovers valid blocks when a block has no closing comment", () => {
    const html = `<!-- wp:paragraph -->
<p>Good block</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>No closing comment for this heading</h2>

<!-- wp:paragraph -->
<p>Another good block</p>
<!-- /wp:paragraph -->`;

    const blocks = parseGutenbergBlocks(html);
    // The unclosed heading should be skipped; both paragraphs recovered
    const names = blocks.map((b) => b.name);
    expect(names).toContain("paragraph");
    expect(names).not.toContain("heading");
    expect(blocks.filter((b) => b.name === "paragraph")).toHaveLength(2);
  });

  it("parses quote block", () => {
    const html = `<!-- wp:quote -->
<blockquote class="wp-block-quote"><p>To be or not to be.</p><cite>Shakespeare</cite></blockquote>
<!-- /wp:quote -->`;
    const blocks = parseGutenbergBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("quote");
    expect(blocks[0]!.innerHTML).toContain("To be or not to be");
  });

  it("parses ordered list block with attributes", () => {
    const html = `<!-- wp:list {"ordered":true} -->
<ol class="wp-block-list"><li>First</li><li>Second</li></ol>
<!-- /wp:list -->`;
    const blocks = parseGutenbergBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("list");
    expect(blocks[0]!.attributes).toEqual({ ordered: true });
  });

  it("parses table block", () => {
    const html = `<!-- wp:table -->
<figure class="wp-block-table"><table><thead><tr><th>Name</th></tr></thead></table></figure>
<!-- /wp:table -->`;
    const blocks = parseGutenbergBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("table");
  });
});
