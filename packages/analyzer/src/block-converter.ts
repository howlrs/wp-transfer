/**
 * Gutenberg block to Portable Text converter.
 *
 * Converts GutenbergBlock[] into WptContentBlock[] (Portable Text).
 */

import type {
  WptContentBlock,
  WptPortableTextBlock,
  WptImageBlock,
  WptEmbedBlock,
  WptCodeBlock,
  WptHtmlBlock,
} from "@wp-transfer/core";
import type { GutenbergBlock } from "./gutenberg-parser.js";

/** Minimal span shape compatible with PortableTextSpan. */
interface Span { _type: "span"; _key: string; text: string; marks: string[] }

/** Minimal mark definition shape compatible with PortableTextMarkDefinition. */
interface MarkDef { _type: string; _key: string; [key: string]: unknown }

let keyCounter = 0;

function makeKey(): string {
  return `k${Date.now().toString(36)}${(keyCounter++).toString(36)}`;
}

/** Strip the "core/" prefix if present; WordPress stores "core/paragraph" and "paragraph" interchangeably. */
function normalizeName(name: string): string {
  return name.startsWith("core/") ? name.slice(5) : name;
}

// ---- Inline HTML → PT spans ------------------------------------------------

interface ParsedInline {
  children: Span[];
  markDefs: MarkDef[];
}

/**
 * Very small regex-based inline HTML parser.
 * Handles <strong>, <b>, <em>, <i>, <code>, <a href="..."> and nested combinations.
 */
function parseInlineHtml(html: string): ParsedInline {
  const children: Span[] = [];
  const markDefs: MarkDef[] = [];

  // Active mark stack: each entry is the mark string to apply
  const markStack: string[] = [];

  // Tokenize: split into tags and text runs
  const TAG_RE = /<\/?(?:strong|b|em|i|code|a)(?:\s[^>]*)?\s*\/?>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TAG_RE.exec(html)) !== null) {
    // Text before this tag
    if (match.index > lastIndex) {
      const text = decodeHtmlEntities(html.slice(lastIndex, match.index));
      if (text) {
        children.push({ _type: "span", _key: makeKey(), text, marks: [...markStack] });
      }
    }
    lastIndex = match.index + match[0].length;

    const tag = match[0];
    const isClosing = tag.startsWith("</");

    if (isClosing) {
      // Pop the most recent matching mark
      const tagName = extractTagName(tag);
      const markName = tagToMark(tagName);
      // Remove the last occurrence of this mark from the stack
      for (let i = markStack.length - 1; i >= 0; i--) {
        if (markStack[i] === markName) {
          markStack.splice(i, 1);
          break;
        }
      }
    } else {
      const tagName = extractTagName(tag);
      if (tagName === "a") {
        const href = extractHref(tag);
        const defKey = makeKey();
        markDefs.push({ _type: "link", _key: defKey, href });
        markStack.push(defKey);
      } else {
        markStack.push(tagToMark(tagName));
      }
    }
  }

  // Remaining text after last tag
  if (lastIndex < html.length) {
    const text = decodeHtmlEntities(html.slice(lastIndex));
    if (text) {
      children.push({ _type: "span", _key: makeKey(), text, marks: [...markStack] });
    }
  }

  // If no children were produced, add an empty span
  if (children.length === 0) {
    children.push({ _type: "span", _key: makeKey(), text: "", marks: [] });
  }

  return { children, markDefs };
}

function extractTagName(tag: string): string {
  const m = /<\/?(\w+)/.exec(tag);
  return m ? m[1]!.toLowerCase() : "";
}

function tagToMark(tagName: string): string {
  switch (tagName) {
    case "strong":
    case "b":
      return "strong";
    case "em":
    case "i":
      return "em";
    case "code":
      return "code";
    default:
      return tagName;
  }
}

function extractHref(tag: string): string {
  const m = /href=["']([^"']*)["']/.exec(tag);
  return m ? m[1]! : "";
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// ---- Extract text from simple HTML wrappers ---------------------------------

/** Extract inner text from an HTML string, stripping all tags. */
function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ""));
}

/** Extract text content between <p>...</p> tags (first match). Returns innerHTML of first <p>. */
function extractParagraphContent(html: string): string {
  const m = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  return m ? m[1]! : stripTags(html);
}

/** Extract text content between <blockquote>...</blockquote>. Looks for inner <p> first. */
function extractQuoteContent(html: string): string {
  const bq = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i.exec(html);
  if (!bq) return stripTags(html);
  const inner = bq[1]!;
  // Try to find <p> inside blockquote
  const p = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(inner);
  return p ? p[1]! : stripTags(inner);
}

/** Extract heading text content. */
function extractHeadingContent(html: string): string {
  const m = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(html);
  return m ? m[1]! : stripTags(html);
}

/** Extract list items from <ul> or <ol>. */
function extractListItems(html: string): string[] {
  const items: string[] = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    items.push(m[1]!);
  }
  return items;
}

/** Extract src and alt from <img> tag. */
function extractImgAttrs(html: string): { src: string; alt?: string } {
  const srcM = /<img[^>]*\bsrc=["']([^"']*)["']/i.exec(html);
  const altM = /<img[^>]*\balt=["']([^"']*)["']/i.exec(html);
  return {
    src: srcM ? srcM[1]! : "",
    alt: altM && altM[1] ? altM[1] : undefined,
  };
}

/** Extract figcaption text. */
function extractCaption(html: string): string | undefined {
  const m = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(html);
  if (!m) return undefined;
  const text = stripTags(m[1]!).trim();
  return text || undefined;
}

/** Extract code text from <pre><code>...</code></pre>. */
function extractCode(html: string): string {
  const m = /<code[^>]*>([\s\S]*?)<\/code>/i.exec(html);
  return m ? decodeHtmlEntities(m[1]!) : stripTags(html);
}

// ---- Block converters -------------------------------------------------------

function convertParagraph(gb: GutenbergBlock): WptPortableTextBlock {
  const rawContent = extractParagraphContent(gb.innerHTML);
  const { children, markDefs } = parseInlineHtml(rawContent);
  return {
    _type: "block",
    _key: makeKey(),
    style: "normal",
    children,
    markDefs,
  };
}

function convertHeading(gb: GutenbergBlock): WptPortableTextBlock {
  const level = typeof gb.attributes.level === "number" ? gb.attributes.level : 2;
  const rawContent = extractHeadingContent(gb.innerHTML);
  const { children, markDefs } = parseInlineHtml(rawContent);
  return {
    _type: "block",
    _key: makeKey(),
    style: `h${level}`,
    children,
    markDefs,
  };
}

function convertList(gb: GutenbergBlock): WptPortableTextBlock[] {
  const ordered = gb.attributes.ordered === true;
  const listItem = ordered ? "number" : "bullet";
  const items = extractListItems(gb.innerHTML);

  return items.map((itemHtml) => {
    const { children, markDefs } = parseInlineHtml(itemHtml);
    return {
      _type: "block" as const,
      _key: makeKey(),
      style: "normal",
      listItem,
      level: 1,
      children,
      markDefs,
    };
  });
}

function convertImage(gb: GutenbergBlock): WptImageBlock {
  const { src, alt } = extractImgAttrs(gb.innerHTML);
  const caption = extractCaption(gb.innerHTML);
  return {
    _type: "image",
    _key: makeKey(),
    src,
    ...(alt !== undefined ? { alt } : {}),
    ...(caption !== undefined ? { caption } : {}),
  };
}

function convertCode(gb: GutenbergBlock): WptCodeBlock {
  const code = extractCode(gb.innerHTML);
  const language = typeof gb.attributes.language === "string" ? gb.attributes.language : undefined;
  return {
    _type: "code",
    _key: makeKey(),
    code,
    ...(language ? { language } : {}),
  };
}

function convertEmbed(gb: GutenbergBlock): WptEmbedBlock {
  const url = typeof gb.attributes.url === "string" ? gb.attributes.url : "";
  const provider = typeof gb.attributes.providerNameSlug === "string" ? gb.attributes.providerNameSlug : undefined;
  return {
    _type: "embed",
    _key: makeKey(),
    url,
    ...(provider ? { provider } : {}),
  };
}

function convertQuote(gb: GutenbergBlock): WptPortableTextBlock {
  const rawContent = extractQuoteContent(gb.innerHTML);
  const { children, markDefs } = parseInlineHtml(rawContent);
  return {
    _type: "block",
    _key: makeKey(),
    style: "blockquote",
    children,
    markDefs,
  };
}

function convertSeparator(): WptPortableTextBlock {
  return {
    _type: "block",
    _key: makeKey(),
    style: "separator",
    children: [{ _type: "span", _key: makeKey(), text: "", marks: [] }],
    markDefs: [],
  };
}

function convertToHtmlBlock(gb: GutenbergBlock): WptHtmlBlock {
  return {
    _type: "htmlBlock",
    _key: makeKey(),
    html: gb.innerHTML,
    originalBlockName: gb.name,
  };
}

// ---- Main entry point -------------------------------------------------------

export function convertBlocksToPortableText(blocks: GutenbergBlock[]): WptContentBlock[] {
  const result: WptContentBlock[] = [];

  for (const gb of blocks) {
    const name = normalizeName(gb.name);

    switch (name) {
      case "paragraph":
        result.push(convertParagraph(gb));
        break;
      case "heading":
        result.push(convertHeading(gb));
        break;
      case "list":
        result.push(...convertList(gb));
        break;
      case "image":
        result.push(convertImage(gb));
        break;
      case "code":
        result.push(convertCode(gb));
        break;
      case "embed":
        result.push(convertEmbed(gb));
        break;
      case "quote":
        result.push(convertQuote(gb));
        break;
      case "separator":
        result.push(convertSeparator());
        break;
      case "table":
      case "freeform":
        result.push(convertToHtmlBlock(gb));
        break;
      default:
        result.push(convertToHtmlBlock(gb));
        break;
    }
  }

  return result;
}
