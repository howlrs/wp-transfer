import { describe, it, expect } from "vitest";
import { convertBlocksToPortableText } from "../src/block-converter.js";
import type { GutenbergBlock } from "../src/gutenberg-parser.js";
import type {
  WptPortableTextBlock,
  WptImageBlock,
  WptCodeBlock,
  WptEmbedBlock,
  WptHtmlBlock,
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
});
