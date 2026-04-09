import { defineCommand } from "citty";
import { consola } from "consola";
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, join, dirname, basename, relative, isAbsolute } from "node:path";
import {
  analyzePhpFile,
  parseSchemaToPrisma,
  generateApiStubs,
  generateAdminScaffold,
  generateAuthScaffold,
  isAuthPluginDetected,
  ADMIN_USER_PRISMA_MODEL,
  generateDockerScaffold,
  resolveTemplate,
  generateRoutesWithAi,
} from "@wp-transfer/analyzer";
import type { PhpFileAnalysis, TableDefinition, AiRouteInput } from "@wp-transfer/analyzer";

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

/** Detect plugins from PHP source (look for plugin-like requires/includes) */
function detectPluginsFromPhp(analyses: PhpFileAnalysis[]): string[] {
  const plugins: string[] = [];
  // Heuristic: if any analysis mentions user/role/auth related operations,
  // treat as having auth plugins. For more accurate detection,
  // we look at file names and DB operations.
  for (const a of analyses) {
    if (a.fileName.includes("user") || a.fileName.includes("login")) {
      plugins.push("wpfront-user-role-editor");
      break;
    }
    for (const op of a.dbOperations) {
      if (op.table.includes("user") || op.table.includes("admin")) {
        plugins.push("wpfront-user-role-editor");
        break;
      }
    }
    if (plugins.length > 0) break;
  }
  return plugins;
}

/** Generate project package.json */
export function generatePackageJson(projectName: string): string {
  return JSON.stringify(
    {
      name: projectName,
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        lint: "next lint",
        test: "playwright test",
        "test:report": "playwright show-report",
        "db:migrate": "prisma migrate dev",
        "db:migrate:deploy": "prisma migrate deploy",
        "db:push": "prisma db push",
        "db:seed": "prisma db seed",
        "db:studio": "prisma studio",
        setup: "prisma migrate dev && prisma db seed",
        verify: "bash scripts/verify.sh",
      },
      dependencies: {
        next: "^15.0.0",
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        "@prisma/client": "^6.0.0",
        "next-auth": "^5.0.0",
        bcryptjs: "^2.4.3",
        zod: "^3.23.0",
      },
      devDependencies: {
        "@types/node": "^22.0.0",
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        "@types/bcryptjs": "^2.4.6",
        typescript: "^5.7.0",
        prisma: "^6.0.0",
        "@playwright/test": "^1.48.0",
        tsx: "^4.21.0",
      },
      prisma: {
        seed: "tsx prisma/seed.ts",
      },
    },
    null,
    2,
  );
}

/** Generate tsconfig.json */
function generateTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: { "@/*": ["./*"] },
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2,
  );
}

/** Generate next.config.ts */
function generateNextConfig(): string {
  return `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
`;
}

/** Generate lib/db.ts (Prisma client) */
function generateDbLib(): string {
  return `import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
`;
}

/** Generate prisma/seed.ts */
function generateSeedScript(
  tables: TableDefinition[],
  hasAuth: boolean,
): string {
  const lines: string[] = [];

  lines.push('import { PrismaClient } from "@prisma/client";');
  if (hasAuth) {
    lines.push('import bcrypt from "bcryptjs";');
  }
  lines.push("");
  lines.push("const prisma = new PrismaClient();");
  lines.push("");
  lines.push("async function main() {");
  lines.push('  console.log("Seeding database...");');
  lines.push("");

  if (hasAuth) {
    lines.push("  // Create admin users");
    lines.push("  const adminPassword = await bcrypt.hash(\"admin123\", 12);");
    lines.push("  const editorPassword = await bcrypt.hash(\"editor123\", 12);");
    lines.push("");
    lines.push("  await prisma.adminUser.upsert({");
    lines.push('    where: { username: "admin" },');
    lines.push("    update: {},");
    lines.push("    create: {");
    lines.push('      username: "admin",');
    lines.push("      password: adminPassword,");
    lines.push('      name: "管理者",');
    lines.push('      role: "administrator",');
    lines.push("    },");
    lines.push("  });");
    lines.push("");
    lines.push("  await prisma.adminUser.upsert({");
    lines.push('    where: { username: "editor" },');
    lines.push("    update: {},");
    lines.push("    create: {");
    lines.push('      username: "editor",');
    lines.push("      password: editorPassword,");
    lines.push('      name: "編集者",');
    lines.push('      role: "editor",');
    lines.push("    },");
    lines.push("  });");
    lines.push("");
    lines.push('  console.log("  Admin users created: admin/admin123, editor/editor123");');
    lines.push("");
  }

  // Sample data for detected tables
  for (const table of tables) {
    const modelName = table.name
      .split("_")
      .map((p, i) =>
        i === 0
          ? p.charAt(0).toLowerCase() + p.slice(1)
          : p.charAt(0).toUpperCase() + p.slice(1),
      )
      .join("");

    const sampleData: Record<string, string> = {};
    for (const col of table.columns) {
      if (col.isPrimary && col.isAutoIncrement) continue;
      if (col.name === "created_at" || col.name === "updated_at") continue;

      switch (col.type) {
        case "String":
          sampleData[col.name] = `"サンプル${col.comment ?? col.name}"`;
          break;
        case "Int":
          sampleData[col.name] = "1";
          break;
        case "Boolean":
          sampleData[col.name] = "true";
          break;
        case "DateTime":
          sampleData[col.name] = "new Date()";
          break;
        case "Float":
          sampleData[col.name] = "0.0";
          break;
        default:
          sampleData[col.name] = `"sample"`;
      }
    }

    if (Object.keys(sampleData).length > 0) {
      lines.push(`  // Sample ${table.name} data`);
      lines.push(`  await prisma.${modelName}.create({`);
      lines.push("    data: {");
      for (const [key, value] of Object.entries(sampleData)) {
        lines.push(`      ${key}: ${value},`);
      }
      lines.push("    },");
      lines.push("  });");
      lines.push(`  console.log("  Sample ${table.name} created");`);
      lines.push("");
    }
  }

  lines.push('  console.log("Seeding complete!");');
  lines.push("}");
  lines.push("");
  lines.push("main()");
  lines.push("  .catch((e) => {");
  lines.push("    console.error(e);");
  lines.push("    process.exit(1);");
  lines.push("  })");
  lines.push("  .finally(async () => {");
  lines.push("    await prisma.$disconnect();");
  lines.push("  });");
  lines.push("");

  return lines.join("\n");
}

/** Write file with automatic directory creation and path traversal protection */
async function writeFileWithDir(filePath: string, content: string, outputDir?: string): Promise<void> {
  if (outputDir) {
    const resolvedOut = resolve(outputDir);
    const resolvedFile = resolve(filePath);
    const rel = relative(resolvedOut, resolvedFile);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      consola.warn(`Skipping file outside output directory: ${filePath}`);
      return;
    }
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

export const analyzePhpCommand = defineCommand({
  meta: {
    name: "analyze-php",
    description:
      "Analyze PHP files for migration to Next.js (Prisma + API routes + admin UI + auth + Docker)",
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
      description: "Output directory for generated Next.js project",
    },
    templates: {
      type: "string",
      description: "Directory with template overrides for scaffold files",
    },
    "ai-assist": {
      type: "boolean",
      default: false,
      description: "Use AI (Claude API) to generate higher-quality API route stubs",
    },
    "ai-model": {
      type: "string",
      default: "",
      description: "AI model to use (default: claude-sonnet-4-20250514)",
    },
  },
  async run({ args }) {
    const dirPath = resolve(args.dir as string);
    const outputDir = resolve(args.output as string);
    const schemaPath = args.schema
      ? resolve(args.schema as string)
      : undefined;
    const templateDir = args.templates as string | undefined;
    const aiAssist = args["ai-assist"] as boolean;
    const aiModel = (args["ai-model"] as string) || undefined;

    // Validate input directory
    if (!existsSync(dirPath)) {
      consola.error(`Directory not found: ${dirPath}`);
      return;
    }

    // Validate template directory if specified
    if (templateDir && (!existsSync(templateDir) || !statSync(templateDir).isDirectory())) {
      consola.error(`Template directory not found: ${templateDir}`);
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
    let tables: TableDefinition[] = [];
    if (schemaPath) {
      if (!existsSync(schemaPath)) {
        consola.warn(`Schema file not found: ${schemaPath}`);
      } else {
        consola.start(`Parsing database schema: ${schemaPath}`);
        const schemaContent = await readFile(schemaPath, "utf-8");
        const result = parseSchemaToPrisma(schemaContent);
        prismaSchema = result.schema;
        tables = result.tables;
        consola.success(
          `Parsed ${result.tables.length} tables from schema documentation`,
        );
      }
    }

    // ── Step 3: Detect plugins from PHP analysis ──
    const detectedPlugins = detectPluginsFromPhp(analyses);
    const hasAuth = isAuthPluginDetected(detectedPlugins);
    if (hasAuth) {
      consola.info("Auth/role plugins detected — generating auth scaffold");
    }

    // ── Step 4: Append AdminUser model to Prisma schema if auth detected ──
    if (prismaSchema && hasAuth) {
      prismaSchema += "\n" + ADMIN_USER_PRISMA_MODEL + "\n";
    }

    // ── Step 5: Generate API route stubs ──
    consola.start("Generating Next.js API route stubs...");
    const stubs = generateApiStubs(custom, tables);
    consola.success(`Generated ${stubs.size} API route stubs`);

    // ── Step 5b: AI-assisted route generation ──
    let aiGeneratedCount = 0;
    let aiFallbackCount = 0;
    let aiTotalTokens = 0;

    if (aiAssist) {
      const apiKey = process.env["ANTHROPIC_API_KEY"];
      // API key is optional — Claude Code CLI auth is primary

      const filesWithOps = custom.filter((a) => a.dbOperations.length > 0);
      if (filesWithOps.length > 0) {
        consola.start(`AI-generating routes for ${filesWithOps.length} PHP files...`);

        const aiInputs: AiRouteInput[] = await Promise.all(
          filesWithOps.map(async (analysis) => {
            const phpSource = await readFile(join(dirPath, analysis.fileName), "utf-8");
            const matchingStubEntry = [...stubs.entries()].find(([path]) =>
              path.includes(analysis.fileName.replace(/\.php$/, "")),
            );
            return {
              phpSource,
              phpFilePath: analysis.fileName,
              prismaSchema: prismaSchema ?? "",
              staticAnalysis: {
                dbOperations: analysis.dbOperations.map((op) => ({
                  type: op.type,
                  table: op.table,
                  columns: op.columns,
                })),
                inputParams: analysis.inputParams.map((p) => ({
                  name: p.name,
                  source: p.source,
                })),
              },
              existingRoute: matchingStubEntry?.[1],
            };
          }),
        );

        const aiResult = await generateRoutesWithAi(aiInputs, {
          apiKey,
          ...(aiModel ? { model: aiModel } : {}),
        });

        aiTotalTokens = aiResult.totalTokens;
        aiFallbackCount = aiResult.failures.length;
        aiGeneratedCount = aiResult.results.length - aiFallbackCount;

        // Replace static stubs with AI-generated routes
        for (const result of aiResult.results) {
          stubs.set(result.routePath, result.content);
        }

        consola.success(
          `AI generation complete: ${aiGeneratedCount} AI-generated, ${aiFallbackCount} fallback, ${aiTotalTokens} tokens used`,
        );
      }
    }

    // ── Step 6: Generate admin pages ──
    consola.start("Generating admin page scaffolds...");
    const adminPages = generateAdminScaffold(analyses, tables);
    consola.success(`Generated ${adminPages.length} admin pages`);

    // ── Step 7: Generate auth scaffold ──
    const authFiles = generateAuthScaffold(detectedPlugins);
    if (authFiles.length > 0) {
      consola.success(`Generated ${authFiles.length} auth files`);
    }

    // ── Step 8: Generate Docker scaffold ──
    const projectName = basename(outputDir);
    consola.start("Generating Docker scaffold...");
    const dockerFiles = generateDockerScaffold(projectName, "mysql");
    consola.success(`Generated ${dockerFiles.length} Docker files`);

    // ── Step 9: Write all outputs ──
    await mkdir(outputDir, { recursive: true });
    let totalFiles = 0;

    // analysis.json
    const analysisPath = join(outputDir, "analysis.json");
    await writeFile(analysisPath, JSON.stringify(analyses, null, 2), "utf-8");
    totalFiles++;

    // schema.prisma
    if (prismaSchema) {
      const prismaDir = join(outputDir, "prisma");
      await mkdir(prismaDir, { recursive: true });
      await writeFile(join(prismaDir, "schema.prisma"), prismaSchema, "utf-8");
      totalFiles++;
    }

    // API route stubs
    for (const [routePath, content] of stubs) {
      const resolved = await resolveTemplate(templateDir, { path: routePath, content });
      const fullPath = join(outputDir, routePath);
      await writeFileWithDir(fullPath, resolved, outputDir);
      totalFiles++;
    }

    // Admin pages
    for (const page of adminPages) {
      const content = await resolveTemplate(templateDir, page);
      const fullPath = join(outputDir, page.path);
      await writeFileWithDir(fullPath, content, outputDir);
      totalFiles++;
    }

    // Auth files
    for (const file of authFiles) {
      const content = await resolveTemplate(templateDir, file);
      const fullPath = join(outputDir, file.path);
      await writeFileWithDir(fullPath, content, outputDir);
      totalFiles++;
    }

    // Docker files
    for (const file of dockerFiles) {
      const content = await resolveTemplate(templateDir, file);
      const fullPath = join(outputDir, file.path);
      await writeFileWithDir(fullPath, content, outputDir);
      totalFiles++;
    }

    // Project files
    await writeFile(
      join(outputDir, "package.json"),
      generatePackageJson(projectName),
      "utf-8",
    );
    totalFiles++;

    await writeFile(
      join(outputDir, "tsconfig.json"),
      generateTsConfig(),
      "utf-8",
    );
    totalFiles++;

    await writeFile(
      join(outputDir, "next.config.ts"),
      generateNextConfig(),
      "utf-8",
    );
    totalFiles++;

    await writeFileWithDir(
      join(outputDir, "lib/db.ts"),
      generateDbLib(),
      outputDir,
    );
    totalFiles++;

    // Seed script
    await writeFileWithDir(
      join(outputDir, "prisma/seed.ts"),
      generateSeedScript(tables, hasAuth),
      outputDir,
    );
    totalFiles++;

    // report.md
    const reportPath = join(outputDir, "report.md");
    const report = generateMigrationReport(analyses, custom, stubs, prismaSchema, adminPages.length, authFiles.length, dockerFiles.length);
    await writeFile(reportPath, report, "utf-8");
    totalFiles++;

    // Summary
    const securityCount = custom.reduce(
      (sum, a) => sum + a.securityIssues.length,
      0,
    );
    const summaryLines = [
      `PHP Files Analyzed: ${analyses.length}`,
      `Files with DB Operations: ${custom.length}`,
      `API Routes Generated: ${stubs.size}`,
      `Admin Pages Generated: ${adminPages.length}`,
      `Auth Files Generated: ${authFiles.length}`,
      `Docker Files Generated: ${dockerFiles.length}`,
      `Security Issues Found: ${securityCount}`,
      prismaSchema
        ? `Prisma Schema: Generated (with${hasAuth ? "" : "out"} AdminUser)`
        : `Prisma Schema: Skipped (no --schema)`,
    ];
    if (aiAssist) {
      summaryLines.push(`AI-Generated Routes: ${aiGeneratedCount}`);
      summaryLines.push(`AI Fallback Routes: ${aiFallbackCount}`);
      summaryLines.push(`AI Tokens Used: ${aiTotalTokens}`);
    }
    summaryLines.push(`Total Files Written: ${totalFiles}`);
    summaryLines.push(`Output: ${outputDir}`);
    consola.box(summaryLines.join("\n"));
  },
});

// ── Report generator ──

function generateMigrationReport(
  allAnalyses: PhpFileAnalysis[],
  customAnalyses: PhpFileAnalysis[],
  stubs: Map<string, string>,
  prismaSchema?: string,
  adminPageCount = 0,
  authFileCount = 0,
  dockerFileCount = 0,
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
  lines.push(`- **Admin pages generated**: ${adminPageCount}`);
  lines.push(`- **Auth files generated**: ${authFileCount}`);
  lines.push(`- **Docker files generated**: ${dockerFileCount}`);
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
