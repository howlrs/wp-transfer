/**
 * AI-assisted Next.js API route generator.
 *
 * Primary: Claude Code CLI subprocess (uses existing plan auth, no extra cost).
 * Fallback: Claude API direct call (requires ANTHROPIC_API_KEY).
 *
 * Sends PHP source + static analysis context to Claude to produce
 * higher-quality App Router API routes with proper Zod schemas,
 * Prisma operations, and error handling.
 */

import { execFile } from "node:child_process";
import ts from "typescript";

// ── Types ──

export interface AiRouteGeneratorOptions {
  apiKey?: string;  // optional — CLI auth is primary
  model?: string;
  concurrency?: number;
}

export interface AiRouteInput {
  phpSource: string;
  phpFilePath: string;
  /** Canonical static-stub destination. AI output must never choose its own path. */
  targetRoutePath: string;
  /** Canonical resource scope required by the static authorization guard. */
  accessPath: string;
  prismaSchema: string;
  staticAnalysis: {
    dbOperations: { type: string; table: string; columns: string[] }[];
    inputParams: { name: string; source: string }[];
  };
  existingRoute?: string;
}

export interface AiRouteOutput {
  routePath: string;
  content: string;
  method: string;
  /** True when static content was retained instead of accepting model output. */
  fallback: boolean;
  tokensUsed?: number;
}

// ── Constants ──

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const MAX_PHP_LENGTH = 10_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// ── Credential masking ──

const PASSWORD_PATTERNS = [
  /(\$password\s*=\s*)(["'])(?:(?!\2).)*\2/gi,
  /(\$db_?pass(?:word)?\s*=\s*)(["'])(?:(?!\2).)*\2/gi,
  /(["']password["']\s*(?:=>|:)\s*)(["'])(?:(?!\2).)*\2/gi,
];

const API_KEY_PATTERNS = [
  /(\$api_?key\s*=\s*)(["'])(?:(?!\2).)*\2/gi,
  /(\$secret_?key\s*=\s*)(["'])(?:(?!\2).)*\2/gi,
  /(\$access_?token\s*=\s*)(["'])(?:(?!\2).)*\2/gi,
  /(["'](?:api[_-]?key|secret[_-]?key|access[_-]?token)["']\s*(?:=>|:)\s*)(["'])(?:(?!\2).)*\2/gi,
];

export function maskCredentials(source: string): string {
  let masked = source;
  for (const re of PASSWORD_PATTERNS) {
    masked = masked.replace(re, '$1"***MASKED***"');
  }
  for (const re of API_KEY_PATTERNS) {
    masked = masked.replace(re, '$1"***MASKED***"');
  }
  return masked;
}

// ── Markdown stripping ──

export function stripMarkdown(output: string): string {
  let result = output.trim();
  // Strip opening ```typescript or ```ts or ```
  result = result.replace(/^```(?:typescript|ts)?\s*\n?/, "");
  // Strip closing ```
  result = result.replace(/\n?```\s*$/, "");
  return result.trim();
}

// ── Output validation ──

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node)
    && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false);
}

function exportedHttpMethods(source: string): Set<string> | undefined {
  const sourceFile = ts.createSourceFile(
    "generated-route.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (hasParseDiagnostics(sourceFile)) return undefined;

  const methods = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
    const method = statement.name.text;
    if (!HTTP_METHODS.has(method)) continue;
    if (
      !statement.body
      || !hasModifier(statement, ts.SyntaxKind.ExportKeyword)
      || !hasModifier(statement, ts.SyntaxKind.AsyncKeyword)
      || hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
      || methods.has(method)
    ) {
      return undefined;
    }
    methods.add(method);
  }
  return methods;
}

export function validateRouteOutput(output: string): boolean {
  const methods = exportedHttpMethods(output);
  return methods !== undefined && methods.size > 0;
}

/** AI refinements must not silently remove a co-located static route handler. */
export function preservesExportedHttpMethods(existingRoute: string, output: string): boolean {
  const existing = exportedHttpMethods(existingRoute);
  const generated = exportedHttpMethods(output);
  return existing !== undefined
    && generated !== undefined
    && existing.size > 0
    && existing.size === generated.size
    && [...existing].every((method) => generated.has(method));
}

const TRUSTED_ROUTE_MODULES = new Set([
  "@/lib/db",
  "@/lib/require-active-user",
  "next/server",
  "zod",
]);

// Only schema-construction/refinement members are allowed at module scope.
// Runtime evaluation members such as parse/safeParse, plus JavaScript escape
// hatches such as constructor/call/apply, are deliberately absent.
const PURE_ZOD_MEMBERS = new Set([
  "and", "any", "array", "base64", "bigint", "boolean", "brand", "catch",
  "cidr", "coerce", "cuid", "cuid2", "custom", "date", "datetime", "default",
  "describe", "discriminatedUnion", "duration", "email", "emoji", "endsWith",
  "enum", "finite", "function", "gt", "gte", "includes", "instanceof", "int",
  "intersection", "ip", "jwt", "lazy", "length", "literal", "lt", "lte", "map",
  "max", "min", "multipleOf", "nan", "nanoid", "nativeEnum", "negative", "never",
  "nonnegative", "nonoptional", "nonpositive", "null", "nullable", "nullish",
  "number", "object", "optional", "or", "passthrough", "pipe", "positive",
  "preprocess", "promise", "readonly", "record", "refine", "regex", "safe",
  "set", "startsWith", "strict", "strictObject", "string", "strip", "superRefine",
  "symbol", "templateLiteral", "time", "toLowerCase", "toUpperCase", "transform",
  "trim", "tuple", "undefined", "union", "unknown", "url", "uuid", "void",
]);

function hasParseDiagnostics(sourceFile: ts.SourceFile): boolean {
  // createSourceFile records syntax diagnostics internally. TypeScript does
  // not expose the property on SourceFile's public type, so keep the cast
  // isolated here and fail closed if the parser reports anything.
  const parsed = sourceFile as ts.SourceFile & {
    parseDiagnostics?: readonly ts.Diagnostic[];
  };
  return (parsed.parseDiagnostics?.length ?? 0) > 0;
}

function isStaticPropertyName(name: ts.PropertyName): boolean {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name);
}

function isSafeBindingName(name: ts.BindingName): boolean {
  if (ts.isIdentifier(name)) return true;
  return name.elements.every((element) => {
    if (ts.isOmittedExpression(element)) return true;
    return element.initializer === undefined
      && (element.propertyName === undefined || !ts.isComputedPropertyName(element.propertyName))
      && isSafeBindingName(element.name);
  });
}

function hasSafeFunctionParameters(statement: ts.FunctionDeclaration): boolean {
  return statement.parameters.every((parameter) =>
    parameter.initializer === undefined && isSafeBindingName(parameter.name));
}

function isZodExpression(node: ts.Expression, zodBindings: ReadonlySet<string>): boolean {
  if (ts.isIdentifier(node)) return zodBindings.has(node.text);
  if (ts.isPropertyAccessExpression(node)) {
    return PURE_ZOD_MEMBERS.has(node.name.text)
      && isZodExpression(node.expression, zodBindings);
  }
  if (ts.isCallExpression(node)) {
    return isZodExpression(node.expression, zodBindings);
  }
  return false;
}

/**
 * Accept only expressions whose evaluation is statically side-effect free.
 * Calls are restricted to chains rooted in an actual `zod` import. Function
 * and arrow bodies are not executed when the function value is created.
 */
function isPureInitializer(
  node: ts.Expression,
  zodBindings: ReadonlySet<string>,
  pureBindings: ReadonlySet<string>,
): boolean {
  if (
    ts.isStringLiteralLike(node)
    || ts.isNumericLiteral(node)
    || ts.isBigIntLiteral(node)
    || ts.isRegularExpressionLiteral(node)
    || node.kind === ts.SyntaxKind.TrueKeyword
    || node.kind === ts.SyntaxKind.FalseKeyword
    || node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return true;
  }

  if (ts.isIdentifier(node)) {
    return node.text === "undefined" || pureBindings.has(node.text) || zodBindings.has(node.text);
  }

  if (
    ts.isParenthesizedExpression(node)
    || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node)
    || ts.isNonNullExpression(node)
    || ts.isSatisfiesExpression(node)
  ) {
    return isPureInitializer(node.expression, zodBindings, pureBindings);
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.every((element) =>
      !ts.isSpreadElement(element)
      && isPureInitializer(element, zodBindings, pureBindings));
  }

  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every((property) => {
      if (ts.isPropertyAssignment(property)) {
        return isStaticPropertyName(property.name)
          && isPureInitializer(property.initializer, zodBindings, pureBindings);
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return pureBindings.has(property.name.text) || zodBindings.has(property.name.text);
      }
      // Spreads can invoke iterators/getters; computed/accessor members are
      // intentionally outside this conservative route-code subset.
      return false;
    });
  }

  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return true;

  if (ts.isCallExpression(node)) {
    return isZodExpression(node.expression, zodBindings)
      && node.arguments.every((argument) =>
        !ts.isSpreadElement(argument)
        && isPureInitializer(argument, zodBindings, pureBindings));
  }

  if (ts.isPropertyAccessExpression(node)) {
    return isZodExpression(node, zodBindings);
  }

  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.every((span) =>
      isPureInitializer(span.expression, zodBindings, pureBindings));
  }

  if (ts.isPrefixUnaryExpression(node)) {
    return isPureInitializer(node.operand, zodBindings, pureBindings);
  }

  if (ts.isConditionalExpression(node)) {
    return isPureInitializer(node.condition, zodBindings, pureBindings)
      && isPureInitializer(node.whenTrue, zodBindings, pureBindings)
      && isPureInitializer(node.whenFalse, zodBindings, pureBindings);
  }

  return false;
}

/**
 * Reject executable module-scope code before accepting an LLM-produced route.
 * This deliberately recognizes only imports, types, declarations, and pure
 * constants; anything ambiguous falls back to the static route.
 */
export function hasNoTopLevelSideEffects(output: string): boolean {
  const sourceFile = ts.createSourceFile(
    "generated-route.ts",
    output,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (hasParseDiagnostics(sourceFile)) return false;

  const zodBindings = new Set<string>();
  const pureBindings = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (!ts.isStringLiteral(statement.moduleSpecifier)) return false;
      const moduleName = statement.moduleSpecifier.text;
      const importClause = statement.importClause;
      if (!importClause || !TRUSTED_ROUTE_MODULES.has(moduleName)) return false;

      if (moduleName === "zod" && !importClause.isTypeOnly) {
        const bindings = importClause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) {
          zodBindings.add(bindings.name.text);
        } else if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            if (!element.isTypeOnly && (element.propertyName?.text ?? element.name.text) === "z") {
              zodBindings.add(element.name.text);
            }
          }
        }
      }
      continue;
    }

    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      continue;
    }

    if (ts.isFunctionDeclaration(statement)) {
      // Parameter defaults and computed destructuring keys run before the
      // first handler-body statement, which would bypass an in-body guard.
      if (!statement.body || !hasSafeFunctionParameters(statement)) return false;
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) return false;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) return false;
        if (!isPureInitializer(declaration.initializer, zodBindings, pureBindings)) return false;
        pureBindings.add(declaration.name.text);
      }
      continue;
    }

    if (ts.isEmptyStatement(statement)) continue;
    return false;
  }

  return true;
}

/**
 * Check that an AI-generated route retains the mandatory database-backed
 * authorization guard used by authenticated scaffolds. This is intentionally
 * stricter than prompt guidance: unguarded model output must never replace a
 * guarded static route.
 */
function namedRuntimeImport(
  sourceFile: ts.SourceFile,
  moduleName: string,
  importedName: string,
): string | undefined {
  const matches: string[] = [];
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== moduleName
      || !statement.importClause
      || statement.importClause.isTypeOnly
      || !statement.importClause.namedBindings
      || !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      if (!element.isTypeOnly && (element.propertyName?.text ?? element.name.text) === importedName) {
        matches.push(element.name.text);
      }
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function bindingNameContains(name: ts.BindingName, target: string): boolean {
  if (ts.isIdentifier(name)) return name.text === target;
  return name.elements.some((element) =>
    !ts.isOmittedExpression(element) && bindingNameContains(element.name, target));
}

/** Reject a local runtime binding that could shadow a trusted import. */
function containsBindingNamed(handler: ts.FunctionDeclaration, target: string): boolean {
  if (handler.parameters.some((parameter) => bindingNameContains(parameter.name, target))) {
    return true;
  }

  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
      found = bindingNameContains(node.name, target);
    } else if (
      (ts.isFunctionDeclaration(node)
        || ts.isFunctionExpression(node)
        || ts.isClassDeclaration(node)
        || ts.isClassExpression(node)
        || ts.isEnumDeclaration(node))
      && node.name?.text === target
    ) {
      found = true;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  if (handler.body) ts.forEachChild(handler.body, visit);
  return found;
}

function guardResultName(
  statement: ts.Statement,
  guardImport: string,
  accessPath: string,
): string | undefined {
  if (
    !ts.isVariableStatement(statement)
    || (statement.declarationList.flags & ts.NodeFlags.Const) === 0
    || statement.declarationList.declarations.length !== 1
  ) {
    return undefined;
  }
  const declaration = statement.declarationList.declarations[0]!;
  if (
    !ts.isIdentifier(declaration.name)
    || !declaration.initializer
    || !ts.isAwaitExpression(declaration.initializer)
    || !ts.isCallExpression(declaration.initializer.expression)
  ) {
    return undefined;
  }
  const call = declaration.initializer.expression;
  return ts.isIdentifier(call.expression)
    && call.expression.text === guardImport
    && call.arguments.length === 1
    && ts.isStringLiteral(call.arguments[0]!)
    && call.arguments[0]!.text === accessPath
    ? declaration.name.text
    : undefined;
}

function staticPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function isStaticErrorPayload(expression: ts.Expression): boolean {
  if (!ts.isObjectLiteralExpression(expression) || expression.properties.length !== 1) return false;
  const property = expression.properties[0]!;
  return ts.isPropertyAssignment(property)
    && staticPropertyName(property.name) === "error"
    && ts.isStringLiteral(property.initializer);
}

function isStaticDenyOptions(expression: ts.Expression): boolean {
  if (!ts.isObjectLiteralExpression(expression) || expression.properties.length !== 1) return false;
  const property = expression.properties[0]!;
  return ts.isPropertyAssignment(property)
    && staticPropertyName(property.name) === "status"
    && ts.isNumericLiteral(property.initializer)
    && (property.initializer.text === "401" || property.initializer.text === "403");
}

function isDenyReturn(statement: ts.Statement, nextResponseImport: string): boolean {
  const returnStatement = ts.isBlock(statement)
    ? statement.statements.length === 1 && ts.isReturnStatement(statement.statements[0]!)
      ? statement.statements[0]!
      : undefined
    : ts.isReturnStatement(statement) ? statement : undefined;
  const expression = returnStatement?.expression;
  if (!expression || !ts.isCallExpression(expression) || expression.arguments.length !== 2) {
    return false;
  }
  const callee = expression.expression;
  return ts.isPropertyAccessExpression(callee)
    && ts.isIdentifier(callee.expression)
    && callee.expression.text === nextResponseImport
    && callee.name.text === "json"
    && isStaticErrorPayload(expression.arguments[0]!)
    && isStaticDenyOptions(expression.arguments[1]!);
}

function isImmediateDeny(
  statement: ts.Statement,
  resultName: string,
  nextResponseImport: string,
): boolean {
  return ts.isIfStatement(statement)
    && statement.elseStatement === undefined
    && ts.isPrefixUnaryExpression(statement.expression)
    && statement.expression.operator === ts.SyntaxKind.ExclamationToken
    && ts.isIdentifier(statement.expression.operand)
    && statement.expression.operand.text === resultName
    && isDenyReturn(statement.thenStatement, nextResponseImport);
}

export function hasActiveAccessGuard(output: string, accessPath: string): boolean {
  const sourceFile = ts.createSourceFile(
    "generated-route.ts",
    output,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (hasParseDiagnostics(sourceFile)) return false;

  const guardImport = namedRuntimeImport(
    sourceFile,
    "@/lib/require-active-user",
    "requireActiveAccess",
  );
  const nextResponseImport = namedRuntimeImport(sourceFile, "next/server", "NextResponse");
  if (!guardImport || !nextResponseImport) return false;

  const handlers = sourceFile.statements.filter((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement)
      && statement.name !== undefined
      && HTTP_METHODS.has(statement.name.text));
  if (handlers.length === 0) return false;

  const seenMethods = new Set<string>();
  return handlers.every((handler) => {
    const method = handler.name!.text;
    if (
      seenMethods.has(method)
      || !handler.body
      || !hasModifier(handler, ts.SyntaxKind.ExportKeyword)
      || !hasModifier(handler, ts.SyntaxKind.AsyncKeyword)
      || hasModifier(handler, ts.SyntaxKind.DefaultKeyword)
      || !hasSafeFunctionParameters(handler)
      || containsBindingNamed(handler, guardImport)
      || containsBindingNamed(handler, nextResponseImport)
    ) {
      return false;
    }
    seenMethods.add(method);

    const [first, second] = handler.body.statements;
    if (!first || !second) return false;
    const resultName = guardResultName(first, guardImport, accessPath);
    return resultName !== undefined && isImmediateDeny(second, resultName, nextResponseImport);
  });
}

// ── Prompt building ──

export function buildPrompt(input: AiRouteInput): string {
  return `You are a PHP to Next.js migration expert. Convert this PHP file to a Next.js App Router API route.

## Rules
1. Define Zod validation schemas for ALL input parameters
2. HTTP methods: GET=read, POST=create, PUT=full update, PATCH=partial update, DELETE=delete
3. DELETE operations use prisma.model.delete() (only use .update() for explicit soft-deletes)
4. Convert PHP foreach DB loops to Prisma createMany or for...of + await
5. Use prisma.$transaction() for multi-table operations
6. Error handling: ZodError->400, NotFound->404, other->500
7. File uploads use FormData API
8. Import from "@/lib/db" for prisma, "next/server" for NextRequest/NextResponse, "zod" for z
9. Import requireActiveAccess from "@/lib/require-active-user" and call
   await requireActiveAccess("${input.accessPath}") at the beginning of EVERY handler;
   return NextResponse.json({ error: "Forbidden" }, { status: 403 }) when it returns null
10. This file is written only to ${input.targetRoutePath}; do not infer or mention another route path

## Static Analysis Results
DB Operations: ${JSON.stringify(input.staticAnalysis.dbOperations)}
Input Parameters: ${JSON.stringify(input.staticAnalysis.inputParams)}

## PHP Source (${input.phpFilePath})
${maskCredentials(input.phpSource)}

## Relevant Prisma Models
${input.prismaSchema}

## Existing Guarded Static Route
Preserve every exported HTTP handler in this file exactly. Do not remove, split,
or replace an existing method with a different route.
${input.existingRoute ?? "No static route is available; generate the required handler."}

Output ONLY TypeScript code. No markdown, no explanations.`;
}

// ── HTTP method inference ──

function inferMethod(
  dbOps: { type: string }[],
  filePath: string,
): string {
  const primary = dbOps[0]?.type?.toUpperCase();
  if (primary === "INSERT") return "POST";
  if (primary === "UPDATE") return "PUT";
  if (primary === "DELETE") return "DELETE";
  if (primary === "SELECT") return "GET";

  const lower = filePath.toLowerCase();
  if (lower.includes("delete")) return "DELETE";
  if (lower.includes("update")) return "PUT";
  if (lower.includes("insert") || lower.includes("create")) return "POST";
  return "POST";
}

// ── Semaphore for concurrency control ──

class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;

  constructor(private limit: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) {
      this.active++;
      next();
    }
  }
}

// ── Claude Code CLI call (primary — uses existing plan auth, no extra cost) ──

async function callClaudeCli(
  prompt: string,
): Promise<{ content: string; tokensUsed: number }> {
  const { spawn } = await import("node:child_process");

  return new Promise((resolve, reject) => {
    const proc = spawn("claude", ["-p", "--output-format", "text"], {
      timeout: 120_000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        return;
      }
      resolve({ content: stdout, tokensUsed: 0 });
    });

    proc.on("error", (error) => {
      reject(new Error(`Claude CLI failed: ${error.message}`));
    });

    // Write prompt via stdin and close
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// ── Check if Claude CLI is available ──

let _cliAvailable: boolean | null = null;

export async function isClaudeCliAvailable(): Promise<boolean> {
  if (_cliAvailable !== null) return _cliAvailable;

  return new Promise((resolve) => {
    execFile("claude", ["--version"], { timeout: 5000 }, (error) => {
      _cliAvailable = !error;
      resolve(!error);
    });
  });
}

// ── Claude API call (fallback — requires ANTHROPIC_API_KEY) ──

async function callClaudeApi(
  prompt: string,
  options: AiRouteGeneratorOptions,
): Promise<{ content: string; tokensUsed: number }> {
  if (!options.apiKey) {
    throw new Error("Claude API requires ANTHROPIC_API_KEY");
  }

  const model = options.model ?? DEFAULT_MODEL;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": options.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>;
        usage?: { input_tokens: number; output_tokens: number };
      };
      const text = data.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      const tokensUsed =
        (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
      return { content: text, tokensUsed };
    }

    const status = response.status;
    if (status === 429 || status >= 500) {
      if (attempt < MAX_RETRIES - 1) {
        const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
    }

    throw new Error(
      `Claude API error: ${status} ${response.statusText}`,
    );
  }

  throw new Error("Claude API: max retries exceeded");
}

// ── Unified caller: CLI first, API fallback ──

async function callClaude(
  prompt: string,
  options: AiRouteGeneratorOptions,
): Promise<{ content: string; tokensUsed: number; source: "cli" | "api" }> {
  // Try Claude Code CLI first (uses plan auth, no extra cost)
  const cliAvailable = await isClaudeCliAvailable();
  if (cliAvailable) {
    try {
      const result = await callClaudeCli(prompt);
      return { ...result, source: "cli" };
    } catch (error) {
      console.warn(
        `[ai-route-generator] Claude CLI failed, trying API fallback: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Fallback to API
  if (options.apiKey) {
    const result = await callClaudeApi(prompt, options);
    return { ...result, source: "api" };
  }

  throw new Error(
    "AI generation unavailable: Claude CLI not found and no ANTHROPIC_API_KEY set",
  );
}

// ── Public API ──

export async function generateRouteWithAi(
  input: AiRouteInput,
  options: AiRouteGeneratorOptions,
): Promise<AiRouteOutput> {
  const method = inferMethod(
    input.staticAnalysis.dbOperations,
    input.phpFilePath,
  );
  // Destination selection is intentionally not delegated to the model (nor
  // derived from a PHP filename): it must match the static route it refines.
  const routePath = input.targetRoutePath;

  // Large file guard
  if (input.phpSource.length > MAX_PHP_LENGTH) {
    console.warn(
      `[ai-route-generator] ${input.phpFilePath} exceeds ${MAX_PHP_LENGTH} chars, using static fallback`,
    );
    return {
      routePath,
      content: input.existingRoute ?? "// Static fallback: file too large for AI generation",
      method,
      fallback: true,
    };
  }

  const prompt = buildPrompt(input);

  try {
    const { content: raw, tokensUsed, source } = await callClaude(prompt, options);
    const content = stripMarkdown(raw);
    if (source === "cli") {
      console.info(`[ai-route-generator] ${input.phpFilePath}: generated via Claude CLI (plan auth)`);
    }

    if (!validateRouteOutput(content) ||
      !hasActiveAccessGuard(content, input.accessPath) ||
      !hasNoTopLevelSideEffects(content) ||
      (input.existingRoute !== undefined && !preservesExportedHttpMethods(input.existingRoute, content))) {
      console.warn(
        `[ai-route-generator] Invalid, unguarded, or incomplete LLM output for ${input.phpFilePath}, using fallback`,
      );
      return {
        routePath,
        content: input.existingRoute ?? "// Fallback: AI output did not contain valid export",
        method,
        fallback: true,
      };
    }

    return { routePath, content, method, fallback: false, tokensUsed };
  } catch (error) {
    console.warn(
      `[ai-route-generator] API call failed for ${input.phpFilePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      routePath,
      content: input.existingRoute ?? "// Fallback: AI generation failed",
      method,
      fallback: true,
    };
  }
}

export async function generateRoutesWithAi(
  inputs: AiRouteInput[],
  options: AiRouteGeneratorOptions,
): Promise<{ results: AiRouteOutput[]; totalTokens: number; failures: string[] }> {
  const concurrency = options.concurrency ?? 5;
  const semaphore = new Semaphore(concurrency);
  const failures: string[] = [];
  let totalTokens = 0;

  const tasks = inputs.map(async (input) => {
    await semaphore.acquire();
    try {
      const result = await generateRouteWithAi(input, options);
      if (result.tokensUsed != null) {
        totalTokens += result.tokensUsed;
      }
      if (result.fallback) {
        failures.push(input.phpFilePath);
      }
      return result;
    } finally {
      semaphore.release();
    }
  });

  const results = await Promise.all(tasks);
  return { results, totalTokens, failures };
}
