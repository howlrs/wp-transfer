/**
 * Gutenberg block comment parser.
 *
 * Parses `<!-- wp:blockname {"attrs":...} -->...<!-- /wp:blockname -->`
 * from raw HTML into a structured block array.
 */

export interface GutenbergBlock {
  /** Block name without "wp:" prefix, e.g. "paragraph", "core/image" */
  name: string;
  /** Parsed JSON attributes from the opening comment */
  attributes: Record<string, unknown>;
  /** Raw HTML between opening and closing comments */
  innerHTML: string;
}

// Matches self-closing: <!-- wp:name {json} /-->
// Matches opening:      <!-- wp:name {json} -->
// Matches closing:      <!-- /wp:name -->
const BLOCK_OPEN_RE =
  /<!--\s+wp:([\w-]+(?:\/[\w-]+)?)\s*(\{[^}]*\})?\s*(\/)?-->/g;
const BLOCK_CLOSE_RE = /<!--\s+\/wp:([\w-]+(?:\/[\w-]+)?)\s*-->/g;

function tryParseJson(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Parse Gutenberg block comments from an HTML string.
 *
 * - Standard blocks:   `<!-- wp:name {json} -->innerHTML<!-- /wp:name -->`
 * - Self-closing:      `<!-- wp:name {json} /-->`
 * - Classic editor:    no block comments -> single freeform block
 * - Empty/whitespace:  returns `[]`
 */
export function parseGutenbergBlocks(html: string): GutenbergBlock[] {
  if (!html || !html.trim()) return [];

  // Quick check: any block comment present?
  if (!html.includes("<!-- wp:")) {
    return [{ name: "freeform", attributes: {}, innerHTML: html }];
  }

  const blocks: GutenbergBlock[] = [];

  // Build a flat list of all comment tokens with their positions
  type Token =
    | { type: "open"; name: string; attrs: Record<string, unknown>; index: number; length: number }
    | { type: "self-closing"; name: string; attrs: Record<string, unknown>; index: number; length: number }
    | { type: "close"; name: string; index: number; length: number };

  const tokens: Token[] = [];

  // Gather opening / self-closing tokens
  BLOCK_OPEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BLOCK_OPEN_RE.exec(html)) !== null) {
    const name = m[1]!;
    const attrs = tryParseJson(m[2]);
    const selfClosing = m[3] === "/";
    tokens.push(
      selfClosing
        ? { type: "self-closing", name, attrs, index: m.index, length: m[0].length }
        : { type: "open", name, attrs, index: m.index, length: m[0].length },
    );
  }

  // Gather closing tokens
  BLOCK_CLOSE_RE.lastIndex = 0;
  while ((m = BLOCK_CLOSE_RE.exec(html)) !== null) {
    tokens.push({ type: "close", name: m[1]!, index: m.index, length: m[0].length });
  }

  // Sort by position in the string
  tokens.sort((a, b) => a.index - b.index);

  // Walk tokens, matching opens to closes at the same depth
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;

    if (t.type === "self-closing") {
      blocks.push({ name: t.name, attributes: t.attrs, innerHTML: "" });
      i++;
      continue;
    }

    if (t.type === "open") {
      // Find matching close (skip nested opens/closes of the same name)
      let depth = 1;
      let j = i + 1;
      while (j < tokens.length && depth > 0) {
        const next = tokens[j]!;
        if (next.type === "open" && next.name === t.name) depth++;
        if (next.type === "close" && next.name === t.name) depth--;
        if (depth > 0) j++;
      }

      if (depth === 0 && j < tokens.length) {
        const closeToken = tokens[j]!;
        const innerStart = t.index + t.length;
        const innerEnd = closeToken.index;
        blocks.push({
          name: t.name,
          attributes: t.attrs,
          innerHTML: html.slice(innerStart, innerEnd),
        });
        i = j + 1;
      } else {
        // No matching close found -- skip this broken open
        i++;
      }
      continue;
    }

    // Orphan close token -- skip
    i++;
  }

  return blocks;
}
