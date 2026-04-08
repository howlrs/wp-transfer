/**
 * Generate Next.js App Router API route stubs from PHP file analysis.
 *
 * Maps PHP filenames to RESTful Next.js API routes with Zod validation
 * and Prisma ORM integration.
 */
import type { PhpFileAnalysis, InputParam } from "./php-analyzer.js";

// ── Route mapping ──

interface RouteMapping {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
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

// ── Helpers ──

function toSchemaName(fileName: string): string {
  const base = fileName.replace(/\.php$/, "");
  // Convert kebab-case / snake_case to PascalCase and append "Schema"
  const pascal = base
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  return `${pascal}Schema`;
}

function inferZodType(param: InputParam): string {
  const name = param.name.toLowerCase();

  // ID fields
  if (name === "id" || name.endsWith("_id") || name === "update" || name === "delete") {
    return "z.coerce.number().int()";
  }

  // Numeric flag/mode fields
  if (
    name.includes("mode") ||
    name.includes("type") ||
    name.includes("status") ||
    name.includes("limit") ||
    name.includes("number") ||
    name.includes("probability") ||
    name.includes("counter") ||
    name.includes("current") ||
    name.includes("disp") ||
    name === "cancel_mode" ||
    name === "preview_mode" ||
    name === "information" ||
    name === "banner" ||
    name === "blacklist" ||
    name === "invalid"
  ) {
    return "z.coerce.number().int()";
  }

  // DateTime fields
  if (
    name.includes("time") ||
    name.includes("date") ||
    name.includes("_at")
  ) {
    return "z.string()";
  }

  // URL fields
  if (name.includes("link") || name.includes("url")) {
    return "z.string().url().optional()";
  }

  // Text fields
  return "z.string()";
}

function generateZodSchema(
  schemaName: string,
  params: InputParam[],
): string {
  // Exclude file params and array params (those with [] brackets)
  const bodyParams = params.filter(
    (p) => p.source !== "$_FILES" && !p.name.includes("["),
  );

  if (bodyParams.length === 0) {
    return `const ${schemaName} = z.object({});`;
  }

  const fields = bodyParams
    .map((p) => `  ${p.name}: ${inferZodType(p)},`)
    .join("\n");

  return `const ${schemaName} = z.object({\n${fields}\n});`;
}

function generateRouteHandler(
  analysis: PhpFileAnalysis,
  mapping: RouteMapping,
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
  const modelName = primaryTable
    .split("_")
    .map((p) => p.charAt(0).toLowerCase() + p.slice(1))
    .join("");

  // Build handler body
  const bodyParams = params.filter(
    (p) => p.source !== "$_FILES" && !p.name.includes("["),
  );
  const hasBody = bodyParams.length > 0 && mapping.method !== "DELETE";
  const hasFiles = params.some((p) => p.source === "$_FILES");

  const lines: string[] = [];

  // Imports
  lines.push('import { NextRequest, NextResponse } from "next/server";');
  lines.push('import { z } from "zod";');
  lines.push('import { prisma } from "@/lib/db";');
  lines.push("");

  // Zod schema
  if (hasBody) {
    lines.push(generateZodSchema(schemaName, params));
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

  // Parse body
  if (hasBody) {
    if (hasFiles) {
      lines.push("    const formData = await request.formData();");
      lines.push(
        "    // TODO: Handle file uploads from formData",
      );
      lines.push(
        "    const body = Object.fromEntries(formData.entries());",
      );
    } else {
      lines.push("    const body = await request.json();");
    }
    lines.push(`    const data = ${schemaName}.parse(body);`);
    lines.push("");
  }

  // Business logic placeholder based on operation type
  const op =
    analysis.dbOperations.length > 0 ? analysis.dbOperations[0] : null;

  if (op) {
    lines.push(
      `    // TODO: Implement business logic (migrated from ${analysis.fileName})`,
    );

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

      case "DELETE":
        lines.push(`    await prisma.${modelName}.delete({`);
        if (hasPathParams) {
          lines.push(`      where: { id: ${pathParams[0]} },`);
        } else {
          lines.push("      where: { id: data.delete ?? data.id },");
        }
        lines.push("    });");
        lines.push("");
        lines.push(
          "    return NextResponse.json({ success: true });",
        );
        break;

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
  } else {
    lines.push(
      `    // TODO: Implement business logic (migrated from ${analysis.fileName})`,
    );
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

// ── Public API ──

export function generateApiStubs(
  analyses: PhpFileAnalysis[],
): Map<string, string> {
  const stubs = new Map<string, string>();

  for (const analysis of analyses) {
    const mapping = PHP_TO_ROUTE[analysis.fileName];
    if (!mapping) continue;

    const existing = stubs.get(mapping.path);
    const stub = generateRouteHandler(analysis, mapping);

    if (existing) {
      // Merge multiple handlers into the same route file
      stubs.set(mapping.path, existing + "\n\n" + stub);
    } else {
      stubs.set(mapping.path, stub);
    }
  }

  return stubs;
}
