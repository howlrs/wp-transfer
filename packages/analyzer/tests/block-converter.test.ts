import { describe, it, expect } from "vitest";
import { convertBlocksToPortableText } from "../src/block-converter.js";
import type { GutenbergBlock } from "../src/gutenberg-parser.js";
import type {
  WptPortableTextBlock,
  WptImageBlock,
  WptCodeBlock,
  WptEmbedBlock,
  WptHtmlBlock,
  WptReferenceBlock,
} from "@wp-transfer/core";

function block(name: string, innerHTML: string, attributes: Record<string, unknown> = {}): GutenbergBlock {
  return { name, attributes, innerHTML };
}

describe("convertBlocksToPortableText", () => {
  it("converts paragraph with bold/italic inline marks", () => {
    const blocks = convertBlocksToPortableText([
      block("paragraph", "<p>Hello <strong>bold</strong> and <em>italic</em> world</p>"),
    ]);
    expect(blocks).toHaveLength(1);
    const b = blocks[0] as WptPortableTextBlock;
    expect(b._type).toBe("block");
    expect(b.style).toBe("normal");
    expect(b.children.length).toBeGreaterThanOrEqual(4);

    const texts = b.children.map((c) => c.text);
    expect(texts.join("")).toBe("Hello bold and italic world");

    const boldSpan = b.children.find((c) => c.text === "bold");
    expect(boldSpan?.marks).toContain("strong");

    const italicSpan = b.children.find((c) => c.text === "italic");
    expect(italicSpan?.marks).toContain("em");
  });

  it("converts heading with level attribute to style", () => {
    const blocks = convertBlocksToPortableText([
      block("heading", '<h3 class="wp-block-heading">My Heading</h3>', { level: 3 }),
    ]);
    expect(blocks).toHaveLength(1);
    const b = blocks[0] as WptPortableTextBlock;
    expect(b._type).toBe("block");
    expect(b.style).toBe("h3");
    const text = b.children.map((c) => c.text).join("");
    expect(text).toBe("My Heading");
  });

  it("converts unordered list to multiple PT blocks with listItem=bullet", () => {
    const blocks = convertBlocksToPortableText([
      block("list", "<ul><li>Apple</li><li>Banana</li><li>Cherry</li></ul>"),
    ]);
    expect(blocks).toHaveLength(3);
    for (const b of blocks) {
      const ptb = b as WptPortableTextBlock;
      expect(ptb._type).toBe("block");
      expect(ptb.listItem).toBe("bullet");
      expect(ptb.level).toBe(1);
      expect(ptb.style).toBe("normal");
    }
    expect((blocks[0] as WptPortableTextBlock).children[0]!.text).toBe("Apple");
    expect((blocks[1] as WptPortableTextBlock).children[0]!.text).toBe("Banana");
    expect((blocks[2] as WptPortableTextBlock).children[0]!.text).toBe("Cherry");
  });

  it("converts ordered list to listItem=number", () => {
    const blocks = convertBlocksToPortableText([
      block("list", "<ol><li>First</li><li>Second</li></ol>", { ordered: true }),
    ]);
    expect(blocks).toHaveLength(2);
    for (const b of blocks) {
      const ptb = b as WptPortableTextBlock;
      expect(ptb.listItem).toBe("number");
      expect(ptb.level).toBe(1);
    }
    expect((blocks[0] as WptPortableTextBlock).children[0]!.text).toBe("First");
    expect((blocks[1] as WptPortableTextBlock).children[0]!.text).toBe("Second");
  });

  it("converts image to WptImageBlock with src, alt, caption", () => {
    const blocks = convertBlocksToPortableText([
      block(
        "image",
        '<figure class="wp-block-image"><img src="https://example.com/photo.jpg" alt="A photo"/><figcaption>Photo caption</figcaption></figure>',
        { id: 10, sizeSlug: "large" },
      ),
    ]);
    expect(blocks).toHaveLength(1);
    const b = blocks[0] as WptImageBlock;
    expect(b._type).toBe("image");
    expect(b.src).toBe("https://example.com/photo.jpg");
    expect(b.alt).toBe("A photo");
    expect(b.caption).toBe("Photo caption");
  });

  it("converts code block to WptCodeBlock", () => {
    const blocks = convertBlocksToPortableText([
      block("code", '<pre class="wp-block-code"><code>const x = 42;</code></pre>'),
    ]);
    expect(blocks).toHaveLength(1);
    const b = blocks[0] as WptCodeBlock;
    expect(b._type).toBe("code");
    expect(b.code).toBe("const x = 42;");
  });

  it("converts embed to WptEmbedBlock with url and provider", () => {
    const blocks = convertBlocksToPortableText([
      block(
        "embed",
        '<figure class="wp-block-embed"><div class="wp-block-embed__wrapper">https://www.youtube.com/watch?v=123</div></figure>',
        { url: "https://www.youtube.com/watch?v=123", providerNameSlug: "youtube" },
      ),
    ]);
    expect(blocks).toHaveLength(1);
    const b = blocks[0] as WptEmbedBlock;
    expect(b._type).toBe("embed");
    expect(b.url).toBe("https://www.youtube.com/watch?v=123");
    expect(b.provider).toBe("youtube");
  });

  it("converts quote to blockquote style", () => {
    const blocks = convertBlocksToPortableText([
      block("quote", '<blockquote class="wp-block-quote"><p>To be or not to be.</p></blockquote>'),
    ]);
    expect(blocks).toHaveLength(1);
    const b = blocks[0] as WptPortableTextBlock;
    expect(b._type).toBe("block");
    expect(b.style).toBe("blockquote");
    const text = b.children.map((c) => c.text).join("");
    expect(text).toBe("To be or not to be.");
  });

  it("converts separator to separator style with empty children", () => {
    const blocks = convertBlocksToPortableText([
      block("separator", "", { className: "is-style-wide" }),
    ]);
    expect(blocks).toHaveLength(1);
    const b = blocks[0] as WptPortableTextBlock;
    expect(b._type).toBe("block");
    expect(b.style).toBe("separator");
    expect(b.children).toHaveLength(1);
    expect(b.children[0]!.text).toBe("");
  });

  it("falls back to htmlBlock for unknown blocks with originalBlockName", () => {
    const blocks = convertBlocksToPortableText([
      block("my-plugin/fancy-widget", "<div>Custom content</div>"),
    ]);
    expect(blocks).toHaveLength(1);
    const b = blocks[0] as WptHtmlBlock;
    expect(b._type).toBe("htmlBlock");
    expect(b.html).toBe("<div>Custom content</div>");
    expect(b.originalBlockName).toBe("my-plugin/fancy-widget");
  });

  it("converts table to htmlBlock", () => {
    const html = '<figure class="wp-block-table"><table><thead><tr><th>Name</th></tr></thead></table></figure>';
    const blocks = convertBlocksToPortableText([block("table", html)]);
    expect(blocks).toHaveLength(1);
    const b = blocks[0] as WptHtmlBlock;
    expect(b._type).toBe("htmlBlock");
    expect(b.html).toBe(html);
    expect(b.originalBlockName).toBe("table");
  });

  it("converts freeform to htmlBlock", () => {
    const html = "<p>Classic editor content</p><p>Second paragraph</p>";
    const blocks = convertBlocksToPortableText([block("freeform", html)]);
    expect(blocks).toHaveLength(1);
    const b = blocks[0] as WptHtmlBlock;
    expect(b._type).toBe("htmlBlock");
    expect(b.html).toBe(html);
    expect(b.originalBlockName).toBe("freeform");
  });

  it("generates unique _key for every block and span", () => {
    const blocks = convertBlocksToPortableText([
      block("paragraph", "<p>Hello <strong>world</strong></p>"),
      block("paragraph", "<p>Second paragraph</p>"),
      block("heading", "<h2>Title</h2>", { level: 2 }),
    ]);
    const keys = new Set<string>();
    for (const b of blocks) {
      expect(b._key).toBeTruthy();
      keys.add(b._key);
      if ("children" in b && Array.isArray(b.children)) {
        for (const child of b.children) {
          if ("_key" in child && child._key) {
            keys.add(child._key);
          }
        }
      }
    }
    // All keys should be unique (set size equals total count)
    const allKeys: string[] = [];
    for (const b of blocks) {
      allKeys.push(b._key);
      if ("children" in b && Array.isArray(b.children)) {
        for (const child of b.children) {
          if ("_key" in child && child._key) {
            allKeys.push(child._key);
          }
        }
      }
    }
    expect(keys.size).toBe(allKeys.length);
  });

  it("converts paragraph with link markup to markDef + mark reference", () => {
    const blocks = convertBlocksToPortableText([
      block("paragraph", '<p>Visit <a href="https://example.com">Example</a> today</p>'),
    ]);
    expect(blocks).toHaveLength(1);
    const b = blocks[0] as WptPortableTextBlock;
    expect(b.markDefs).toBeDefined();
    expect(b.markDefs!.length).toBe(1);
    const def = b.markDefs![0]!;
    expect(def._type).toBe("link");
    expect(def.href).toBe("https://example.com");

    const linkSpan = b.children.find((c) => c.text === "Example");
    expect(linkSpan).toBeDefined();
    expect(linkSpan!.marks).toContain(def._key);

    const afterLink = b.children.find((c) => "text" in c && c.text.includes("today"));
    expect(afterLink).toBeDefined();
    expect(afterLink!.marks).toEqual([]); // No link mark on trailing text
  });

  it("handles paragraph with <b> and <i> tags same as strong/em", () => {
    const blocks = convertBlocksToPortableText([
      block("paragraph", "<p><b>bold</b> and <i>italic</i></p>"),
    ]);
    const b = blocks[0] as WptPortableTextBlock;
    const boldSpan = b.children.find((c) => c.text === "bold");
    expect(boldSpan?.marks).toContain("strong");
    const italicSpan = b.children.find((c) => c.text === "italic");
    expect(italicSpan?.marks).toContain("em");
  });

  it("handles inline <code> mark in paragraphs", () => {
    const blocks = convertBlocksToPortableText([
      block("paragraph", "<p>Use the <code>map()</code> function</p>"),
    ]);
    const b = blocks[0] as WptPortableTextBlock;
    const codeSpan = b.children.find((c) => c.text === "map()");
    expect(codeSpan?.marks).toContain("code");
  });

  it("returns empty array for empty input", () => {
    expect(convertBlocksToPortableText([])).toEqual([]);
  });

  it("handles image without figcaption", () => {
    const blocks = convertBlocksToPortableText([
      block("image", '<figure><img src="https://example.com/pic.png" alt="Pic"/></figure>'),
    ]);
    const b = blocks[0] as WptImageBlock;
    expect(b.src).toBe("https://example.com/pic.png");
    expect(b.alt).toBe("Pic");
    expect(b.caption).toBeUndefined();
  });

  it("handles heading default level 2 when no level attribute", () => {
    const blocks = convertBlocksToPortableText([
      block("heading", "<h2>Default Heading</h2>"),
    ]);
    const b = blocks[0] as WptPortableTextBlock;
    expect(b.style).toBe("h2");
  });

  it("normalizes core/ namespace prefix", () => {
    const blocks = [block("core/paragraph", "<p>Namespaced</p>")];
    const result = convertBlocksToPortableText(blocks);
    expect(result).toHaveLength(1);
    expect((result[0] as any)._type).toBe("block");
    expect((result[0] as any).style).toBe("normal");
  });

  it("rejects javascript: protocol in image src", () => {
    const blocks = [block("image", '<figure><img src="javascript:alert(1)" alt="xss" /></figure>')];
    const result = convertBlocksToPortableText(blocks);
    const img = result[0] as any;
    expect(img._type).toBe("image");
    expect(img.src).toBe(""); // Rejected
  });

  it("rejects data: protocol in embed url", () => {
    const blocks = [block("embed", '<figure></figure>', { url: "data:text/html,<script>alert(1)</script>" })];
    const result = convertBlocksToPortableText(blocks);
    const embed = result[0] as any;
    expect(embed._type).toBe("embed");
    expect(embed.url).toBe(""); // Rejected
  });

  it("allows https URLs in image src", () => {
    const blocks = [block("image", '<figure><img src="https://example.com/photo.jpg" alt="Photo" /></figure>')];
    const result = convertBlocksToPortableText(blocks);
    const img = result[0] as any;
    expect(img.src).toBe("https://example.com/photo.jpg");
  });

  // Task 10: HTML entity decoding
  it("decodes numeric HTML entities (decimal and hex)", () => {
    const blocks = convertBlocksToPortableText([
      block("paragraph", "<p>Smart &#8220;quotes&#8221; and em&#8212;dash</p>"),
    ]);
    const b = blocks[0] as WptPortableTextBlock;
    const text = b.children.map((c) => c.text).join("");
    expect(text).toBe('Smart \u201Cquotes\u201D and em\u2014dash');
  });

  it("decodes hex HTML entities", () => {
    const blocks = convertBlocksToPortableText([
      block("paragraph", "<p>&#x2603; snowman &#x2764; heart</p>"),
    ]);
    const b = blocks[0] as WptPortableTextBlock;
    const text = b.children.map((c) => c.text).join("");
    expect(text).toBe('\u2603 snowman \u2764 heart');
  });

  it("decodes named HTML entities beyond the basic 5", () => {
    const blocks = convertBlocksToPortableText([
      block("paragraph", "<p>Hello&nbsp;world &mdash; &copy; 2024 &hellip;</p>"),
    ]);
    const b = blocks[0] as WptPortableTextBlock;
    const text = b.children.map((c) => c.text).join("");
    expect(text).toBe('Hello\u00A0world \u2014 \u00A9 2024 \u2026');
  });

  it("preserves unknown named entities as-is", () => {
    const blocks = convertBlocksToPortableText([
      block("paragraph", "<p>Unknown &foobar; entity</p>"),
    ]);
    const b = blocks[0] as WptPortableTextBlock;
    const text = b.children.map((c) => c.text).join("");
    expect(text).toBe("Unknown &foobar; entity");
  });

  // Task 11: <br> tags
  it("converts <br> tags to newline spans", () => {
    const blocks = convertBlocksToPortableText([
      block("paragraph", "<p>Line one<br>Line two<br/>Line three<br />Line four</p>"),
    ]);
    const b = blocks[0] as WptPortableTextBlock;
    const text = b.children.map((c) => c.text).join("");
    expect(text).toBe("Line one\nLine two\nLine three\nLine four");
  });

  // Task 12: Nested lists
  it("converts nested unordered list with level tracking", () => {
    const html = `<ul>
      <li>Parent 1
        <ul>
          <li>Child 1.1</li>
          <li>Child 1.2</li>
        </ul>
      </li>
      <li>Parent 2</li>
    </ul>`;
    const blocks = convertBlocksToPortableText([block("list", html)]);
    expect(blocks.length).toBe(4);
    expect((blocks[0] as any).level).toBe(1);
    expect((blocks[0] as any).children[0].text).toContain("Parent 1");
    expect((blocks[1] as any).level).toBe(2);
    expect((blocks[1] as any).children[0].text).toContain("Child 1.1");
    expect((blocks[2] as any).level).toBe(2);
    expect((blocks[2] as any).children[0].text).toContain("Child 1.2");
    expect((blocks[3] as any).level).toBe(1);
    expect((blocks[3] as any).children[0].text).toContain("Parent 2");
  });

  it("converts nested ordered list preserving listItem type per level", () => {
    const html = `<ol>
      <li>First
        <ul>
          <li>Nested bullet</li>
        </ul>
      </li>
      <li>Second</li>
    </ol>`;
    const blocks = convertBlocksToPortableText([
      block("list", html, { ordered: true }),
    ]);
    expect(blocks.length).toBe(3);
    expect((blocks[0] as any).listItem).toBe("number");
    expect((blocks[0] as any).level).toBe(1);
    expect((blocks[1] as any).listItem).toBe("bullet");
    expect((blocks[1] as any).level).toBe(2);
    expect((blocks[2] as any).listItem).toBe("number");
    expect((blocks[2] as any).level).toBe(1);
  });

  // Task 13: Group blocks
  it("recursively expands group blocks", () => {
    const groupInnerHtml =
      '<!-- wp:paragraph --><p>Inside group</p><!-- /wp:paragraph -->' +
      '<!-- wp:heading {"level":3} --><h3>Group heading</h3><!-- /wp:heading -->';
    const blocks = convertBlocksToPortableText([
      block("group", groupInnerHtml),
    ]);
    expect(blocks.length).toBe(2);
    expect((blocks[0] as any)._type).toBe("block");
    expect((blocks[0] as any).style).toBe("normal");
    expect((blocks[0] as any).children[0].text).toBe("Inside group");
    expect((blocks[1] as any)._type).toBe("block");
    expect((blocks[1] as any).style).toBe("h3");
  });

  // Task 14: Reusable blocks
  it("converts reusable block (wp:block) to referenceBlock with ref", () => {
    const blocks = convertBlocksToPortableText([
      block("block", "", { ref: 42 }),
    ]);
    expect(blocks).toHaveLength(1);
    const b = blocks[0] as any;
    expect(b._type).toBe("referenceBlock");
    expect(b.ref).toBe(42);
  });
});
