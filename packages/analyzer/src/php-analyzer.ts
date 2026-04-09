/**
 * Simple PHP file analyzer using regex patterns.
 * Extracts database operations, input parameters, output behavior,
 * and detects common security issues (SQL injection) from PHP source files.
 */

// ── Types ──

export interface PhpVersionHint {
  minVersion: string;
  reason: string;
}

export interface PhpFileAnalysis {
  fileName: string;
  purpose: string;
  dbOperations: DbOperation[];
  inputParams: InputParam[];
  outputType: "redirect" | "echo" | "json" | "html" | "unknown";
  redirectTarget?: string;
  securityIssues: string[];
  phpVersionHints: PhpVersionHint[];
}

export interface DbOperation {
  type: "INSERT" | "UPDATE" | "DELETE" | "SELECT";
  table: string;
  columns: string[];
  inLoop: boolean;
}

export interface InputParam {
  name: string;
  source: "$_POST" | "$_GET" | "$_REQUEST" | "$_FILES";
  usage: string;
}

// ── Regex patterns ──

const POST_DOUBLE = /\$_POST\["([^"]+)"\]/g;
const POST_SINGLE = /\$_POST\['([^']+)'\]/g;
const GET_DOUBLE = /\$_GET\["([^"]+)"\]/g;
const GET_SINGLE = /\$_GET\['([^']+)'\]/g;
const REQUEST_DOUBLE = /\$_REQUEST\["([^"]+)"\]/g;
const REQUEST_SINGLE = /\$_REQUEST\['([^']+)'\]/g;
const FILES_DOUBLE = /\$_FILES\["([^"]+)"\]/g;
const FILES_SINGLE = /\$_FILES\['([^']+)'\]/g;

const INSERT_RE = /INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)/gi;
const UPDATE_RE = /UPDATE\s+(\w+)\s+SET\s+([\s\S]*?)(?:WHERE|;|$)/gi;
const DELETE_RE = /DELETE\s+FROM\s+(\w+)/gi;
const SELECT_RE = /SELECT\s+([\s\S]*?)\s+FROM\s+(\w+)/gi;

const REDIRECT_RE = /header\s*\(\s*['"]Location:\s*([^'"]+)['"]\s*\)/gi;
const ECHO_RE = /\becho\b/i;
const JSON_ENCODE_RE = /json_encode/i;

// SQL injection: user input directly interpolated in SQL strings
const SQL_INJECTION_RE = /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|SELECT)\b[\s\S]*?\$(?:_POST|_GET|_REQUEST)\s*\[/gi;

// ── Core functions ──

function extractInputParams(content: string): InputParam[] {
  const params = new Map<string, InputParam>();

  const sources: Array<{ re: RegExp; source: InputParam["source"] }> = [
    { re: POST_DOUBLE, source: "$_POST" },
    { re: POST_SINGLE, source: "$_POST" },
    { re: GET_DOUBLE, source: "$_GET" },
    { re: GET_SINGLE, source: "$_GET" },
    { re: REQUEST_DOUBLE, source: "$_REQUEST" },
    { re: REQUEST_SINGLE, source: "$_REQUEST" },
    { re: FILES_DOUBLE, source: "$_FILES" },
    { re: FILES_SINGLE, source: "$_FILES" },
  ];

  for (const { re, source } of sources) {
    for (const match of content.matchAll(re)) {
      const name = match[1]!;
      const key = `${source}:${name}`;
      if (!params.has(key)) {
        // Get the full line for usage context
        const lineStart = content.lastIndexOf("\n", match.index ?? 0) + 1;
        const lineEnd = content.indexOf("\n", match.index ?? 0);
        const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
        params.set(key, { name, source, usage: line });
      }
    }
  }

  return Array.from(params.values());
}

// ── Loop range detection ──

interface LoopRange {
  start: number;
  end: number;
}

function detectLoopRanges(content: string): LoopRange[] {
  const ranges: LoopRange[] = [];
  const foreachRe = /\b(?:foreach|for|while)\s*\(/g;

  for (const match of content.matchAll(foreachRe)) {
    const loopStart = match.index!;
    const braceStart = content.indexOf("{", loopStart);
    if (braceStart === -1) continue;

    let depth = 0;
    let end = -1;
    for (let i = braceStart; i < content.length; i++) {
      if (content[i] === "{") depth++;
      if (content[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end > braceStart) {
      ranges.push({ start: braceStart, end });
    }
  }
  return ranges;
}

function isInLoop(index: number, ranges: LoopRange[]): boolean {
  return ranges.some((r) => index >= r.start && index <= r.end);
}

function extractDbOperations(content: string): DbOperation[] {
  const ops: DbOperation[] = [];
  const loopRanges = detectLoopRanges(content);

  // INSERT INTO table(col1, col2, ...)
  for (const match of content.matchAll(INSERT_RE)) {
    const table = match[1]!;
    const colStr = match[2] ?? "";
    const columns = colStr
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    ops.push({ type: "INSERT", table, columns, inLoop: isInLoop(match.index!, loopRanges) });
  }

  // UPDATE table SET col1=val, col2=val WHERE ...
  for (const match of content.matchAll(UPDATE_RE)) {
    const table = match[1]!;
    const setClause = match[2] ?? "";
    const columns = setClause
      .split(",")
      .map((part) => {
        const eqIdx = part.indexOf("=");
        return eqIdx >= 0 ? part.slice(0, eqIdx).trim() : "";
      })
      .filter(Boolean);
    ops.push({ type: "UPDATE", table, columns, inLoop: isInLoop(match.index!, loopRanges) });
  }

  // DELETE FROM table
  for (const match of content.matchAll(DELETE_RE)) {
    ops.push({ type: "DELETE", table: match[1]!, columns: [], inLoop: isInLoop(match.index!, loopRanges) });
  }

  // SELECT cols FROM table
  for (const match of content.matchAll(SELECT_RE)) {
    const colStr = match[1]!.trim();
    const table = match[2]!;
    const columns =
      colStr === "*"
        ? ["*"]
        : colStr
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);
    ops.push({ type: "SELECT", table, columns, inLoop: isInLoop(match.index!, loopRanges) });
  }

  return ops;
}

function detectOutputType(
  content: string,
): Pick<PhpFileAnalysis, "outputType" | "redirectTarget"> {
  // Check redirect first (most specific)
  const redirectMatch = REDIRECT_RE.exec(content);
  if (redirectMatch) {
    return { outputType: "redirect", redirectTarget: redirectMatch[1] };
  }

  if (JSON_ENCODE_RE.test(content)) {
    return { outputType: "json" };
  }

  if (ECHO_RE.test(content)) {
    // If there's also a redirect, the redirect takes priority
    return { outputType: "echo" };
  }

  return { outputType: "unknown" };
}

function detectSecurityIssues(content: string): string[] {
  const issues: string[] = [];

  // SQL injection: check if user input vars appear inside SQL string contexts
  // Look for SQL statements that contain direct variable interpolation from superglobals
  if (SQL_INJECTION_RE.test(content)) {
    issues.push(
      "SQL injection risk: user input ($_POST/$_GET/$_REQUEST) used directly in SQL query strings",
    );
  }

  // Check for unescaped variable interpolation in SQL
  const sqlStrings = content.match(
    /(?:INSERT|UPDATE|DELETE|SELECT)[\s\S]*?['"][\s\S]*?\$\w+[\s\S]*?['"]/gi,
  );
  if (sqlStrings && sqlStrings.length > 0) {
    issues.push(
      "SQL injection risk: PHP variables interpolated directly in SQL strings without parameterized queries",
    );
  }

  // Check for hardcoded credentials
  if (/new\s+PDO\s*\(/.test(content) && /'[^']*password|jra|PolieF1boh/i.test(content)) {
    issues.push("Hardcoded database credentials found in source file");
  }

  // No CSRF protection
  if (/\$_POST/.test(content) && !/csrf|nonce|token/i.test(content)) {
    issues.push("No CSRF token validation detected for POST operations");
  }

  // No input validation
  if (
    /\$_POST\[/.test(content) &&
    !/filter_var|filter_input|htmlspecialchars|intval|preg_match/.test(content)
  ) {
    issues.push("No input validation or sanitization detected");
  }

  return [...new Set(issues)];
}

// ── PHP version hint patterns ──

const PHP_VERSION_PATTERNS: Array<{ re: RegExp; minVersion: string; reason: string }> = [
  // PHP 7.4+
  { re: /\bfn\s*\(/, minVersion: "7.4", reason: "Arrow function (fn)" },
  { re: /(?:public|protected|private|static)\s+(?:int|float|string|bool|array|object|self|parent)\s+\$/, minVersion: "7.4", reason: "Typed property" },
  // PHP 8.0+
  { re: /\bmatch\s*\(/, minVersion: "8.0", reason: "match expression" },
  { re: /\w+\s*\(\s*\w+\s*:\s*/, minVersion: "8.0", reason: "Named argument" },
  { re: /#\[\w+/, minVersion: "8.0", reason: "PHP attribute syntax" },
  { re: /\?\->/, minVersion: "8.0", reason: "Null-safe operator (?->)" },
  // PHP 8.1+
  { re: /\breadonly\b/, minVersion: "8.1", reason: "readonly keyword" },
  { re: /\benum\s+\w+/, minVersion: "8.1", reason: "Enum declaration" },
  { re: /\w+&\w+\s+\$/, minVersion: "8.1", reason: "Intersection type" },
  { re: /new\s+Fiber\s*\(/, minVersion: "8.1", reason: "Fiber usage" },
];

function detectPhpVersionHints(content: string): PhpVersionHint[] {
  const hints: PhpVersionHint[] = [];
  const seen = new Set<string>();

  for (const { re, minVersion, reason } of PHP_VERSION_PATTERNS) {
    if (re.test(content) && !seen.has(reason)) {
      seen.add(reason);
      hints.push({ minVersion, reason });
    }
  }

  return hints;
}

/**
 * Extract WP version from `wp-includes/version.php` content.
 * Looks for: $wp_version = '6.7';
 */
export function extractWpVersionFromPhp(content: string): string | undefined {
  const match = content.match(/\$wp_version\s*=\s*['"]([\d.]+)['"]/);
  return match ? match[1] : undefined;
}

function inferPurpose(fileName: string, content: string): string {
  const base = fileName.replace(/\.php$/, "");

  // Check for comments at the top
  const commentMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
  if (commentMatch) {
    const comment = commentMatch[1]!.replace(/\s*\*\s*/g, " ").trim();
    if (comment.length > 5) return comment;
  }

  // Check for Japanese comments
  const jpComment = content.match(/\/\/\s*(.*[ぁ-んァ-ヶ亜-熙].*)$/m);
  if (jpComment) return jpComment[1]!.trim();

  // Infer from file name patterns
  const patterns: Record<string, string> = {
    insert: "Create new record",
    update: "Update existing record",
    delete: "Delete record",
    "event-copy": "Copy event with its slots",
    "event-stop": "Stop/cancel event",
    "event-restoration": "Restore cancelled event",
    "event-slot-update": "Update event slot",
    "event-slot-delete": "Delete event slot",
    insert_event_slot: "Create new event slot",
    insert_information: "Create new information entry",
    "information-update": "Update information entry",
    "information-text-update": "Update information text fields",
    "information-banner-update": "Update information banner",
    "information-banner-in": "Enable information banner display",
    "information-banner-out": "Disable information banner display",
    "information-text-in": "Enable information text display",
    "information-text-out": "Disable information text display",
    "lottery-update": "Invalidate lottery entry",
    "user-blacklist": "Add user to blacklist",
    "user-blacklist-out": "Remove user from blacklist",
    "db-connect": "Database connection helper",
    "page-event-copy": "Event copy page template",
    "another-copy": "Alternative event copy",
  };

  if (patterns[base]) return patterns[base];

  // Infer from DB operations
  const hasInsert = /INSERT\s+INTO/i.test(content);
  const hasUpdate = /UPDATE\s+\w+\s+SET/i.test(content);
  const hasDelete = /DELETE\s+FROM/i.test(content);
  const hasSelect = /SELECT\s+.*FROM/i.test(content);

  const ops = [];
  if (hasInsert) ops.push("create");
  if (hasUpdate) ops.push("update");
  if (hasDelete) ops.push("delete");
  if (hasSelect) ops.push("read");

  if (ops.length > 0) return `${ops.join("/")} operation (${base})`;

  return `PHP script: ${base}`;
}

export function analyzePhpFile(
  content: string,
  fileName: string,
): PhpFileAnalysis {
  const inputParams = extractInputParams(content);
  const dbOperations = extractDbOperations(content);
  const { outputType, redirectTarget } = detectOutputType(content);
  const securityIssues = detectSecurityIssues(content);
  const purpose = inferPurpose(fileName, content);
  const phpVersionHints = detectPhpVersionHints(content);

  return {
    fileName,
    purpose,
    dbOperations,
    inputParams,
    outputType,
    ...(redirectTarget ? { redirectTarget } : {}),
    securityIssues,
    phpVersionHints,
  };
}
