import { defineCommand } from "citty";
import { consola } from "consola";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  analyzePhpFile,
  parseSchemaToPrisma,
  generateApiStubs,
} from "@wp-transfer/analyzer";
import type { PhpFileAnalysis } from "@wp-transfer/analyzer";

async function analyzePhpDirectory(dirPath: string): Promise<PhpFileAnalysis[]> {
  const entries = await readdir(dirPath);
  const phpFiles = entries.filter((f: string) => f.endsWith(".php")).sort();

  const results: PhpFileAnalysis[] = [];
  for (const file of phpFiles) {
    const content = await readFile(join(dirPath, file), "utf-8");
    results.push(analyzePhpFile(content, file));
  }
  return results;
}

export const analyzePhpCommand = defineCommand({
  meta: {
    name: "analyze-php",
    description:
      "Analyze PHP files for migration to Next.js (Prisma + API routes)",
  },
  args: {
    dir: {
      type: "positional",
      required: true,
      description: "Directory containing PHP files to analyze",
    },
    schema: {
      type: "string",
      description: "Path to database.md schema documentation",
    },
    output: {
      type: "string",
      default: "./output/php-analysis",
      description: "Output directory for generated files",
    },
  },
  async run({ args }) {
    const dirPath = resolve(args.dir as string);
    const outputDir = resolve(args.output as string);
    const schemaPath = args.schema
      ? resolve(args.schema as string)
      : undefined;

    // Validate input directory
    if (!existsSync(dirPath)) {
      consola.error(`Directory not found: ${dirPath}`);
      return;
    }

    // ── Step 1: Analyze PHP files ──
    consola.start(`Scanning PHP files in: ${dirPath}`);
    const analyses = await analyzePhpDirectory(dirPath);

    const custom = analyses.filter(
      (a) =>
        a.dbOperations.length > 0 ||
        a.inputParams.length > 0,
    );
    consola.success(
      `Found ${analyses.length} PHP files (${custom.length} with DB operations or input params)`,
    );

    // ── Step 2: Parse DB schema if provided ──
    let prismaSchema: string | undefined;
    if (schemaPath) {
      if (!existsSync(schemaPath)) {
        consola.warn(`Schema file not found: ${schemaPath}`);
      } else {
        consola.start(`Parsing database schema: ${schemaPath}`);
        const schemaContent = await readFile(schemaPath, "utf-8");
        const result = parseSchemaToPrisma(schemaContent);
        prismaSchema = result.schema;
        consola.success(
          `Parsed ${result.tables.length} tables from schema documentation`,
        );
      }
    }

    // ── Step 3: Generate API route stubs ──
    consola.start("Generating Next.js API route stubs...");
    const stubs = generateApiStubs(custom);
    consola.success(`Generated ${stubs.size} API route stubs`);

    // ── Step 4: Write outputs ──
    await mkdir(outputDir, { recursive: true });

    // analysis.json
    const analysisPath = join(outputDir, "analysis.json");
    await writeFile(analysisPath, JSON.stringify(analyses, null, 2), "utf-8");
    consola.success(`Written: ${analysisPath}`);

    // schema.prisma
    if (prismaSchema) {
      const prismaPath = join(outputDir, "schema.prisma");
      await writeFile(prismaPath, prismaSchema, "utf-8");
      consola.success(`Written: ${prismaPath}`);
    }

    // API route stubs
    const apiDir = join(outputDir, "api");
    for (const [routePath, content] of stubs) {
      const fullPath = join(apiDir, routePath);
      await mkdir(join(fullPath, ".."), { recursive: true });
      await writeFile(fullPath, content, "utf-8");
    }
    consola.success(`Written: ${stubs.size} files under ${apiDir}`);

    // report.md
    const reportPath = join(outputDir, "report.md");
    const report = generateMigrationReport(analyses, custom, stubs, prismaSchema);
    await writeFile(reportPath, report, "utf-8");
    consola.success(`Written: ${reportPath}`);

    // Summary
    const securityCount = custom.reduce(
      (sum, a) => sum + a.securityIssues.length,
      0,
    );
    consola.box(
      [
        `PHP Files Analyzed: ${analyses.length}`,
        `Files with DB Operations: ${custom.length}`,
        `API Routes Generated: ${stubs.size}`,
        `Security Issues Found: ${securityCount}`,
        prismaSchema
          ? `Prisma Schema: Generated`
          : `Prisma Schema: Skipped (no --schema)`,
        `Output: ${outputDir}`,
      ].join("\n"),
    );
  },
});

// ── Report generator ──

function generateMigrationReport(
  allAnalyses: PhpFileAnalysis[],
  customAnalyses: PhpFileAnalysis[],
  stubs: Map<string, string>,
  prismaSchema?: string,
): string {
  const lines: string[] = [];

  lines.push("# PHP to Next.js Migration Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Total PHP files scanned**: ${allAnalyses.length}`);
  lines.push(
    `- **Files with DB operations / input params**: ${customAnalyses.length}`,
  );
  lines.push(`- **API routes generated**: ${stubs.size}`);
  lines.push(
    `- **Prisma schema**: ${prismaSchema ? "Generated" : "Not generated"}`,
  );
  lines.push("");

  // Security issues
  const filesWithIssues = customAnalyses.filter(
    (a) => a.securityIssues.length > 0,
  );
  if (filesWithIssues.length > 0) {
    lines.push("## Security Issues");
    lines.push("");
    for (const analysis of filesWithIssues) {
      lines.push(`### ${analysis.fileName}`);
      for (const issue of analysis.securityIssues) {
        lines.push(`- ${issue}`);
      }
      lines.push("");
    }
  }

  // File-by-file analysis
  lines.push("## File Analysis");
  lines.push("");

  for (const analysis of customAnalyses) {
    lines.push(`### ${analysis.fileName}`);
    lines.push("");
    lines.push(`**Purpose**: ${analysis.purpose}`);
    lines.push(`**Output**: ${analysis.outputType}`);
    if (analysis.redirectTarget) {
      lines.push(`**Redirect**: ${analysis.redirectTarget}`);
    }
    lines.push("");

    if (analysis.dbOperations.length > 0) {
      lines.push("**Database Operations**:");
      for (const op of analysis.dbOperations) {
        const cols =
          op.columns.length > 0 ? ` (${op.columns.join(", ")})` : "";
        lines.push(`- ${op.type} ${op.table}${cols}`);
      }
      lines.push("");
    }

    if (analysis.inputParams.length > 0) {
      lines.push("**Input Parameters**:");
      for (const param of analysis.inputParams) {
        lines.push(`- \`${param.source}["${param.name}"]\``);
      }
      lines.push("");
    }
  }

  // Route mapping
  lines.push("## Route Mapping");
  lines.push("");
  lines.push("| PHP File | Next.js Route | Method |");
  lines.push("|----------|--------------|--------|");
  for (const [routePath] of stubs) {
    // Find the analysis that maps to this route
    const matchingAnalysis = customAnalyses.find((a) => {
      const route = routePath;
      return route.includes(a.fileName.replace(/\.php$/, ""));
    });
    const phpFile = matchingAnalysis?.fileName ?? "multiple";
    const method = routePath.includes("[id]") ? "varies" : "POST";
    lines.push(`| ${phpFile} | \`${routePath}\` | ${method} |`);
  }
  lines.push("");

  // Skipped files
  const skipped = allAnalyses.filter(
    (a) => a.dbOperations.length === 0 && a.inputParams.length === 0,
  );
  if (skipped.length > 0) {
    lines.push("## Skipped Files (no DB operations or input params)");
    lines.push("");
    for (const s of skipped) {
      lines.push(`- ${s.fileName}: ${s.purpose}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
