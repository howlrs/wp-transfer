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

// Matches the start of an opening/self-closing comment up to the block name.
// Attribute extraction uses brace-balanced parsing instead of regex to handle
// nested JSON (e.g. WordPress 5.9+ Global Styles).
const BLOCK_OPEN_PREFIX_RE =
  /<!--\s+wp:([\w-]+(?:\/[\w-]+)?)\s*/g;
const BLOCK_CLOSE_RE = /<!--\s+\/wp:([\w-]+(?:\/[\w-]+)?)\s*-->/g;

/**
 * Starting from `pos` in `str`, if the character is `{`, walk forward counting
 * braces until balanced and return the JSON substring. Handles nested objects.
 * Returns `undefined` if `str[pos]` is not `{` or braces never balance.
 */
function extractBraceBalanced(str: string, pos: number): string | undefined {
  if (pos >= str.length || str[pos] !== "{") return undefined;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = pos; i < str.length; i++) {
    const ch = str[i]!;
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return str.slice(pos, i + 1);
    }
  }
  return undefined;
}

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
  BLOCK_OPEN_PREFIX_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BLOCK_OPEN_PREFIX_RE.exec(html)) !== null) {
    const name = m[1]!;
    let cursor = m.index + m[0].length;

    // Try brace-balanced JSON extraction
    const jsonStr = extractBraceBalanced(html, cursor);
    if (jsonStr !== undefined) cursor += jsonStr.length;
    const attrs = tryParseJson(jsonStr);

    // Skip optional whitespace then check for self-closing `/` before `-->`
    while (cursor < html.length && (html[cursor] === " " || html[cursor] === "\t" || html[cursor] === "\n" || html[cursor] === "\r")) cursor++;
    const selfClosing = html[cursor] === "/";
    if (selfClosing) cursor++;

    // Must end with `-->`
    if (html.slice(cursor, cursor + 3) !== "-->") continue;
    cursor += 3;

    const length = cursor - m.index;
    tokens.push(
      selfClosing
        ? { type: "self-closing", name, attrs, index: m.index, length }
        : { type: "open", name, attrs, index: m.index, length },
    );

    // Advance the regex past the full comment we just consumed
    BLOCK_OPEN_PREFIX_RE.lastIndex = cursor;
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
