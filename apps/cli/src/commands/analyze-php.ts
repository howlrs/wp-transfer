import { defineCommand } from "citty";
import { consola } from "consola";
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile, mkdir, readdir, lstat, realpath } from "node:fs/promises";
import { resolve, join, dirname, basename, relative, isAbsolute, sep } from "node:path";
import { scanForSecrets } from "@wp-transfer/core";
import type { SecretMatch } from "@wp-transfer/core";
import {
  analyzePhpFile,
  parseSchemaToPrisma,
  generatePrismaSchema,
  generateApiStubs,
  generateAdminScaffold,
  generateAuthScaffold,
  isAuthPluginDetected,
  ADMIN_USER_PRISMA_MODEL,
  generateDockerScaffold,
  resolveTemplate,
  generateRoutesWithAi,
  hasActiveAccessGuard,
  inferRouteMapping,
  routeResourcePath,
  runPreflightChecks,
  formatPreflightReport,
  loadMigrationConfig,
  generateMigrationDashboard,
  generateVerifyScaffold,
} from "@wp-transfer/analyzer";
import type { PhpFileAnalysis, TableDefinition, AiRouteInput, AiRouteOutput } from "@wp-transfer/analyzer";

const AUTH_ONLY_PRISMA_SCHEMA = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}`;

const ADMIN_USER_FIELD_TYPES: Record<string, string> = {
  id: "Int",
  username: "String",
  password: "String",
  name: "String?",
  role: "String",
  isActive: "Boolean",
  expiresAt: "DateTime?",
  createdAt: "DateTime",
  updatedAt: "DateTime",
};

/** Reject incompatible existing auth models instead of generating code that fails later. */
export function assertAdminUserSchemaCompatible(schema: string): void {
  const model = schema.match(/\bmodel\s+AdminUser\s*\{([\s\S]*?)^\s*\}/m);
  if (!model) return;

  const fields = new Map<string, string>();
  const fieldLines = new Map<string, string>();
  for (const line of model[1].split("\n")) {
    const field = line.match(/^\s*(\w+)\s+([A-Za-z]+\??)(?=\s|@|$)/);
    if (field) {
      fields.set(field[1], field[2]);
      fieldLines.set(field[1], line);
    }
  }

  const incompatible = Object.entries(ADMIN_USER_FIELD_TYPES)
    .filter(([field, type]) => fields.get(field) !== type)
    .map(([field, type]) => `${field}: expected ${type}, found ${fields.get(field) ?? "missing"}`);

  const idLine = fieldLines.get("id") ?? "";
  const usernameLine = fieldLines.get("username") ?? "";
  const isActiveLine = fieldLines.get("isActive") ?? "";
  const createdAtLine = fieldLines.get("createdAt") ?? "";
  const updatedAtLine = fieldLines.get("updatedAt") ?? "";
  if (!/@id\b/.test(idLine)) {
    incompatible.push("id: expected @id");
  }
  if (!/@default\(autoincrement\(\)\)/.test(idLine)) {
    incompatible.push("id: expected @default(autoincrement())");
  }
  if (!/@unique\b/.test(usernameLine)) {
    incompatible.push("username: expected @unique");
  }
  if (!/@default\((?:true|1)\)/.test(isActiveLine)) {
    incompatible.push("isActive: expected @default(true)");
  }
  if (!/@default\(now\(\)\)/.test(createdAtLine)) {
    incompatible.push("createdAt: expected @default(now())");
  }
  if (!/@updatedAt\b|@default\(now\(\)\)/.test(updatedAtLine)) {
    incompatible.push("updatedAt: expected @updatedAt or @default(now())");
  }

  if (incompatible.length > 0) {
    throw new Error(
      `Existing AdminUser model is incompatible with the auth scaffold (${incompatible.join("; ")}).`,
    );
  }
}

/** Ensure an auth-enabled project always has the Prisma model its scaffold imports. */
export function ensureAuthPrismaSchema(
  schema: string | undefined,
  hasAuth: boolean,
): string | undefined {
  if (!hasAuth) return schema;

  const base = schema?.trim() || AUTH_ONLY_PRISMA_SCHEMA;
  if (/\bmodel\s+AdminUser\b/.test(base)) {
    assertAdminUserSchemaCompatible(base);
    return `${base}\n`;
  }
  return `${base}\n\n${ADMIN_USER_PRISMA_MODEL.trim()}\n`;
}

/** Any generated CRUD or admin surface gets the same baseline auth scaffold. */
export function requiresGeneratedAuth(
  detectedAuth: boolean,
  custom: ReadonlyArray<unknown>,
  tables: ReadonlyArray<unknown>,
): boolean {
  return detectedAuth || custom.length > 0 || tables.length > 0;
}

/** Keep CLI reporting tied to generation state, never to a content prefix. */
export function summarizeAiGeneration(
  results: ReadonlyArray<Pick<AiRouteOutput, "fallback">>,
): { generated: number; fallback: number } {
  const fallback = results.filter((result) => result.fallback).length;
  return { generated: results.length - fallback, fallback };
}

/** A route file is an atomic AI unit: duplicate targets retain static output. */
export function selectUniqueAiRouteInputs(inputs: ReadonlyArray<AiRouteInput>): {
  inputs: AiRouteInput[];
  skippedTargetRoutePaths: string[];
} {
  const counts = new Map<string, number>();
  for (const input of inputs) {
    counts.set(input.targetRoutePath, (counts.get(input.targetRoutePath) ?? 0) + 1);
  }
  const skippedTargetRoutePaths = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([path]) => path)
    .sort();
  return {
    inputs: inputs.filter((input) => counts.get(input.targetRoutePath) === 1),
    skippedTargetRoutePaths,
  };
}

export interface PhpSecretFinding {
  fileName: string;
  type: SecretMatch["type"];
  line: number;
  severity: SecretMatch["severity"];
}

/** Returns only safe metadata; source snippets and secret values never leave this boundary. */
export function findBlockingPhpSecrets(
  sources: ReadonlyArray<{ fileName: string; content: string }>,
): PhpSecretFinding[] {
  return sources.flatMap(({ fileName, content }) =>
    scanForSecrets(content)
      .filter((match) => match.severity === "high" || match.severity === "medium")
      .map(({ type, line, severity }) => ({ fileName, type, line, severity })),
  );
}

export function formatPhpSecretFindings(findings: ReadonlyArray<PhpSecretFinding>): string {
  return findings
    .map((finding) => `${finding.fileName}: ${finding.type} (line ${finding.line}, ${finding.severity})`)
    .join("\n");
}

/**
 * Build a deliberately conservative schema when database documentation is not
 * available.  It preserves discovered table and column names while keeping
 * unknown columns nullable strings; users must review it before production use.
 */
export function inferTablesFromAnalyses(
  analyses: ReadonlyArray<PhpFileAnalysis>,
): TableDefinition[] {
  const namesByTable = new Map<string, Set<string>>();
  const validIdentifier = /^[A-Za-z][A-Za-z0-9_]*$/;

  for (const analysis of analyses) {
    const operationTables = new Set<string>();
    for (const operation of analysis.dbOperations) {
      if (!validIdentifier.test(operation.table)) continue;
      operationTables.add(operation.table);
      const names = namesByTable.get(operation.table) ?? new Set<string>();
      for (const column of operation.columns) {
        if (column !== "id" && column !== "*" && validIdentifier.test(column)) {
          names.add(column);
        }
      }
      namesByTable.set(operation.table, names);
    }

    for (const table of operationTables) {
      const names = namesByTable.get(table)!;
      for (const parameter of analysis.inputParams) {
        if (parameter.name !== "id" && validIdentifier.test(parameter.name)) {
          names.add(parameter.name);
        }
      }
    }
  }

  return [...namesByTable.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, columns]) => ({
      name,
      columns: [
        { name: "id", type: "Int", nullable: false, isPrimary: true, isAutoIncrement: true },
        ...[...columns].sort().map(column => ({
          name: column,
          type: "String",
          nullable: true,
          isPrimary: false,
          isAutoIncrement: false,
        })),
      ],
      note: "Inferred from PHP database operations; review column types and constraints.",
    }));
}

/** Accept only a PHP-root-relative path; never use analysis metadata as an absolute or traversing path. */
export function resolvePhpSourcePath(dirPath: string, sourceRelativePath: string): string {
  if (!sourceRelativePath || isAbsolute(sourceRelativePath) || sourceRelativePath.includes("\\")) {
    throw new Error(`Unsafe PHP source path: ${sourceRelativePath}`);
  }

  const sourceParts = sourceRelativePath.split("/");
  if (sourceParts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`Unsafe PHP source path: ${sourceRelativePath}`);
  }

  const sourceRoot = resolve(dirPath);
  const candidate = resolve(sourceRoot, sourceRelativePath);
  const candidateRelative = relative(sourceRoot, candidate);
  if (candidateRelative === "" || candidateRelative === ".." || candidateRelative.startsWith(`..${sep}`) || isAbsolute(candidateRelative)) {
    throw new Error(`Unsafe PHP source path: ${sourceRelativePath}`);
  }
  return candidate;
}

function isContainedPath(rootPath: string, candidatePath: string): boolean {
  const candidateRelative = relative(rootPath, candidatePath);
  return candidateRelative !== ""
    && candidateRelative !== ".."
    && !candidateRelative.startsWith(`..${sep}`)
    && !isAbsolute(candidateRelative);
}

/**
 * Resolve a source only when it is a regular file whose real path remains
 * inside the input root. This protects both directory scans and AI reads from
 * symlink escapes even if a source path changes after enumeration.
 */
async function containedRegularPhpSourcePath(
  dirPath: string,
  sourceRelativePath: string,
): Promise<string | undefined> {
  const candidate = resolvePhpSourcePath(dirPath, sourceRelativePath);
  const sourceStat = await lstat(candidate);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) return undefined;

  const [realRoot, realSource] = await Promise.all([realpath(dirPath), realpath(candidate)]);
  return isContainedPath(realRoot, realSource) ? realSource : undefined;
}

/** Load the exact analyzed source that will be supplied to AI route generation. */
export async function loadAiPhpSource(
  dirPath: string,
  analysis: Pick<PhpFileAnalysis, "fileName" | "sourceRelativePath">,
): Promise<{ phpSource: string; phpFilePath: string }> {
  const phpFilePath = analysis.sourceRelativePath ?? analysis.fileName;
  const sourcePath = await containedRegularPhpSourcePath(dirPath, phpFilePath);
  if (!sourcePath) {
    throw new Error("PHP source must be a regular file within the input directory");
  }
  return {
    phpSource: await readFile(sourcePath, "utf-8"),
    phpFilePath,
  };
}

export async function analyzePhpDirectory(dirPath: string): Promise<{
  analyses: PhpFileAnalysis[];
  secretFindings: PhpSecretFinding[];
}> {
  const results: PhpFileAnalysis[] = [];
  const phpSources: Array<{ fileName: string; content: string }> = [];

  async function scanDir(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip WP core, plugins, vendor, and build artifact directories
        if ([
          "node_modules", ".git", "uploads", "plugins", "cache", "vendor",
          "wp-admin", "wp-includes",
        ].includes(entry.name)) continue;
        // Skip default WordPress themes (only analyze custom themes)
        if (/^twenty(twenty|nineteen|seventeen|sixteen|fifteen|fourteen|thirteen|twelve|eleven|ten)/.test(entry.name)) {
          // But DO analyze if the custom theme is within a twentytwenty* directory
          // Check if there are custom PHP files (page-*, insert*, update*, delete*)
          const themeEntries = await readdir(fullPath, { withFileTypes: true });
          const hasCustomFiles = themeEntries.some(e =>
            e.isFile() && e.name.endsWith(".php") && (
              e.name.startsWith("page-") ||
              e.name.startsWith("insert") ||
              e.name.startsWith("create") ||
              e.name.startsWith("update") ||
              e.name.startsWith("edit") ||
              e.name.startsWith("delete") ||
              e.name.startsWith("remove")
            )
          );
          if (!hasCustomFiles) continue;
        }
        await scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".php")) {
        const sourceRelativePath = relative(dirPath, fullPath).replaceAll("\\", "/");
        // This is expected for a recursively enumerated child, but keep the
        // invariant explicit so later source reads have one safe representation.
        const sourcePath = await containedRegularPhpSourcePath(dirPath, sourceRelativePath);
        if (!sourcePath) continue;
        const content = await readFile(sourcePath, "utf-8");
        phpSources.push({ fileName: sourceRelativePath, content });
        results.push({
          ...analyzePhpFile(content, entry.name),
          sourceRelativePath,
        });
      }
    }
  }

  await scanDir(dirPath);
  results.sort((a, b) => (a.sourceRelativePath ?? a.fileName).localeCompare(b.sourceRelativePath ?? b.fileName));
  return { analyses: results, secretFindings: findBlockingPhpSecrets(phpSources) };
}

/** Detect plugins from PHP source (look for plugin-like requires/includes) */
function detectPluginsFromPhp(analyses: PhpFileAnalysis[]): string[] {
  const plugins: string[] = [];
  // Heuristic: if any analysis mentions user/role/auth related operations,
  // treat as having auth plugins. For more accurate detection,
  // we look at file names and DB operations.
  for (const a of analyses) {
    if (a.fileName.includes("user") || a.fileName.includes("login")) {
      plugins.push("detected-auth-capability");
      break;
    }
    for (const op of a.dbOperations) {
      if (op.table.includes("user") || op.table.includes("admin")) {
        plugins.push("detected-auth-capability");
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
        "@prisma/client": ">=6.19.0 <7.0.0",
        "next-auth": "5.0.0-beta.32",
        bcryptjs: "^2.4.3",
        zod: "^3.23.0",
      },
      devDependencies: {
        "@types/node": "^22.0.0",
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        "@types/bcryptjs": "^2.4.6",
        typescript: "^5.7.0",
        prisma: ">=6.19.0 <7.0.0",
        "@playwright/test": "^1.48.0",
        tsx: "^4.21.0",
      },
      prisma: {
        seed: "tsx prisma/seed.ts",
      },
      // Pin patched transitive dependencies until upstream ranges catch up.
      overrides: {
        postcss: "8.5.26",
        "deepmerge-ts": "8.0.2",
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
export function generateNextConfig(): string {
  return `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
`;
}

/** Generate the App Router root layout with a safely encoded project title. */
export function generateRootLayout(projectName: string): string {
  return `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: ${JSON.stringify(projectName)},
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
`;
}

/** Generate lib/db.ts (Prisma client) */
function generateDbLib(): string {
  return `import { PrismaClient } from "@prisma/client";

// BigInt JSON serialization: Prisma models with BigInt columns would throw
// "Do not know how to serialize a BigInt" from NextResponse.json() otherwise.
// Install once per process.
if (!(BigInt.prototype as unknown as { toJSON?: () => string }).toJSON) {
  (BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
    return this.toString();
  };
}

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

/** Sort tables so FK parents come before children (topological sort) */
export function sortTablesByFkDependency(tables: TableDefinition[]): TableDefinition[] {
  const tableNames = new Set(tables.map(t => t.name));
  const deps = new Map<string, string[]>();

  for (const table of tables) {
    const fkTables = table.columns
      .filter(c => c.name.endsWith("_id"))
      .map(c => c.name.replace(/_id$/, ""))
      .filter(name => tableNames.has(name));
    deps.set(table.name, fkTables);
  }

  // Topological sort
  const sorted: TableDefinition[] = [];
  const visited = new Set<string>();

  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    for (const dep of deps.get(name) ?? []) {
      visit(dep);
    }
    const table = tables.find(t => t.name === name);
    if (table) sorted.push(table);
  }

  for (const table of tables) {
    visit(table.name);
  }

  return sorted;
}

export function collectAdminRouteResources(pages: ReadonlyArray<{ path: string }>): string[] {
  const resources = pages.flatMap(({ path }) => {
    const match = path.match(/^app\/\(admin\)\/([^/]+)\//);
    return match?.[1] && /^[a-z0-9][a-z0-9_-]*$/i.test(match[1]) ? [match[1]] : [];
  });

  return [...new Set(resources)].sort();
}

/** Generate prisma/seed.ts */
export function generateSeedScript(
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
    lines.push("  const adminSeedPassword = process.env.SEED_ADMIN_PASSWORD;");
    lines.push("  const editorSeedPassword = process.env.SEED_EDITOR_PASSWORD;");
    lines.push("  if (!adminSeedPassword || !editorSeedPassword) {");
    lines.push('    throw new Error("Set SEED_ADMIN_PASSWORD and SEED_EDITOR_PASSWORD before seeding auth users");');
    lines.push("  }");
    lines.push("  if (adminSeedPassword.length < 12 || editorSeedPassword.length < 12) {");
    lines.push('    throw new Error("Seed passwords must be at least 12 characters");');
    lines.push("  }");
    lines.push("  const adminPassword = await bcrypt.hash(adminSeedPassword, 12);");
    lines.push("  const editorPassword = await bcrypt.hash(editorSeedPassword, 12);");
    lines.push("");
    lines.push("  await prisma.adminUser.upsert({");
    lines.push('    where: { username: "admin" },');
    lines.push("    update: { password: adminPassword, isActive: true },");
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
    lines.push("    update: { password: editorPassword, isActive: true },");
    lines.push("    create: {");
    lines.push('      username: "editor",');
    lines.push("      password: editorPassword,");
    lines.push('      name: "編集者",');
    lines.push('      role: "editor",');
    lines.push("    },");
    lines.push("  });");
    lines.push("");
    lines.push('  console.log("  Seeded local administrator and editor accounts");');
    lines.push("");
  }

  // Sample data for detected tables (FK parents first)
  const tableNameSet = new Set(tables.map(t => t.name));
  const createdRefs = new Map<string, { pkCol: string; pkType: string }>();
  const sortedTables = sortTablesByFkDependency(tables);

  // Track String PKs (non-autoincrement) so FK children can reference them
  for (const table of sortedTables) {
    const pk = table.columns.find(c => c.isPrimary);
    if (pk) createdRefs.set(table.name, { pkCol: pk.name, pkType: pk.type });
  }

  for (const table of sortedTables) {
    const modelName = table.name
      .split("_")
      .map((p, i) =>
        i === 0
          ? p.charAt(0).toLowerCase() + p.slice(1)
          : p.charAt(0).toUpperCase() + p.slice(1),
      )
      .join("");

    const sampleData: Record<string, string> = {};
    let whereClause: string | null = null;
    const pk = table.columns.find(c => c.isPrimary);

    for (const col of table.columns) {
      if (col.isPrimary && col.isAutoIncrement) continue;
      if (col.name === "created_at" || col.name === "updated_at") continue;

      // FK resolution: column ends with _id, prefix matches a known table
      const fkParent = col.name.endsWith("_id")
        ? (() => {
            const base = col.name.replace(/_id$/, "");
            return tableNameSet.has(base) ? base : null;
          })()
        : null;
      if (fkParent && createdRefs.has(fkParent)) {
        // Type must match this column's type (not parent's PK type) — schema
        // may declare child FK as Int even when parent PK is String.
        if (col.type === "BigInt") {
          sampleData[col.name] = "1n";
        } else if (col.type === "Int") {
          sampleData[col.name] = "1";
        } else if (col.type === "String") {
          sampleData[col.name] = `"sample-${fkParent}"`;
        } else {
          sampleData[col.name] = "1";
        }
        continue;
      }

      switch (col.type) {
        case "String":
          if (col.name === "email" || col.name.endsWith("_email")) {
            sampleData[col.name] = `"user@example.com"`;
          } else if (col.name === "url" || col.name.endsWith("_url") || col.name.includes("link")) {
            sampleData[col.name] = `"https://example.com"`;
          } else {
            sampleData[col.name] = JSON.stringify(`サンプル${col.comment ?? col.name}`);
          }
          break;
        case "Int":
          sampleData[col.name] = "1";
          break;
        case "BigInt":
          sampleData[col.name] = "1n";
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
        case "Decimal":
          sampleData[col.name] = `"0"`;
          break;
        case "Json":
          sampleData[col.name] = "{}";
          break;
        case "Bytes":
          sampleData[col.name] = "Buffer.from([])";
          break;
        default:
          sampleData[col.name] = `"sample"`;
      }
    }

    // For String-PK non-auto-increment tables, set deterministic id for FK child lookup
    if (pk && pk.type === "String" && !pk.isAutoIncrement) {
      sampleData[pk.name] = JSON.stringify(`sample-${table.name}`);
      whereClause = `{ ${JSON.stringify(pk.name)}: ${JSON.stringify(`sample-${table.name}`)} }`;
    } else if (pk && (pk.type === "BigInt" || pk.type === "Int") && pk.isAutoIncrement) {
      whereClause = `{ ${JSON.stringify(pk.name)}: ${pk.type === "BigInt" ? "1n" : "1"} }`;
    }

    if (Object.keys(sampleData).length > 0) {
      lines.push("  // Sample table data");
      if (whereClause) {
        // Idempotent upsert
        lines.push(`  await prisma[${JSON.stringify(modelName)}].upsert({`);
        lines.push(`    where: ${whereClause},`);
        lines.push(`    update: {},`);
        lines.push(`    create: {`);
        for (const [key, value] of Object.entries(sampleData)) {
          lines.push(`      ${JSON.stringify(key)}: ${value},`);
        }
        lines.push("    },");
        lines.push("  });");
      } else {
        lines.push(`  await prisma[${JSON.stringify(modelName)}].create({`);
        lines.push("    data: {");
        for (const [key, value] of Object.entries(sampleData)) {
          lines.push(`      ${JSON.stringify(key)}: ${value},`);
        }
        lines.push("    },");
        lines.push("  });");
      }
      lines.push(`  console.log(${JSON.stringify(`  Sample ${table.name} created`)});`);
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

function assertOutputRelativePath(relativePath: string): string[] {
  if (!relativePath || isAbsolute(relativePath)) {
    throw new Error(`Output path must be relative: ${relativePath}`);
  }
  const segments = relativePath.split(/[\\/]+/);
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsafe output path: ${relativePath}`);
  }
  return segments;
}

async function assertSafeDirectory(path: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`Unsafe output directory component: ${path}`);
  }
}

/** Safely write a generated file without following symlinks outside the output root. */
export async function writeSafeOutputFile(
  outputDir: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const segments = assertOutputRelativePath(relativePath);
  const outputRoot = resolve(outputDir);
  await mkdir(outputRoot, { recursive: true });
  await assertSafeDirectory(outputRoot);
  const realOutputRoot = await realpath(outputRoot);

  let current = outputRoot;
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    try {
      await assertSafeDirectory(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(current);
      await assertSafeDirectory(current);
    }
  }

  const realParent = await realpath(dirname(join(outputRoot, ...segments)));
  const parentRelative = relative(realOutputRoot, realParent);
  if (parentRelative === ".." || parentRelative.startsWith(`..${sep}`) || isAbsolute(parentRelative)) {
    throw new Error(`Output path resolves outside output directory: ${relativePath}`);
  }

  const target = join(outputRoot, ...segments);
  try {
    const targetStat = await lstat(target);
    if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
      throw new Error(`Unsafe output target: ${relativePath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFile(target, content, "utf-8");
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
    config: {
      type: "string",
      description: "Path to migration config file (JSON)",
    },
    "skip-preflight": {
      type: "boolean",
      default: false,
      description: "Skip pre-flight checks",
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

    // ── Load config file if provided ──
    if (args.config) {
      try {
        const config = loadMigrationConfig(resolve(args.config as string));
        void config; // Config values are used as defaults; CLI args take precedence
        consola.success(`Loaded config: ${args.config}`);
      } catch (error) {
        consola.error(`Invalid config file: ${(error as Error).message}`);
        return;
      }
    }

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

    // ── Pre-flight checks ──
    if (!args["skip-preflight"]) {
      const preflightReport = runPreflightChecks({
        sourcePath: dirPath,
        outputPath: outputDir,
        schemaPath,
      });

      if (!preflightReport.canProceed) {
        consola.error("Pre-flight checks failed:");
        consola.log(formatPreflightReport(preflightReport));
        return;
      }

      if (preflightReport.warnings > 0) {
        consola.warn(`Pre-flight: ${preflightReport.passed} passed, ${preflightReport.warnings} warnings`);
      } else {
        consola.success(`Pre-flight: ${preflightReport.passed}/${preflightReport.checks.length} checks passed`);
      }
    }

    // ── Step 1: Analyze PHP files ──
    consola.start(`Scanning PHP files in: ${dirPath}`);
    const { analyses, secretFindings } = await analyzePhpDirectory(dirPath);

    if (secretFindings.length > 0) {
      consola.error("Potential secrets detected in PHP input. No report, generated files, or AI input was created:");
      consola.error(formatPhpSecretFindings(secretFindings));
      consola.info("Remove or replace the detected values with safe placeholders, then rerun analyze-php.");
      return;
    }

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

    if (tables.length === 0) {
      tables = inferTablesFromAnalyses(analyses);
      if (tables.length > 0) {
        prismaSchema = generatePrismaSchema(tables);
        consola.warn(
          `Inferred ${tables.length} database tables from PHP operations; review prisma/schema.prisma before production use`,
        );
      }
    }

    // Filter dbOperations to only reference known schema tables (if schema provided)
    if (tables.length > 0) {
      const knownTables = new Set(tables.map(t => t.name));
      for (const a of custom) {
        a.dbOperations = a.dbOperations.filter(op => knownTables.has(op.table));
      }
    }

    // ── Step 3: Detect plugins from PHP analysis ──
    const detectedPlugins = detectPluginsFromPhp(analyses);
    const detectedAuth = isAuthPluginDetected(detectedPlugins);
    // Generated database routes and admin pages must not be public merely
    // because a legacy source tree did not expose its authentication plugin.
    const hasAuth = requiresGeneratedAuth(detectedAuth, custom, tables);
    if (detectedAuth) {
      consola.info("Auth/role plugins detected — generating auth scaffold");
    } else if (hasAuth) {
      consola.info("Generated database resources detected — generating baseline auth scaffold");
    }

    // ── Step 4: Ensure auth scaffolds always have their required Prisma model ──
    prismaSchema = ensureAuthPrismaSchema(prismaSchema, hasAuth);

    // ── Step 5: Generate API route stubs ──
    consola.start("Generating Next.js API route stubs...");
    const stubs = generateApiStubs(custom, tables, { requireAuth: hasAuth });
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

        const candidateAiInputs: AiRouteInput[] = await Promise.all(
          filesWithOps.map(async (analysis) => {
            const { phpSource, phpFilePath } = await loadAiPhpSource(dirPath, analysis);
            const mapping = inferRouteMapping(analysis);
            const staticRoute = stubs.get(mapping.path);
            return {
              phpSource,
              phpFilePath,
              targetRoutePath: mapping.path,
              accessPath: routeResourcePath(mapping.path),
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
              existingRoute: staticRoute,
            };
          }),
        );

        const uniqueAiInputs = selectUniqueAiRouteInputs(candidateAiInputs);
        for (const routePath of uniqueAiInputs.skippedTargetRoutePaths) {
          consola.warn(`Multiple PHP inputs map to ${routePath}; retaining the complete guarded static route`);
        }
        const aiInputs = uniqueAiInputs.inputs;

        const aiResult = await generateRoutesWithAi(aiInputs, {
          apiKey,
          ...(aiModel ? { model: aiModel } : {}),
        });

        aiTotalTokens = aiResult.totalTokens;
        const initialAiSummary = summarizeAiGeneration(aiResult.results);
        aiFallbackCount = initialAiSummary.fallback + uniqueAiInputs.skippedTargetRoutePaths.length;
        aiGeneratedCount = initialAiSummary.generated;

        // AI output may refine business logic, but it must never remove the
        // database-backed access guard from an authenticated scaffold.
        for (const result of aiResult.results) {
          const matchingInput = aiInputs.find((input) => input.targetRoutePath === result.routePath);
          if (hasAuth && (!matchingInput || !hasActiveAccessGuard(result.content, matchingInput.accessPath))) {
            // A generator fallback is already counted above. This branch is a
            // defense-in-depth check for a future generator implementation.
            if (!result.fallback) {
              aiGeneratedCount--;
              aiFallbackCount++;
            }
            consola.warn(`AI route omitted requireActiveAccess; retaining guarded static route: ${result.routePath}`);
            continue;
          }
          stubs.set(result.routePath, result.content);
        }

        consola.success(
          `AI generation complete: ${aiGeneratedCount} AI-generated, ${aiFallbackCount} fallback, ${aiTotalTokens} tokens used`,
        );
      }
    }

    // ── Step 6: Generate admin pages ──
    consola.start("Generating admin page scaffolds...");
    const adminPages = generateAdminScaffold(analyses, tables, { requireAuth: hasAuth });
    consola.success(`Generated ${adminPages.length} admin pages`);

    // ── Step 7: Generate auth scaffold ──
    const authFiles = generateAuthScaffold(detectedPlugins, {
      routeResources: collectAdminRouteResources(adminPages),
      force: hasAuth,
    });
    if (authFiles.length > 0) {
      consola.success(`Generated ${authFiles.length} auth files`);
    }

    // ── Step 8: Generate Docker scaffold ──
    const projectName = basename(outputDir);
    consola.start("Generating Docker scaffold...");
    const dockerFiles = generateDockerScaffold(projectName, "mysql");
    consola.success(`Generated ${dockerFiles.length} Docker files`);

    // ── Step 9: Write all outputs ──
    let totalFiles = 0;

    // analysis.json
    await writeSafeOutputFile(outputDir, "analysis.json", JSON.stringify(analyses, null, 2));
    totalFiles++;

    // schema.prisma
    if (prismaSchema) {
      await writeSafeOutputFile(outputDir, "prisma/schema.prisma", prismaSchema);
      totalFiles++;
    }

    // API route stubs
    for (const [routePath, content] of stubs) {
      const resolved = await resolveTemplate(templateDir, { path: routePath, content });
      await writeSafeOutputFile(outputDir, routePath, resolved);
      totalFiles++;
    }

    // Admin pages
    for (const page of adminPages) {
      const content = await resolveTemplate(templateDir, page);
      await writeSafeOutputFile(outputDir, page.path, content);
      totalFiles++;
    }

    // Auth files
    for (const file of authFiles) {
      const content = await resolveTemplate(templateDir, file);
      await writeSafeOutputFile(outputDir, file.path, content);
      totalFiles++;
    }

    // Docker files
    for (const file of dockerFiles) {
      const content = await resolveTemplate(templateDir, file);
      await writeSafeOutputFile(outputDir, file.path, content);
      totalFiles++;
    }

    // Verify scaffold (E2E tests)
    const verifyInput = {
      postSlugs: [] as string[],
      categorySlugs: [] as string[],
      tableNames: tables.map(t => t.name),
      apiRoutes: [...stubs.keys()].map(path => {
        const method = path.includes("[id]") ? "GET" : "GET";
        return { path, method };
      }),
      hasAuth,
      adminPages: adminPages.map(p => p.path),
      phpAnalyses: custom.map(a => ({
        fileName: a.fileName,
        dbOperations: a.dbOperations.map(op => ({ type: op.type as "INSERT" | "UPDATE" | "DELETE" | "SELECT", table: op.table })),
        inputParams: a.inputParams.map(p => ({ name: p.name, source: p.source })),
      })),
      tables: tables.map(t => ({
        name: t.name,
        columns: t.columns.map(c => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable,
          isPrimary: c.isPrimary,
          isAutoIncrement: c.isAutoIncrement,
          comment: c.comment,
        })),
      })),
    };
    const verifyFiles = generateVerifyScaffold(verifyInput);
    for (const file of verifyFiles) {
      await writeSafeOutputFile(outputDir, file.path, file.content);
      totalFiles++;
    }
    consola.success(`Generated ${verifyFiles.length} test files (smoke + API + auth + admin + migration)`);

    // Project files
    await writeSafeOutputFile(outputDir, "package.json", generatePackageJson(projectName));
    totalFiles++;

    await writeSafeOutputFile(outputDir, "tsconfig.json", generateTsConfig());
    totalFiles++;

    await writeSafeOutputFile(outputDir, "next.config.ts", generateNextConfig());
    totalFiles++;

    // Root layout (required by Next.js App Router)
    await writeSafeOutputFile(
      outputDir,
      "app/layout.tsx",
      generateRootLayout(projectName),
    );
    totalFiles++;

    await writeSafeOutputFile(
      outputDir,
      "lib/db.ts",
      generateDbLib(),
    );
    totalFiles++;

    // Seed script
    await writeSafeOutputFile(
      outputDir,
      "prisma/seed.ts",
      generateSeedScript(tables, hasAuth),
    );
    totalFiles++;

    // report.md
    const report = generateMigrationReport(analyses, custom, stubs, prismaSchema, adminPages.length, authFiles.length, dockerFiles.length);
    await writeSafeOutputFile(outputDir, "report.md", report);
    totalFiles++;

    // Migration dashboard HTML
    const dashboardInput = {
      projectName,
      phpFileCount: analyses.length,
      tableCount: tables.length,
      apiRouteCount: stubs.size,
      adminPageCount: adminPages.length,
      authGenerated: hasAuth,
      securityIssues: custom.flatMap(a => a.securityIssues.map(issue => ({ file: a.fileName, issue }))),
      crudCoverage: tables.map(t => {
        const ops = custom.flatMap(a => a.dbOperations.filter(op => op.table === t.name));
        return {
          table: t.name,
          create: ops.some(op => op.type === "INSERT"),
          read: stubs.has(`app/api/${t.name}/route.ts`),
          update: ops.some(op => op.type === "UPDATE"),
          delete: ops.some(op => op.type === "DELETE"),
        };
      }),
      generatedFiles: totalFiles,
    };
    const dashboard = generateMigrationDashboard(dashboardInput);
    await writeSafeOutputFile(outputDir, dashboard.path, dashboard.html);
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
      `Test Files Generated: ${verifyFiles.length}`,
      `Dashboard: ${outputDir}/${dashboard.path}`,
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
