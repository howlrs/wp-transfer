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
import { toPrismaModelName, toPascalModelName, toSchemaName } from "./generator-utils.js";

// ── Route mapping ──

interface RouteMapping {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
}

const PHP_TO_ROUTE: Record<string, RouteMapping> = {
  "insert.php": { path: "app/api/events/route.ts", method: "POST" },
  "update.php": { path: "app/api/events/[id]/route.ts", method: "PUT" },
  "delete.php": { path: "app/api/events/[id]/route.ts", method: "DELETE" },
  "event-copy.php": {
    path: "app/api/events/[id]/copy/route.ts",
    method: "POST",
  },
  "event-stop.php": {
    path: "app/api/events/[id]/stop/route.ts",
    method: "POST",
  },
  "event-restoration.php": {
    path: "app/api/events/[id]/restore/route.ts",
    method: "POST",
  },
  "insert_event_slot.php": {
    path: "app/api/events/[id]/slots/route.ts",
    method: "POST",
  },
  "event-slot-update.php": {
    path: "app/api/events/[id]/slots/[slotId]/route.ts",
    method: "PUT",
  },
  "event-slot-delete.php": {
    path: "app/api/events/[id]/slots/[slotId]/route.ts",
    method: "DELETE",
  },
  "lottery-update.php": {
    path: "app/api/lottery/[id]/route.ts",
    method: "PUT",
  },
  "insert_information.php": {
    path: "app/api/information/route.ts",
    method: "POST",
  },
  "information-update.php": {
    path: "app/api/information/[id]/route.ts",
    method: "PUT",
  },
  "information-text-update.php": {
    path: "app/api/information/[id]/text/route.ts",
    method: "PUT",
  },
  "information-banner-update.php": {
    path: "app/api/information/[id]/banner/route.ts",
    method: "PUT",
  },
  "information-banner-in.php": {
    path: "app/api/information/[id]/banner/enable/route.ts",
    method: "POST",
  },
  "information-banner-out.php": {
    path: "app/api/information/[id]/banner/disable/route.ts",
    method: "POST",
  },
  "information-text-in.php": {
    path: "app/api/information/[id]/text/enable/route.ts",
    method: "POST",
  },
  "information-text-out.php": {
    path: "app/api/information/[id]/text/disable/route.ts",
    method: "POST",
  },
  "user-blacklist.php": {
    path: "app/api/users/[id]/blacklist/route.ts",
    method: "POST",
  },
  "user-blacklist-out.php": {
    path: "app/api/users/[id]/blacklist/route.ts",
    method: "DELETE",
  },
};

// ── Zod type inference context ──

interface ZodTypeContext {
  tables?: TableDefinition[];
  primaryTable?: string;
}

/**
 * Check if a param name matches a boolean-like pattern:
 * cancel_mode, preview_mode, *_flg, blacklist
 */
function isBooleanLikeParam(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === "cancel_mode" ||
    lower === "preview_mode" ||
    lower.endsWith("_flg") ||
    lower === "blacklist"
  );
}

/**
 * Check if a param name matches a non-negative numeric pattern:
 * *_limit, *_probability, *_current, *_counter
 */
function isNonNegativeNumericParam(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith("_limit") ||
    lower.endsWith("_probability") ||
    lower.endsWith("_current") ||
    lower.endsWith("_counter")
  );
}

/**
 * Check if a param name matches an enum-like numeric pattern:
 * *_type, *_mode, *_status (but NOT cancel_mode or preview_mode)
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

  // 1. Array params
  if (param.name.endsWith("[]")) {
    return "z.array(z.string())";
  }

  // 2. Boolean-like names (cancel_mode, preview_mode, *_flg, blacklist)
  if (isBooleanLikeParam(baseName)) {
    return 'z.preprocess((v) => v === "1" || v === 1 || v === true, z.boolean())';
  }

  // 3. DB schema Boolean type (from tinyint(1))
  const colDef = findColumnDef(baseName, ctx);
  if (colDef?.type === "Boolean") {
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

  // 7. DB schema nullable String → empty string to undefined preprocess
  if (colDef?.type === "String" && colDef.nullable) {
    return 'z.preprocess((v) => v === "" ? undefined : v, z.string().optional())';
  }

  // Other numeric-like names (disp, number, information, banner, invalid, etc.)
  if (
    baseName.includes("number") ||
    baseName.includes("disp") ||
    baseName === "information" ||
    baseName === "banner" ||
    baseName === "invalid"
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
  const bodyParams = params.filter((p) => p.source !== "$_FILES");

  if (bodyParams.length === 0) {
    return `const ${schemaName} = z.object({});`;
  }

  const optionalSuffix = options?.partial ? ".optional()" : "";
  const fields = bodyParams
    .map((p) => {
      // Strip [] from field name for the schema key
      const fieldName = p.name.replace(/\[\]$/, "");
      return `  ${fieldName}: ${inferZodType(p, ctx)}${optionalSuffix},`;
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

      // Check if tableB has a column referencing tableA (e.g., event_id in event_slot)
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
  const softDeleteColumns = ["status", "is_active", "is_deleted", "deleted_at", "blacklist", "invalid"];
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

function generateRouteHandler(
  analysis: PhpFileAnalysis,
  mapping: RouteMapping,
  tables?: TableDefinition[],
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

  // Zod type context
  const ctx: ZodTypeContext = { tables, primaryTable };

  // Build handler body
  // SQL DELETE operations never need a request body — the id comes from the URL param only.
  const primaryOpType = analysis.dbOperations.length > 0 ? analysis.dbOperations[0]!.type : null;
  const isDeleteOp = primaryOpType === "DELETE";
  const bodyParams = isDeleteOp ? [] : params.filter((p) => p.source !== "$_FILES");
  const hasBody = bodyParams.length > 0;

  // File upload detection
  const fileUpload = detectFileUploads(params);

  // Transaction detection
  const txInfo = detectTransaction(analysis);

  const lines: string[] = [];

  // Imports
  lines.push('import { NextRequest, NextResponse } from "next/server";');
  lines.push('import { z } from "zod";');
  lines.push('import { prisma } from "@/lib/db";');
  if (fileUpload.hasFiles) {
    lines.push('import { writeFile, mkdir } from "node:fs/promises";');
    lines.push('import path from "node:path";');
  }
  lines.push("");

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
  lines.push("  try {");

  // Parse path params
  if (hasPathParams) {
    lines.push("    const resolvedParams = await params;");
    for (const p of pathParams) {
      lines.push(
        `    const ${p} = parseInt(resolvedParams.${p}, 10);`,
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
      for (const fp of fileUpload.fileParams) {
        lines.push(
          `    const ${fp.name} = formData.get("${fp.name}") as File | null;`,
        );
      }

      // Generate file save logic
      lines.push("");
      lines.push('    const uploadDir = path.join(process.cwd(), "public/uploads");');
      lines.push("    await mkdir(uploadDir, { recursive: true });");
      lines.push("");
      for (const fp of fileUpload.fileParams) {
        lines.push(`    let ${fp.name}Path: string | null = null;`);
        lines.push(`    if (${fp.name}) {`);
        lines.push(
          `      const bytes = new Uint8Array(await ${fp.name}.arrayBuffer());`,
        );
        lines.push(
          `      ${fp.name}Path = path.join(uploadDir, ${fp.name}.name);`,
        );
        lines.push(
          `      await writeFile(${fp.name}Path, bytes);`,
        );
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
    lines.push("");
  }

  // Business logic placeholder based on operation type
  const op =
    analysis.dbOperations.length > 0 ? analysis.dbOperations[0] : null;

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
    generateTransactionBody(lines, analysis, txInfo, modelName, hasBody, hasPathParams, pathParams);
  } else if (effectiveOp) {
    generateDirectBody(lines, effectiveOp, analysis, modelName, hasBody, hasPathParams, pathParams);
  } else {
    lines.push("");
    lines.push(
      '    return NextResponse.json({ success: true });',
    );
  }

  // Error handling
  lines.push("  } catch (error) {");
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
): void {
  if (txInfo.pattern === "parent-child" && txInfo.parentTable && txInfo.childTable) {
    const parentModel = toPrismaModelName(txInfo.parentTable);
    const childModel = toPrismaModelName(txInfo.childTable);

    lines.push("");
    lines.push("    const result = await prisma.$transaction(async (tx) => {");
    lines.push(`      const parent = await tx.${parentModel}.create({`);
    lines.push("        data: {");
    if (hasBody) {
      lines.push("          ...data,");
    }
    lines.push("        },");
    lines.push("      });");
    lines.push("");
    // If child INSERT was inside a loop, use createMany for batch processing
    const childOpsInLoop = analysis.dbOperations.some(
      (op) => op.type === "INSERT" && op.table === txInfo.childTable && op.inLoop,
    );
    if (childOpsInLoop) {
      lines.push(`      await tx.${childModel}.createMany({`);
      lines.push("        data: data.items, // TODO: Extract array field from request body");
      lines.push("      });");
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
      "    return NextResponse.json(result, { status: 201 });",
    );
  } else if (txInfo.pattern === "check-then-insert") {
    lines.push("");
    lines.push("    const result = await prisma.$transaction(async (tx) => {");
    lines.push(`      const existing = await tx.${modelName}.findFirst({`);
    if (hasPathParams) {
      lines.push(`        where: { id: ${pathParams[0]} },`);
    }
    lines.push("      });");
    lines.push("");
    lines.push(`      const created = await tx.${modelName}.create({`);
    lines.push("        data: {");
    if (hasBody) {
      lines.push("          ...data,");
    }
    lines.push("        },");
    lines.push("      });");
    lines.push("");
    lines.push("      return created;");
    lines.push("    });");
    lines.push("");
    lines.push(
      "    return NextResponse.json(result, { status: 201 });",
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
        lines.push("          ...data,");
      }
      lines.push("        },");
      lines.push("      });");
      lines.push("");
    }

    lines.push("      return { success: true };");
    lines.push("    });");
    lines.push("");
    lines.push(
      "    return NextResponse.json(result, { status: 201 });",
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
): void {
  switch (op.type) {
    case "INSERT":
      lines.push(`    const result = await prisma.${modelName}.create({`);
      lines.push("      data: {");
      if (hasBody) {
        lines.push("        ...data,");
      }
      lines.push("      },");
      lines.push("    });");
      lines.push("");
      lines.push(
        "    return NextResponse.json(result, { status: 201 });",
      );
      break;

    case "UPDATE":
      lines.push(`    const result = await prisma.${modelName}.update({`);
      if (hasPathParams) {
        lines.push(`      where: { id: ${pathParams[0]} },`);
      } else {
        lines.push("      where: { id: data.update ?? data.id },");
      }
      lines.push("      data: {");
      if (hasBody) {
        lines.push("        ...data,");
      }
      lines.push("      },");
      lines.push("    });");
      lines.push("");
      lines.push("    return NextResponse.json(result);");
      break;

    case "DELETE": {
      const deletePattern = detectDeletePattern(analysis);
      if (deletePattern.type === "soft-delete" && deletePattern.column) {
        lines.push(`    // Soft-delete: updating ${deletePattern.column} instead of removing record`);
        lines.push(`    const result = await prisma.${modelName}.update({`);
        if (hasPathParams) {
          lines.push(`      where: { id: ${pathParams[0]} },`);
        } else {
          lines.push("      where: { id: parseInt(request.nextUrl.searchParams.get('id') ?? '0') },");
        }
        lines.push("      data: {");
        lines.push(`        ${deletePattern.column}: ${deletePattern.value},`);
        lines.push("      },");
        lines.push("    });");
        lines.push("");
        lines.push("    return NextResponse.json(result);");
      } else {
        // Hard-delete (existing behavior)
        lines.push(`    await prisma.${modelName}.delete({`);
        if (hasPathParams) {
          lines.push(`      where: { id: ${pathParams[0]} },`);
        } else {
          lines.push("      where: { id: parseInt(request.nextUrl.searchParams.get('id') ?? '0') },");
        }
        lines.push("    });");
        lines.push("");
        lines.push('    return NextResponse.json({ success: true });');
      }
      break;
    }

    case "SELECT":
      lines.push(`    const result = await prisma.${modelName}.findUnique({`);
      if (hasPathParams) {
        lines.push(`      where: { id: ${pathParams[0]} },`);
      }
      lines.push("    });");
      lines.push("");
      lines.push("    return NextResponse.json(result);");
      break;
  }
}

// ── Schema-driven GET endpoint generation ──

/**
 * Generate a list (GET /api/{resource}) handler from a DB table definition.
 */
function generateListHandler(modelName: string): string {
  return `import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// TODO: Auto-generated from DB schema — verify business logic
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const skip = parseInt(searchParams.get("skip") ?? "0", 10);
  const take = parseInt(searchParams.get("take") ?? "20", 10);

  const [items, total] = await Promise.all([
    prisma.${modelName}.findMany({ skip, take, orderBy: { id: "desc" } }),
    prisma.${modelName}.count(),
  ]);

  return NextResponse.json({ items, total, skip, take });
}
`;
}

/**
 * Generate a detail (GET /api/{resource}/[id]) handler from a DB table definition.
 */
function generateDetailHandler(modelName: string): string {
  return `import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// TODO: Auto-generated from DB schema — verify business logic
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = await prisma.${modelName}.findUnique({
    where: { id: parseInt(id, 10) },
  });

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(item);
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
): Map<string, string> {
  const getStubs = new Map<string, string>();

  for (const table of tables) {
    const resource = table.name;
    const modelName = toPrismaModelName(resource);
    const listPath = `app/api/${resource}/route.ts`;
    const detailPath = `app/api/${resource}/[id]/route.ts`;

    getStubs.set(listPath, generateListHandler(modelName));
    getStubs.set(detailPath, generateDetailHandler(modelName));
  }

  return getStubs;
}

// ── Public API ──

export function generateApiStubs(
  analyses: PhpFileAnalysis[],
  tables?: TableDefinition[],
): Map<string, string> {
  const stubs = new Map<string, string>();

  for (const analysis of analyses) {
    const mapping = PHP_TO_ROUTE[analysis.fileName];
    if (!mapping) continue;

    const existing = stubs.get(mapping.path);
    const stub = generateRouteHandler(analysis, mapping, tables);

    if (existing) {
      // Merge multiple handlers into the same route file:
      // Capture the schema definition (if present) AND the export function,
      // skipping only the duplicate import lines at the top.
      const schemaAndFuncMatch = stub.match(/((?:const \w+Schema\s*=[\s\S]*?\n\n)?export async function \w+[\s\S]*$)/);
      if (schemaAndFuncMatch) {
        stubs.set(mapping.path, existing + "\n\n" + schemaAndFuncMatch[1]);
      } else {
        stubs.set(mapping.path, existing + "\n\n" + stub);
      }
    } else {
      stubs.set(mapping.path, stub);
    }
  }

  // Add schema-driven GET endpoints
  if (tables && tables.length > 0) {
    const getStubs = generateGetEndpoints(tables);

    for (const [path, code] of getStubs) {
      const existing = stubs.get(path);
      if (existing) {
        // Co-locate: append GET handler to existing route file
        const funcMatch = code.match(/(export async function GET[\s\S]*$)/);
        if (funcMatch) {
          stubs.set(path, existing + "\n\n" + funcMatch[1]);
        }
      } else {
        stubs.set(path, code);
      }
    }
  }

  return stubs;
}
