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
  WptReferenceBlock,
} from "@wp-transfer/core";
import type { GutenbergBlock } from "./gutenberg-parser.js";
import { parseGutenbergBlocks } from "./gutenberg-parser.js";
import { sanitizeUrl } from "./sanitize.js";
import { parse as parseHtml, type HTMLElement as NhpElement } from "node-html-parser";

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
  const TAG_RE = /<\/?(?:strong|b|em|i|code|a|br)(?:\s[^>]*)?\s*\/?>/gi;
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

    // Handle <br>, <br/>, <br /> as newline
    if (/^<br\s*\/?>/i.test(tag)) {
      children.push({ _type: "span", _key: makeKey(), text: "\n", marks: [...markStack] });
      continue;
    }

    const isClosing = tag.startsWith("</");

    if (isClosing) {
      const tagName = extractTagName(tag);
      if (tagName === "a") {
        // Link marks push defKey, not "a" — find and remove the last defKey
        for (let i = markStack.length - 1; i >= 0; i--) {
          if (markDefs.some((d) => d._key === markStack[i])) {
            markStack.splice(i, 1);
            break;
          }
        }
      } else {
        // Normal marks use the mark name directly
        const markName = tagToMark(tagName);
        for (let i = markStack.length - 1; i >= 0; i--) {
          if (markStack[i] === markName) {
            markStack.splice(i, 1);
            break;
          }
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

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'",
  nbsp: "\u00A0", mdash: "\u2014", ndash: "\u2013",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201C", rdquo: "\u201D",
  hellip: "\u2026", copy: "\u00A9", reg: "\u00AE", trade: "\u2122",
  times: "\u00D7", divide: "\u00F7", bull: "\u2022", middot: "\u00B7",
  ensp: "\u2002", emsp: "\u2003", thinsp: "\u2009", zwj: "\u200D", zwnj: "\u200C",
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (match, entity: string) => {
    // Numeric decimal: &#8220;
    if (entity.startsWith("#") && !entity.startsWith("#x")) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    // Numeric hex: &#x2603;
    if (entity.startsWith("#x")) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    // Named entity
    return NAMED_ENTITIES[entity] ?? match;
  });
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

interface ListItemInfo {
  html: string;
  level: number;
  listType: "bullet" | "number";
}

function extractListItemsNested(html: string, parentListType: "bullet" | "number"): ListItemInfo[] {
  const root = parseHtml(html);
  const items: ListItemInfo[] = [];

  function walk(node: NhpElement, level: number, listType: "bullet" | "number"): void {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue; // skip text nodes
      const el = child as NhpElement;
      const tag = el.tagName?.toUpperCase();

      if (tag === "LI") {
        // Collect direct text content (exclude nested lists)
        let directHtml = "";
        for (const liChild of el.childNodes) {
          const liChildEl = liChild as NhpElement;
          const childTag = liChildEl.tagName?.toUpperCase();
          if (childTag === "UL" || childTag === "OL") continue;
          directHtml += liChildEl.outerHTML ?? liChildEl.text ?? "";
        }
        items.push({ html: directHtml.trim(), level, listType });

        // Recurse into nested lists
        for (const liChild of el.childNodes) {
          const liChildEl = liChild as NhpElement;
          const childTag = liChildEl.tagName?.toUpperCase();
          if (childTag === "UL") {
            walk(liChildEl, level + 1, "bullet");
          } else if (childTag === "OL") {
            walk(liChildEl, level + 1, "number");
          }
        }
      } else if (tag === "UL" || tag === "OL") {
        const nestedType = tag === "OL" ? "number" : "bullet";
        walk(el, level, nestedType);
      }
    }
  }

  walk(root, 1, parentListType);
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
  const parentListType = ordered ? "number" : "bullet";
  const items = extractListItemsNested(gb.innerHTML, parentListType);

  return items.map((item) => {
    const { children, markDefs } = parseInlineHtml(item.html);
    return {
      _type: "block" as const,
      _key: makeKey(),
      style: "normal",
      listItem: item.listType,
      level: item.level,
      children,
      markDefs,
    };
  });
}

function convertImage(gb: GutenbergBlock): WptImageBlock {
  const { src, alt } = extractImgAttrs(gb.innerHTML);
  const safeSrc = sanitizeUrl(src);
  const caption = extractCaption(gb.innerHTML);
  return {
    _type: "image",
    _key: makeKey(),
    src: safeSrc,
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
  const safeUrl = sanitizeUrl(url);
  const provider = typeof gb.attributes.providerNameSlug === "string" ? gb.attributes.providerNameSlug : undefined;
  return {
    _type: "embed",
    _key: makeKey(),
    url: safeUrl,
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

function convertGroup(gb: GutenbergBlock): WptContentBlock[] {
  const innerBlocks = parseGutenbergBlocks(gb.innerHTML);
  return convertBlocksToPortableText(innerBlocks);
}

function convertReusableBlock(gb: GutenbergBlock): WptReferenceBlock {
  const ref = typeof gb.attributes.ref === "number" ? gb.attributes.ref : 0;
  return {
    _type: "referenceBlock",
    _key: makeKey(),
    ref,
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
      case "block":
        result.push(convertReusableBlock(gb));
        break;
      case "group":
        result.push(...convertGroup(gb));
        break;
      default:
        result.push(convertToHtmlBlock(gb));
        break;
    }
  }

  return result;
}
