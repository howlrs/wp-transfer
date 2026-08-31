/**
 * Generate Next.js App Router API route stubs from PHP file analysis.
 *
 * Maps PHP filenames to RESTful Next.js API routes with Zod validation
 * and Prisma ORM integration.
 *
 * Enhancements:
 * - Name-based and DB-schema-driven Zod type inference
 * - Transaction detection for multi-table INSERT patterns
 * - File upload detection with formData handling
 */
import type { PhpFileAnalysis, InputParam } from "./php-analyzer.js";
import type { TableDefinition, ColumnDefinition } from "./schema-to-prisma.js";
import {
  pluralizeResource,
  toPascalModelName,
  toPrismaModelName,
  toSchemaName,
} from "./generator-utils.js";
import { toSafeIdentifier } from "./sanitize.js";

// ── Route mapping ──

export interface RouteMapping {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
}

const CREATE_VERBS = new Set(["create", "insert", "add", "new", "save"]);
const UPDATE_VERBS = new Set(["update", "edit", "patch", "modify"]);
const DELETE_VERBS = new Set(["delete", "remove", "destroy"]);
const READ_VERBS = new Set(["list", "index", "search", "browse", "detail", "show", "view", "read", "get"]);

function toRouteSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "legacy";
}

function operationMethod(analysis: PhpFileAnalysis): RouteMapping["method"] {
  switch (analysis.dbOperations[0]?.type) {
    case "INSERT": return "POST";
    case "UPDATE": return "PUT";
    case "DELETE": return "DELETE";
    default: return "GET";
  }
}

/** Infer a stable API route from generic legacy source evidence only. */
export function inferRouteMapping(analysis: PhpFileAnalysis): RouteMapping {
  const baseName = analysis.fileName.replace(/\.[^.]+$/, "");
  const tokens = baseName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const hasVerb = (verbs: Set<string>) => tokens.some((token) => verbs.has(token));
  const method = hasVerb(DELETE_VERBS) ? "DELETE"
    : hasVerb(UPDATE_VERBS) ? "PUT"
      : hasVerb(CREATE_VERBS) ? "POST"
        : hasVerb(READ_VERBS) ? "GET"
          : operationMethod(analysis);
  const table = analysis.dbOperations.find((operation) => operation.table && operation.table !== "unknown")?.table;
  const resourceTokens = table ? [table] : tokens.filter((token) =>
    !CREATE_VERBS.has(token) && !UPDATE_VERBS.has(token) && !DELETE_VERBS.has(token) && !READ_VERBS.has(token),
  );
  const resource = table
    ? pluralizeResource(toRouteSegment(table))
    : toRouteSegment(resourceTokens.join("-") || "legacy");
  const detailVerbs = new Set(["detail", "show", "view", "read"]);
  const hasId = method === "PUT" || method === "DELETE" ||
    (method === "GET" && (hasVerb(detailVerbs) || analysis.inputParams.some((parameter) => parameter.name === "id")));
  const prefix = table ? `app/api/${resource}` : `app/api/legacy/${resource}`;
  return { path: `${prefix}${hasId ? "/[id]" : ""}/route.ts`, method };
}

// ── Zod type inference context ──

interface ZodTypeContext {
  tables?: TableDefinition[];
  primaryTable?: string;
  /** Parameter names that are used as loop arrays (foreach) — should be z.array() */
  loopArrayParams?: Set<string>;
}

/**
 * Check if a param name matches a boolean-like pattern:
 * is_*, has_*, can_*, *_flag, *_flg, *_enabled
 */
function isBooleanLikeParam(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.startsWith("is_") ||
    lower.startsWith("has_") ||
    lower.startsWith("can_") ||
    lower.endsWith("_flag") ||
    lower.endsWith("_flg") ||
    lower.endsWith("_enabled")
  );
}

/**
 * Check if a param name matches a non-negative numeric pattern:
 * *_limit, *_count, *_quantity, *_current, *_counter
 */
function isNonNegativeNumericParam(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith("_limit") ||
    lower.endsWith("_count") ||
    lower.endsWith("_quantity") ||
    lower.endsWith("_current") ||
    lower.endsWith("_counter")
  );
}

/**
 * Check if a param name matches an enum-like numeric pattern:
 * *_type, *_mode, *_status (except names already classified as booleans)
 */
function isEnumLikeParam(name: string): boolean {
  const lower = name.toLowerCase();
  if (isBooleanLikeParam(lower)) return false;
  return (
    lower.endsWith("_type") ||
    lower.endsWith("_mode") ||
    lower.endsWith("_status")
  );
}

/**
 * Look up a column definition by param name across the provided tables.
 * Searches the primary table first, then all tables.
 */
function findColumnDef(
  paramName: string,
  ctx: ZodTypeContext,
): ColumnDefinition | undefined {
  if (!ctx.tables || ctx.tables.length === 0) return undefined;

  // Search primary table first
  if (ctx.primaryTable) {
    const primaryTbl = ctx.tables.find((t) => t.name === ctx.primaryTable);
    if (primaryTbl) {
      const col = primaryTbl.columns.find((c) => c.name === paramName);
      if (col) return col;
    }
  }

  // Fall back to searching all tables
  for (const table of ctx.tables) {
    const col = table.columns.find((c) => c.name === paramName);
    if (col) return col;
  }

  return undefined;
}

/**
 * Infer Zod type for a single input parameter.
 *
 * Priority:
 * 1. Array params ([] suffix) → z.array(z.string())
 * 2. Boolean-like names → z.preprocess boolean
 * 3. DB schema Boolean type → z.preprocess boolean
 * 4. Non-negative numeric names → z.coerce.number().int().min(0)
 * 5. Enum-like names → z.coerce.number().int()
 * 6. DateTime-like names → z.string()
 * 7. DB schema nullable String → z.preprocess empty-to-undefined
 * 8. ID fields → z.coerce.number().int()
 * 9. Other numeric-like → z.coerce.number().int()
 * 10. Fallback → z.string()
 */
function inferZodType(param: InputParam, ctx: ZodTypeContext): string {
  const name = param.name.toLowerCase();
  // Strip [] suffix for matching purposes
  const baseName = name.replace(/\[\]$/, "");

  // 0. Loop array params (foreach variable detected by php-analyzer)
  if (ctx.loopArrayParams?.has(baseName)) {
    return "z.array(z.object({ /* TODO: define item schema */ }))";
  }

  // 1. Array params (explicit [] suffix)
  if (param.name.endsWith("[]")) {
    return "z.array(z.string())";
  }

  const colDef = findColumnDef(baseName, ctx);

  // Prefer the documented database scalar over a name heuristic. In
  // particular, IDs backed by BigInt must never pass through JavaScript's
  // number type, which would silently lose precision.
  if (colDef) return zodTypeForColumn(colDef);

  // 2. Boolean-like names (is_*, has_*, *_flag, *_flg)
  if (isBooleanLikeParam(baseName)) {
    return 'z.preprocess((v) => v === "1" || v === 1 || v === true, z.boolean())';
  }

  // 4. Non-negative numeric names
  if (isNonNegativeNumericParam(baseName)) {
    return "z.coerce.number().int().min(0)";
  }

  // ID fields
  if (baseName === "id" || baseName.endsWith("_id") || baseName === "update" || baseName === "delete") {
    return "z.coerce.number().int()";
  }

  // 5. Enum-like names (with TODO hint)
  if (isEnumLikeParam(baseName)) {
    return "z.coerce.number().int()";
  }

  // 6. DateTime-like names
  if (
    baseName.endsWith("_time") ||
    baseName.endsWith("_date") ||
    baseName.endsWith("_at") ||
    baseName.includes("time") ||
    baseName.includes("date")
  ) {
    return "z.string()";
  }

  // Other numeric-like names
  if (
    baseName.includes("number") ||
    baseName.endsWith("_order") ||
    baseName.endsWith("_index")
  ) {
    return "z.coerce.number().int()";
  }

  // URL fields
  if (baseName.includes("link") || baseName.includes("url")) {
    return "z.string().url().optional()";
  }

  // Text fields (default)
  return "z.string()";
}

/** Return an exact, Prisma-compatible input validator for a documented scalar. */
function zodTypeForColumn(column: ColumnDefinition): string {
  let schema: string;
  switch (column.type) {
    case "Boolean":
      schema = 'z.preprocess((v) => v === "1" || v === 1 || v === true, z.boolean())';
      break;
    case "Int":
      schema = "z.coerce.number().int().finite().min(-2147483648).max(2147483647)";
      break;
    case "BigInt":
      // JSON cannot transport bigint values. Canonical decimal strings retain
      // the full value and are converted only after validation.
      schema = 'z.string().regex(/^(?:0|-?[1-9]\\d*)$/, "Expected a canonical integer string").transform((value) => BigInt(value))';
      break;
    case "Float":
      schema = "z.coerce.number().finite()";
      break;
    case "Decimal":
      // Prisma accepts decimal strings natively; retaining the string avoids
      // rounding before Prisma constructs its Decimal instance.
      schema = 'z.string().regex(/^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?$/, "Expected a decimal string")';
      break;
    case "DateTime":
      schema = "z.coerce.date()";
      break;
    case "Bytes":
      schema = 'z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, "Expected base64 data").transform((value) => Buffer.from(value, "base64"))';
      break;
    case "Json":
      schema = "z.unknown()";
      break;
    default:
      schema = "z.string()";
  }

  return column.nullable ? `${schema}.nullable()` : schema;
}

/**
 * Check if any enum-like params exist (to decide whether to add TODO comment).
 */
function hasEnumLikeParams(params: InputParam[]): boolean {
  return params.some((p) => isEnumLikeParam(p.name.toLowerCase().replace(/\[\]$/, "")));
}

function generateZodSchema(
  schemaName: string,
  params: InputParam[],
  ctx: ZodTypeContext,
  options?: { partial?: boolean },
): string {
  // Exclude file params only; array params are now included with z.array()
  let bodyParams = params.filter((p) => p.source !== "$_FILES");

  // Filter to columns that actually exist in the target table's Prisma schema
  // This prevents generating Zod fields for PHP form params that don't map to DB columns
  if (ctx.tables && ctx.primaryTable) {
    const table = ctx.tables.find((t) => t.name === ctx.primaryTable);
    if (table) {
      const columnNames = new Set(table.columns.map((c) => c.name));
      bodyParams = bodyParams.filter((p) => {
        const fieldName = p.name.replace(/\[\]$/, "");
        return columnNames.has(fieldName);
      });
    }
  }

  if (bodyParams.length === 0) {
    return `const ${schemaName} = z.object({});`;
  }

  const optionalSuffix = options?.partial ? ".optional()" : "";
  const fields = bodyParams
    .map((p) => {
      // Strip [] from field name for the schema key
      const fieldName = p.name.replace(/\[\]$/, "");
      return `  ${JSON.stringify(fieldName)}: ${inferZodType(p, ctx)}${optionalSuffix},`;
    })
    .join("\n");

  let schema = `const ${schemaName} = z.object({\n${fields}\n});`;

  // Add TODO for enum range validation if enum-like params exist
  if (hasEnumLikeParams(params)) {
    schema += "\n// TODO: Consider adding enum range validation for *_type, *_mode, *_status fields";
  }

  return schema;
}

/**
 * Generate an allowlist for schema-driven routes. Only writable scalar
 * columns are admitted: generated, default-managed, and primary-key columns must not be
 * overposted, and `.strict()` rejects relation/nested-operation payloads.
 */
function generateTableWriteSchema(table: TableDefinition, partial: boolean): string {
  const writable = table.columns.filter(
    (column) => !column.isPrimary && !column.isAutoIncrement && column.defaultValue === undefined,
  );
  const fields = writable.map((column) => {
    const optional = partial ? ".optional()" : "";
    return `  ${JSON.stringify(column.name)}: ${zodTypeForColumn(column)}${optional},`;
  }).join("\n");
  return `z.object({${fields ? `\n${fields}\n` : ""}}).strict()`;
}

/**
 * Generate an UPDATE schema as a partial variant of the corresponding POST schema.
 * For PUT/PATCH routes, makes all fields optional.
 */
function generateUpdateSchema(
  postSchemaName: string,
  updateSchemaName: string,
): string {
  return `const ${updateSchemaName} = ${postSchemaName}.partial();`;
}

// ── Transaction detection ──

interface TransactionInfo {
  needed: boolean;
  pattern: "parent-child" | "check-then-insert" | "ambiguous" | "none";
  parentTable?: string;
  childTable?: string;
  /** Column in child table that references parent's ID */
  childFkColumn?: string;
}

function detectTransaction(analysis: PhpFileAnalysis): TransactionInfo {
  const inserts = analysis.dbOperations.filter((op) => op.type === "INSERT");

  if (inserts.length === 0) {
    return { needed: false, pattern: "none" };
  }

  // Check-then-insert: SELECT + INSERT on same table
  if (
    inserts.length === 1 &&
    analysis.dbOperations.some(
      (op) => op.type === "SELECT" && op.table === inserts[0]!.table,
    )
  ) {
    return { needed: true, pattern: "check-then-insert" };
  }

  // Multi-table inserts
  if (inserts.length > 1) {
    const tables = [...new Set(inserts.map((op) => op.table))];

    if (tables.length === 2) {
      // Two different tables: try to detect parent-child via FK column naming
      const [tableA, tableB] = [inserts[0]!, inserts[1]!];

      // Check if tableB has a column referencing tableA (e.g., parent_id in child_record)
      const fkInB = tableB.columns.find(
        (col) => col === `${tableA.table}_id`,
      );
      if (fkInB) {
        return {
          needed: true,
          pattern: "parent-child",
          parentTable: tableA.table,
          childTable: tableB.table,
          childFkColumn: fkInB,
        };
      }

      // Check if tableA has a column referencing tableB
      const fkInA = tableA.columns.find(
        (col) => col === `${tableB.table}_id`,
      );
      if (fkInA) {
        return {
          needed: true,
          pattern: "parent-child",
          parentTable: tableB.table,
          childTable: tableA.table,
          childFkColumn: fkInA,
        };
      }

      // Default: assume first insert is parent, second is child
      // Check if second insert has any column ending in _id matching first table name
      const possibleFk = tableB.columns.find((col) =>
        col.endsWith("_id"),
      );
      return {
        needed: true,
        pattern: "parent-child",
        parentTable: tableA.table,
        childTable: tableB.table,
        childFkColumn: possibleFk ?? `${tableA.table}_id`,
      };
    }

    // 3+ tables or same-table multi-inserts: ambiguous
    return { needed: true, pattern: "ambiguous" };
  }

  return { needed: false, pattern: "none" };
}

// ── File upload detection ──

interface FileUploadInfo {
  hasFiles: boolean;
  fileParams: InputParam[];
}

function detectFileUploads(params: InputParam[]): FileUploadInfo {
  const fileParams = params.filter((p) => p.source === "$_FILES");
  return {
    hasFiles: fileParams.length > 0,
    fileParams,
  };
}

/**
 * Files are persisted only when their request fields map unambiguously to a
 * writable column on the model this route mutates. This prevents orphaned
 * files when a PHP upload field has no Prisma destination.
 */
function mappedUploadFieldNames(
  fileParams: InputParam[],
  operation: { type: string; table: string; columns: string[] } | null,
  tables?: TableDefinition[],
): Set<string> {
  if (!operation || !["INSERT", "UPDATE"].includes(operation.type)) {
    return new Set();
  }

  const table = tables?.find((candidate) => candidate.name === operation.table);
  const schemaColumns = table ? new Set(table.columns.map((column) => column.name)) : null;
  return new Set(
    fileParams
      .map((parameter) => parameter.name.replace(/\[\]$/, ""))
      .filter((fieldName) =>
        operation.columns.includes(fieldName) &&
        (schemaColumns === null || schemaColumns.has(fieldName)),
      ),
  );
}

// ── Delete pattern detection ──

interface DeletePattern {
  type: "hard-delete" | "soft-delete";
  /** For soft-delete: the column being updated */
  column?: string;
  /** For soft-delete: the value being set */
  value?: string;
}

function detectDeletePattern(analysis: PhpFileAnalysis): DeletePattern {
  // Check if the PHP file uses DELETE FROM (hard-delete)
  const hasDeleteFrom = analysis.dbOperations.some(op => op.type === "DELETE");
  if (hasDeleteFrom) {
    return { type: "hard-delete" };
  }

  // Check for soft-delete patterns: UPDATE with status/flag columns
  const softDeleteColumns = ["is_active", "is_deleted", "deleted_at", "is_archived", "archived_at"];
  for (const op of analysis.dbOperations) {
    if (op.type === "UPDATE") {
      for (const col of op.columns) {
        const lower = col.toLowerCase();
        if (softDeleteColumns.includes(lower)) {
          return { type: "soft-delete", column: col, value: lower === "deleted_at" ? "new Date()" : "0" };
        }
      }
    }
  }

  // Default: if HTTP method is DELETE but no DELETE FROM found, assume soft-delete
  return { type: "hard-delete" };
}

// ── Route handler generation ──

function generateJsonSafeHelper(): string {
  return `function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value === null || value instanceof Date || typeof value !== "object") return value;
  const serializable = value as { toJSON?: () => unknown };
  if (typeof serializable.toJSON === "function") return jsonSafe(serializable.toJSON());
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, jsonSafe(nested)]));
}`;
}

function generateBigIntPathParser(): string {
  return `function parseBigIntPath(value: string): bigint {
  if (!/^(?:0|-?[1-9]\\d*)$/.test(value)) throw new Error("Expected a canonical integer path parameter");
  return BigInt(value);
}`;
}

function generateRoutePreamble(hasFiles: boolean, requireAuth = false): string {
  const lines = [
    'import { NextRequest, NextResponse } from "next/server";',
    'import { z } from "zod";',
    'import { prisma } from "@/lib/db";',
  ];
  if (requireAuth) lines.push('import { requireActiveAccess } from "@/lib/require-active-user";');
  lines.push("");
  lines.push(generateJsonSafeHelper());
  lines.push("");
  lines.push(generateBigIntPathParser());
  if (hasFiles) {
    lines.push('import { writeFile, mkdir, unlink } from "node:fs/promises";');
    lines.push('import { randomUUID } from "node:crypto";');
    lines.push('import path from "node:path";');
    lines.push("");
    lines.push("function hasSignature(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {");
    lines.push("  return signature.every((value, index) => bytes[offset + index] === value);");
    lines.push("}");
    lines.push("");
    lines.push("function detectImageExtension(bytes: Uint8Array): string | null {");
    lines.push('  if (hasSignature(bytes, [0xff, 0xd8, 0xff])) return ".jpg";');
    lines.push('  if (hasSignature(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return ".png";');
    lines.push('  if (hasSignature(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])) return ".gif";');
    lines.push('  if (hasSignature(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return ".gif";');
    lines.push('  if (hasSignature(bytes, [0x52, 0x49, 0x46, 0x46]) && hasSignature(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return ".webp";');
    lines.push("  return null;");
    lines.push("}");
  }
  return lines.join("\n");
}

/** Convert a generated route file path into its canonical authorization scope. */
export function routeResourcePath(routePath: string): string {
  return routePath
    .replace(/^app\/api/, "")
    .replace(/\/\[[^/]+\]/g, "")
    .replace(/\/route\.ts$/, "") || "/";
}

function authorizationLines(resourcePath: string, requireAuth: boolean): string[] {
  if (!requireAuth) return [];
  return [
    `  const activeUser = await requireActiveAccess("${resourcePath}");`,
    '  if (!activeUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });',
    "",
  ];
}

function authorizationBlock(resourcePath: string, requireAuth: boolean): string {
  return authorizationLines(resourcePath, requireAuth).join("\n");
}

interface PrimaryKeyInfo {
  name: string;
  type: string;
}

/**
 * Resolve the single Prisma key that can safely identify a PHP-derived detail
 * route. When no schema is available, retain the legacy id:Int fallback; when
 * a schema is available but ambiguous, do not manufacture a detail mutation.
 */
function resolvePrimaryKey(tableName: string, tables?: TableDefinition[]): PrimaryKeyInfo | null {
  if (!tables || tables.length === 0) return { name: "id", type: "Int" };

  const table = tables.find((candidate) => candidate.name === tableName);
  if (!table) return null;
  const primaryColumns = table.columns.filter((column) => column.isPrimary);
  return primaryColumns.length === 1
    ? { name: primaryColumns[0]!.name, type: primaryColumns[0]!.type }
    : null;
}

function parsePrimaryKeyExpression(rawValue: string, type: string): string {
  if (type === "Int") return `parseInt(${rawValue}, 10)`;
  if (type === "BigInt") return `parseBigIntPath(${rawValue})`;
  return rawValue;
}

function primaryKeyWhere(primaryKey: PrimaryKeyInfo, value: string): string {
  return `{ ${JSON.stringify(primaryKey.name)}: ${value} }`;
}

function uploadVariableName(fieldName: string, index: number): string {
  const safe = toSafeIdentifier(fieldName);
  return safe === fieldName ? safe : `${safe}_${index}`;
}

function generateRouteHandler(
  analysis: PhpFileAnalysis,
  mapping: RouteMapping,
  tables?: TableDefinition[],
  includePreamble = true,
  requireAuth = false,
): string {
  const schemaName = toSchemaName(analysis.fileName);
  const params = analysis.inputParams;

  // Determine if route has path params
  const pathParamMatches = mapping.path.matchAll(/\[(\w+)\]/g);
  const pathParams = Array.from(pathParamMatches).map((m) => m[1]!);

  // Build params type for route handler
  const hasPathParams = pathParams.length > 0;
  const paramsType = hasPathParams
    ? `{ params }: { params: Promise<{ ${pathParams.map((p) => `${p}: string`).join("; ")} }> }`
    : "";

  // Determine which Prisma model to use
  const primaryTable =
    analysis.dbOperations.length > 0
      ? analysis.dbOperations[0]!.table
      : "unknown";
  const modelName = toPrismaModelName(primaryTable);
  const primaryKey = resolvePrimaryKey(primaryTable, tables);

  // Detect loop array parameters from foreach analysis
  const loopArrayParams = new Set<string>();
  for (const op of analysis.dbOperations) {
    if (op.inLoop && op.foreachArrayVar) {
      loopArrayParams.add(op.foreachArrayVar.toLowerCase());
    }
  }

  // Zod type context
  const ctx: ZodTypeContext = { tables, primaryTable, loopArrayParams };

  // Build handler body
  // SQL DELETE operations never need a request body — the id comes from the URL param only.
  const primaryOpType = analysis.dbOperations.length > 0 ? analysis.dbOperations[0]!.type : null;
  const isDeleteOp = primaryOpType === "DELETE";
  const bodyParams = isDeleteOp ? [] : params.filter((p) => p.source !== "$_FILES");

  // File upload detection
  const fileUpload = detectFileUploads(params);
  const op = analysis.dbOperations.length > 0 ? analysis.dbOperations[0]! : null;
  const mappedUploadFields = mappedUploadFieldNames(fileUpload.fileParams, op, tables);
  const hasBody = bodyParams.length > 0 || fileUpload.hasFiles;

  // Transaction detection
  const txInfo = detectTransaction(analysis);

  const lines: string[] = includePreamble ? [generateRoutePreamble(fileUpload.hasFiles, requireAuth), ""] : [];

  // Zod schema
  if (hasBody) {
    const isUpdate = mapping.method === "PUT" || mapping.method === "PATCH";
    lines.push(generateZodSchema(schemaName, params, ctx, { partial: isUpdate }));
    lines.push("");
  }

  // Handler function
  const fnArgs = ["request: NextRequest"];
  if (hasPathParams) {
    fnArgs.push(paramsType);
  }

  lines.push(
    `export async function ${mapping.method}(${fnArgs.join(", ")}) {`,
  );
  lines.push(...authorizationLines(routeResourcePath(mapping.path), requireAuth));
  if (hasPathParams && !primaryKey) {
    lines.push("  // TODO: Add a single-column primary key before enabling this PHP-derived detail route.");
    lines.push('  return NextResponse.json({ error: "Detail routes require a single-column primary key" }, { status: 501 });');
    lines.push("}");
    return lines.join("\n");
  }
  if (fileUpload.hasFiles) {
    lines.push("  const pendingUploads: Array<{ filePath: string; bytes: Uint8Array }> = [];");
    lines.push("  const uploadedFilePaths: string[] = [];");
    lines.push("  const uploadData: Record<string, string> = {};");
  }
  lines.push("  try {");

  // Parse path params
  if (hasPathParams) {
    lines.push("    const resolvedParams = await params;");
    for (const p of pathParams) {
      lines.push(
        `    const ${p} = ${parsePrimaryKeyExpression(`resolvedParams.${p}`, primaryKey!.type)};`,
      );
    }
    lines.push("");
  }

  // Parse body / formData
  if (hasBody) {
    if (fileUpload.hasFiles) {
      lines.push("    const formData = await request.formData();");
      lines.push("");

      // File handling for each file param
      for (const [fileIndex, fp] of fileUpload.fileParams.entries()) {
        const variableName = uploadVariableName(fp.name, fileIndex);
        lines.push(
          `    const ${variableName} = formData.get(${JSON.stringify(fp.name)}) as File | null;`,
        );
      }

      for (const [fileIndex, fp] of fileUpload.fileParams.entries()) {
        const fieldName = fp.name.replace(/\[\]$/, "");
        const variableName = uploadVariableName(fp.name, fileIndex);
        if (!mappedUploadFields.has(fieldName)) {
          lines.push(`    if (${variableName}) {`);
          lines.push(`      // TODO: Map upload field ${JSON.stringify(fieldName)} to a writable ${modelName} column before accepting files.`);
          lines.push(`      return NextResponse.json({ error: ${JSON.stringify(`Upload field ${fieldName} is not mapped to a writable database column`)} }, { status: 400 });`);
          lines.push("    }");
        }
      }

      // Generate file save logic
      lines.push("");
      lines.push('    const uploadDir = path.resolve(process.cwd(), "public/uploads");');
      lines.push("    await mkdir(uploadDir, { recursive: true });");
      lines.push("    const allowedImageTypes: Record<string, { extensions: readonly string[]; storedExtension: string }> = {");
      lines.push('      "image/jpeg": { extensions: [".jpg", ".jpeg"], storedExtension: ".jpg" },');
      lines.push('      "image/png": { extensions: [".png"], storedExtension: ".png" },');
      lines.push('      "image/gif": { extensions: [".gif"], storedExtension: ".gif" },');
      lines.push('      "image/webp": { extensions: [".webp"], storedExtension: ".webp" },');
      lines.push("    };");
      lines.push("    const maxFileSize = 5 * 1024 * 1024;");
      lines.push("");
      for (const [fileIndex, fp] of fileUpload.fileParams.entries()) {
        const fieldName = fp.name.replace(/\[\]$/, "");
        const variableName = uploadVariableName(fp.name, fileIndex);
        if (!mappedUploadFields.has(fieldName)) continue;
        const pathVariableName = `${variableName}Path`;
        lines.push(`    let ${pathVariableName}: string | null = null;`);
        lines.push(`    if (${variableName}) {`);
        lines.push(`      const imageType = allowedImageTypes[${variableName}.type];`);
        lines.push(`      const clientExtension = path.extname(${variableName}.name).toLowerCase();`);
        lines.push("      if (!imageType || !imageType.extensions.includes(clientExtension)) {");
        lines.push('        return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });');
        lines.push("      }");
        lines.push(`      if (${variableName}.size > maxFileSize) {`);
        lines.push('        return NextResponse.json({ error: "Image exceeds 5 MB limit" }, { status: 400 });');
        lines.push("      }");
        lines.push(
          `      const bytes = new Uint8Array(await ${variableName}.arrayBuffer());`,
        );
        lines.push("      const detectedExtension = detectImageExtension(bytes);");
        lines.push("      if (!detectedExtension || detectedExtension !== imageType.storedExtension) {");
        lines.push('        return NextResponse.json({ error: "Image content does not match its declared type" }, { status: 400 });');
        lines.push("      }");
        lines.push("      const extension = detectedExtension;");
        lines.push(
          `      ${pathVariableName} = path.resolve(uploadDir, \`${"${randomUUID()}${extension}"}\`);`,
        );
        lines.push(
          `      if (!${pathVariableName}.startsWith(\`${"${uploadDir}${path.sep}"}\`)) {`,
        );
        lines.push(
          '        return NextResponse.json({ error: "Invalid upload path" }, { status: 400 });',
        );
        lines.push("      }");
        lines.push(`      pendingUploads.push({ filePath: ${pathVariableName}, bytes });`);
        lines.push(`      uploadData[${JSON.stringify(fieldName)}] = \`/uploads/\${path.basename(${pathVariableName})}\`;`);
        lines.push("    }");
        lines.push("");
      }

      // Extract non-file form fields for Zod validation
      lines.push(
        "    const body = Object.fromEntries(",
      );
      lines.push(
        "      [...formData.entries()].filter(([, v]) => typeof v === \"string\"),",
      );
      lines.push("    );");
    } else {
      lines.push("    const body = await request.json();");
    }
    lines.push(`    const data = ${schemaName}.parse(body);`);
    if (fileUpload.hasFiles) {
      lines.push("    const dataWithUploads = { ...data, ...uploadData };");
      lines.push("    for (const upload of pendingUploads) {");
      lines.push("      uploadedFilePaths.push(upload.filePath);");
      lines.push("      await writeFile(upload.filePath, upload.bytes);");
      lines.push("    }");
    }
    lines.push("");
  }

  // Business logic placeholder based on operation type
  lines.push(
    `    // TODO: Implement business logic (migrated from ${analysis.fileName})`,
  );

  // Generate transaction-wrapped or direct Prisma calls
  // When HTTP method is DELETE but SQL operation is not DELETE, treat as DELETE
  // so detectDeletePattern can identify soft-delete vs hard-delete.
  const effectiveOp =
    mapping.method === "DELETE" && op && op.type !== "DELETE"
      ? { ...op, type: "DELETE" as const }
      : op;

  if (txInfo.needed) {
    generateTransactionBody(lines, analysis, txInfo, modelName, hasBody, hasPathParams, pathParams, fileUpload.hasFiles ? "dataWithUploads" : "data", primaryKey);
  } else if (effectiveOp) {
    generateDirectBody(lines, effectiveOp, analysis, modelName, hasBody, hasPathParams, pathParams, fileUpload.hasFiles ? "dataWithUploads" : "data", primaryKey);
  } else {
    lines.push("");
    lines.push(
      '    return NextResponse.json({ success: true });',
    );
  }

  // Error handling
  lines.push("  } catch (error) {");
  if (fileUpload.hasFiles) {
    lines.push("    await Promise.all(uploadedFilePaths.map((filePath) => unlink(filePath).catch(() => undefined)));");
  }
  lines.push("    if (error instanceof z.ZodError) {");
  lines.push(
    "      return NextResponse.json({ errors: error.errors }, { status: 400 });",
  );
  lines.push("    }");
  lines.push(
    '    console.error(`[${request.method} ${request.url}]`, error);',
  );
  lines.push(
    '    return NextResponse.json({ error: "Internal server error" }, { status: 500 });',
  );
  lines.push("  }");
  lines.push("}");

  return lines.join("\n");
}

function generateTransactionBody(
  lines: string[],
  analysis: PhpFileAnalysis,
  txInfo: TransactionInfo,
  modelName: string,
  hasBody: boolean,
  hasPathParams: boolean,
  pathParams: string[],
  dataVariable: string,
  primaryKey: PrimaryKeyInfo | null,
): void {
  if (txInfo.pattern === "parent-child" && txInfo.parentTable && txInfo.childTable) {
    const parentModel = toPrismaModelName(txInfo.parentTable);
    const childModel = toPrismaModelName(txInfo.childTable);

    lines.push("");
    lines.push("    const result = await prisma.$transaction(async (tx) => {");
    lines.push(`      const parent = await tx.${parentModel}.create({`);
    lines.push("        data: {");
    if (hasBody) {
      lines.push(`          ...${dataVariable},`);
    }
    lines.push("        },");
    lines.push("      });");
    lines.push("");
    // If child INSERT was inside a loop, use createMany for batch processing
    const childOpsInLoop = analysis.dbOperations.some(
      (op) => op.type === "INSERT" && op.table === txInfo.childTable && op.inLoop,
    );
    if (childOpsInLoop) {
      lines.push(`      if (Array.isArray(${dataVariable}.items) && ${dataVariable}.items.length > 0) {`);
      lines.push(`        await tx.${childModel}.createMany({`);
      lines.push(`          data: ${dataVariable}.items.map((item: Record<string, unknown>) => ({ ...item, ${txInfo.childFkColumn ?? txInfo.parentTable + "_id"}: parent.id })),`);
      lines.push("        });");
      lines.push("      }");
    } else {
      lines.push(`      await tx.${childModel}.create({`);
      lines.push("        data: {");
      lines.push(`          ${txInfo.childFkColumn ?? txInfo.parentTable + "_id"}: parent.id,`);
      lines.push("        },");
      lines.push("      });");
    }
    lines.push("");
    lines.push("      return parent;");
    lines.push("    });");
    lines.push("");
    lines.push(
      "    return NextResponse.json(jsonSafe(result), { status: 201 });",
    );
  } else if (txInfo.pattern === "check-then-insert") {
    lines.push("");
    lines.push("    const result = await prisma.$transaction(async (tx) => {");
    lines.push(`      const existing = await tx.${modelName}.findFirst({`);
    if (hasPathParams) {
      lines.push(`        where: ${primaryKeyWhere(primaryKey!, pathParams[0]!)},`);
    }
    lines.push("      });");
    lines.push("");
    lines.push(`      const created = await tx.${modelName}.create({`);
    lines.push("        data: {");
    if (hasBody) {
      lines.push(`          ...${dataVariable},`);
    }
    lines.push("        },");
    lines.push("      });");
    lines.push("");
    lines.push("      return created;");
    lines.push("    });");
    lines.push("");
    lines.push(
      "    return NextResponse.json(jsonSafe(result), { status: 201 });",
    );
  } else {
    // Ambiguous pattern
    lines.push(
      "    // TODO: Manual Transaction Adjustment — verify this transaction logic",
    );
    lines.push("");
    lines.push("    const result = await prisma.$transaction(async (tx) => {");

    // Generate a create for each unique insert table
    const inserts = analysis.dbOperations.filter((op) => op.type === "INSERT");
    const seenTables = new Set<string>();
    for (const insert of inserts) {
      if (seenTables.has(insert.table)) continue;
      seenTables.add(insert.table);
      const iModelName = toPrismaModelName(insert.table);
      lines.push(`      await tx.${iModelName}.create({`);
      lines.push("        data: {");
      if (hasBody) {
        lines.push(`          ...${dataVariable},`);
      }
      lines.push("        },");
      lines.push("      });");
      lines.push("");
    }

    lines.push("      return { success: true };");
    lines.push("    });");
    lines.push("");
    lines.push(
      "    return NextResponse.json(jsonSafe(result), { status: 201 });",
    );
  }
}

function generateDirectBody(
  lines: string[],
  op: { type: string; table: string; columns: string[] },
  analysis: PhpFileAnalysis,
  modelName: string,
  hasBody: boolean,
  hasPathParams: boolean,
  pathParams: string[],
  dataVariable: string,
  primaryKey: PrimaryKeyInfo | null,
): void {
  switch (op.type) {
    case "INSERT":
      lines.push(`    const result = await prisma.${modelName}.create({`);
      lines.push("      data: {");
      if (hasBody) {
        lines.push(`        ...${dataVariable},`);
      }
      lines.push("      },");
      lines.push("    });");
      lines.push("");
      lines.push(
        "    return NextResponse.json(jsonSafe(result), { status: 201 });",
      );
      break;

    case "UPDATE":
      lines.push(`    const result = await prisma.${modelName}.update({`);
      if (hasPathParams) {
        lines.push(`      where: ${primaryKeyWhere(primaryKey!, pathParams[0]!)},`);
      } else {
        lines.push(`      where: ${primaryKeyWhere(primaryKey!, `${dataVariable}.update ?? ${dataVariable}[${JSON.stringify(primaryKey!.name)}]`)},`);
      }
      lines.push("      data: {");
      if (hasBody) {
        lines.push(`        ...${dataVariable},`);
      }
      lines.push("      },");
      lines.push("    });");
      lines.push("");
      lines.push("    return NextResponse.json(jsonSafe(result));");
      break;

    case "DELETE": {
      const deletePattern = detectDeletePattern(analysis);
      if (deletePattern.type === "soft-delete" && deletePattern.column) {
        lines.push(`    // Soft-delete: updating ${deletePattern.column} instead of removing record`);
        lines.push(`    const result = await prisma.${modelName}.update({`);
        if (hasPathParams) {
          lines.push(`      where: ${primaryKeyWhere(primaryKey!, pathParams[0]!)},`);
        } else {
          lines.push(`      where: ${primaryKeyWhere(primaryKey!, parsePrimaryKeyExpression(`request.nextUrl.searchParams.get(${JSON.stringify(primaryKey!.name)}) ?? ""`, primaryKey!.type))},`);
        }
        lines.push("      data: {");
        lines.push(`        ${deletePattern.column}: ${deletePattern.value},`);
        lines.push("      },");
        lines.push("    });");
        lines.push("");
        lines.push("    return NextResponse.json(jsonSafe(result));");
      } else {
        // Hard-delete (existing behavior)
        lines.push(`    await prisma.${modelName}.delete({`);
        if (hasPathParams) {
          lines.push(`      where: ${primaryKeyWhere(primaryKey!, pathParams[0]!)},`);
        } else {
          lines.push(`      where: ${primaryKeyWhere(primaryKey!, parsePrimaryKeyExpression(`request.nextUrl.searchParams.get(${JSON.stringify(primaryKey!.name)}) ?? ""`, primaryKey!.type))},`);
        }
        lines.push("    });");
        lines.push("");
        lines.push('    return NextResponse.json({ success: true });');
      }
      break;
    }

    case "SELECT":
      if (hasPathParams) {
        lines.push(`    const result = await prisma.${modelName}.findUnique({`);
        lines.push(`      where: ${primaryKeyWhere(primaryKey!, pathParams[0]!)},`);
        lines.push("    });");
        lines.push("");
        lines.push("    return NextResponse.json(jsonSafe(result));");
      } else {
        lines.push("    const [items, total] = await Promise.all([");
        lines.push(`      prisma.${modelName}.findMany(),`);
        lines.push(`      prisma.${modelName}.count(),`);
        lines.push("    ]);");
        lines.push("");
        lines.push("    return NextResponse.json(jsonSafe({ items, total }));");
      }
      break;
  }
}

// ── Schema-driven GET endpoint generation ──

/**
 * Generate a list (GET /api/{resource}) handler from a DB table definition.
 */
function generateListHandler(table: TableDefinition, resourcePath: string, requireAuth: boolean): string {
  const modelName = toPrismaModelName(table.name);
  const pkColumn = table.columns.find((column) => column.isPrimary)!.name;
  return `import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
${requireAuth ? 'import { requireActiveAccess } from "@/lib/require-active-user";\n' : ""}
${generateJsonSafeHelper()}

${generateBigIntPathParser()}

// TODO: Auto-generated from DB schema — verify business logic
export async function GET(request: NextRequest) {
${authorizationBlock(resourcePath, requireAuth)}  const { searchParams } = request.nextUrl;
  const skip = parseInt(searchParams.get("skip") ?? "0", 10);
  const take = parseInt(searchParams.get("take") ?? "20", 10);

  const [items, total] = await Promise.all([
    prisma.${modelName}.findMany({ skip, take, orderBy: { ${pkColumn}: "desc" } }),
    prisma.${modelName}.count(),
  ]);

  return NextResponse.json(jsonSafe({ items, total, skip, take }));
}

// Schema-driven POST — admin form scaffold posts here. Customize validation.
export async function POST(request: NextRequest) {
${authorizationBlock(resourcePath, requireAuth)}  try {
    const data = ${generateTableWriteSchema(table, false)}.parse(await request.json());
    const created = await prisma.${modelName}.create({ data });
    return NextResponse.json(jsonSafe(created), { status: 201 });
  } catch (error) {
    console.error("[POST /${modelName}]", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
`;
}

/** List handler for composite-key tables (no orderBy — no single PK column). */
function generateListHandlerNoOrder(modelName: string, resourcePath: string, requireAuth: boolean): string {
  return `import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
${requireAuth ? 'import { requireActiveAccess } from "@/lib/require-active-user";\n' : ""}
${generateJsonSafeHelper()}

// TODO: Composite-key table — add explicit orderBy if ordering matters
export async function GET(request: NextRequest) {
${authorizationBlock(resourcePath, requireAuth)}  const { searchParams } = request.nextUrl;
  const skip = parseInt(searchParams.get("skip") ?? "0", 10);
  const take = parseInt(searchParams.get("take") ?? "20", 10);

  const [items, total] = await Promise.all([
    prisma.${modelName}.findMany({ skip, take }),
    prisma.${modelName}.count(),
  ]);

  return NextResponse.json(jsonSafe({ items, total, skip, take }));
}
`;
}

/**
 * Generate a detail (GET /api/{resource}/[id]) handler from a DB table definition.
 */
function generateDetailHandler(table: TableDefinition, resourcePath: string, requireAuth: boolean): string {
  const modelName = toPrismaModelName(table.name);
  const primaryKey = table.columns.find((column) => column.isPrimary)!;
  const pkColumn = primaryKey.name;
  const pkType = primaryKey.type;
  const parseExpr =
    pkType === "Int" ? "parseInt(id, 10)"
    : pkType === "BigInt" ? "parseBigIntPath(id)"
    : "id";
  return `import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
${requireAuth ? 'import { requireActiveAccess } from "@/lib/require-active-user";\n' : ""}
${generateJsonSafeHelper()}

${generateBigIntPathParser()}

// TODO: Auto-generated from DB schema — verify business logic
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
${authorizationBlock(resourcePath, requireAuth)}  const { id } = await params;
  const item = await prisma.${modelName}.findUnique({
    where: { ${pkColumn}: ${parseExpr} },
  });

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(jsonSafe(item));
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
${authorizationBlock(resourcePath, requireAuth)}  try {
    const { id } = await params;
    const data = ${generateTableWriteSchema(table, true)}.parse(await request.json());
    const updated = await prisma.${modelName}.update({
      where: { ${pkColumn}: ${parseExpr} },
      data,
    });
    return NextResponse.json(jsonSafe(updated));
  } catch (error) {
    console.error("[PUT /${modelName}/:id]", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
${authorizationBlock(resourcePath, requireAuth)}  try {
    const { id } = await params;
    await prisma.${modelName}.delete({ where: { ${pkColumn}: ${parseExpr} } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /${modelName}/:id]", error);
    return NextResponse.json({ error: "Not found or conflict" }, { status: 404 });
  }
}
`;
}

/**
 * Generate GET endpoints (list + detail) from DB table definitions.
 * These are schema-driven, not PHP-file-driven.
 *
 * Always generates stubs for each table. The caller handles co-location
 * when a PHP-mapped route already exists at the same path.
 */
function generateGetEndpoints(
  tables: TableDefinition[],
  existingPaths: Set<string>,
  requireAuth: boolean,
): Map<string, string> {
  const getStubs = new Map<string, string>();

  for (const table of tables) {
    const resource = pluralizeResource(table.name);
    const modelName = toPrismaModelName(table.name);
    const pkCol = table.columns.find(c => c.isPrimary);
    // Composite PK tables (@@id([a, b])) have no single isPrimary column.
    // We cannot generate a safe detail GET (requires compound where clause),
    // so emit only a list without orderBy.
    const isCompositeOnly = !pkCol;

    // Only reuse existing file paths if they exactly match the target.
    const existingListPath = [...existingPaths].find(
      p => p === `app/api/${resource}/route.ts`,
    );
    const existingDetailPath = [...existingPaths].find(
      p => p === `app/api/${resource}/[id]/route.ts`,
    );

    const listPath = existingListPath ?? `app/api/${resource}/route.ts`;
    const detailPath = existingDetailPath ?? `app/api/${resource}/[id]/route.ts`;
    const resourcePath = `/${resource}`;

    if (isCompositeOnly) {
      getStubs.set(listPath, generateListHandlerNoOrder(modelName, resourcePath, requireAuth));
      // Skip detail generation for composite-key tables
    } else {
      getStubs.set(listPath, generateListHandler(table, resourcePath, requireAuth));
      getStubs.set(detailPath, generateDetailHandler(table, resourcePath, requireAuth));
    }
  }

  return getStubs;
}

// ── Public API ──

function safeAnalysisSourcePath(analysis: PhpFileAnalysis): string {
  const sourcePath = analysis.sourceRelativePath;
  if (sourcePath && !sourcePath.startsWith("/") && !sourcePath.includes("\\") && sourcePath.split("/").every(part => part && part !== "." && part !== "..")) {
    return sourcePath.replace(/[^a-zA-Z0-9._/-]/g, "_");
  }
  const baseName = analysis.fileName.replace(/\\/g, "/").split("/").pop() || "unknown.php";
  return baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function routeConflictError(
  mapping: RouteMapping,
  analyses: PhpFileAnalysis[],
): Error {
  const fileNames = [...new Set(analyses.map(safeAnalysisSourcePath))].sort();
  return new Error(
    `Conflicting PHP route analyses for ${mapping.method} ${mapping.path}: ${fileNames.join(", ")}. ` +
    "Split the routes or resolve the source mappings before generation.",
  );
}

export interface GenerateApiStubsOptions {
  requireAuth?: boolean;
}

export function generateApiStubs(
  analyses: PhpFileAnalysis[],
  tables?: TableDefinition[],
  options: GenerateApiStubsOptions = {},
): Map<string, string> {
  const requireAuth = options.requireAuth === true;
  const stubs = new Map<string, string>();
  const selected = new Map<string, Array<{ analysis: PhpFileAnalysis; mapping: RouteMapping }>>();

  for (const analysis of analyses) {
    const mapping = inferRouteMapping(analysis);
    const key = `${mapping.path}:${mapping.method}`;
    const entries = selected.get(key) ?? [];
    entries.push({ analysis, mapping });
    selected.set(key, entries);
  }

  for (const entries of selected.values()) {
    if (entries.length > 1) {
      throw routeConflictError(entries[0]!.mapping, entries.map((entry) => entry.analysis));
    }
  }

  const byPath = new Map<string, Array<{ analysis: PhpFileAnalysis; mapping: RouteMapping }>>();
  for (const entriesForMethod of selected.values()) {
    const entry = entriesForMethod[0]!;
    const entries = byPath.get(entry.mapping.path) ?? [];
    entries.push(entry);
    byPath.set(entry.mapping.path, entries);
  }

  const methodOrder: Record<RouteMapping["method"], number> = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };
  for (const path of [...byPath.keys()].sort()) {
    const entries = byPath.get(path)!;
    entries.sort((a, b) => methodOrder[a.mapping.method] - methodOrder[b.mapping.method]);
    const hasFiles = entries.some(({ analysis }) => detectFileUploads(analysis.inputParams).hasFiles);
    const handlers = entries.map(({ analysis, mapping }) => generateRouteHandler(analysis, mapping, tables, false, requireAuth));
    stubs.set(path, [generateRoutePreamble(hasFiles, requireAuth), ...handlers].join("\n\n"));
  }

  // Add schema-driven GET endpoints
  if (tables && tables.length > 0) {
    const existingPaths = new Set(stubs.keys());
    const getStubs = generateGetEndpoints(tables, existingPaths, requireAuth);

    for (const [path, code] of getStubs) {
      const existing = stubs.get(path);
      if (existing) {
        // Co-locate: only append handlers that aren't already present.
        const handlers = ["GET", "POST", "PUT", "DELETE"] as const;
        // Find each handler block in `code` by locating the "export async function X"
        // and taking until the next "export async function Y" or end of string.
        const blocks: Record<string, string> = {};
        for (let i = 0; i < handlers.length; i++) {
          const method = handlers[i]!;
          const startRe = new RegExp(`export async function ${method}\\b`);
          const startMatch = startRe.exec(code);
          if (!startMatch) continue;
          const startIdx = startMatch.index;
          // Find next "export async function" after this one
          const nextRe = /export async function \w+\b/g;
          nextRe.lastIndex = startIdx + startMatch[0].length;
          const nextMatch = nextRe.exec(code);
          const endIdx = nextMatch ? nextMatch.index : code.length;
          blocks[method] = code.slice(startIdx, endIdx).trimEnd();
        }
        let merged = existing;
        for (const method of handlers) {
          if (!blocks[method]) continue;
          const hasExisting = new RegExp(`export async function ${method}\\b`).test(merged);
          if (hasExisting) continue;
          merged = merged.trimEnd() + "\n\n" + blocks[method] + "\n";
        }
        stubs.set(path, merged);
      } else {
        stubs.set(path, code);
      }
    }
  }

  return stubs;
}
