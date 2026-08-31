import { describe, it, expect } from "vitest";
import ts from "typescript";
import {
  collectAdminRouteResources,
  ensureAuthPrismaSchema,
  inferTablesFromAnalyses,
  requiresGeneratedAuth,
  summarizeAiGeneration,
  selectUniqueAiRouteInputs,
  generatePackageJson,
  generateNextConfig,
  generateRootLayout,
  generateSeedScript,
  sortTablesByFkDependency,
} from "../src/commands/analyze-php";
import { generateAdminScaffold, generateApiStubs, generateAuthScaffold } from "@wp-transfer/analyzer";
import type { TableDefinition } from "@wp-transfer/analyzer";

describe("generatePackageJson", () => {
  const pkg = JSON.parse(generatePackageJson("test-project"));

  it("sets project name and version", () => {
    expect(pkg.name).toBe("test-project");
    expect(pkg.version).toBe("0.1.0");
    expect(pkg.private).toBe(true);
  });

  it("includes playwright in devDependencies", () => {
    expect(pkg.devDependencies["@playwright/test"]).toBeDefined();
  });

  it("includes tsx in devDependencies", () => {
    expect(pkg.devDependencies.tsx).toBeDefined();
  });

  it("includes test scripts", () => {
    expect(pkg.scripts.test).toBe("playwright test");
    expect(pkg.scripts["test:report"]).toBe("playwright show-report");
  });

  it("includes db scripts", () => {
    expect(pkg.scripts["db:migrate"]).toBe("prisma migrate dev");
    expect(pkg.scripts["db:migrate:deploy"]).toBe("prisma migrate deploy");
    expect(pkg.scripts["db:seed"]).toBe("prisma db seed");
    expect(pkg.scripts["db:studio"]).toBe("prisma studio");
  });

  it("includes setup and verify scripts", () => {
    expect(pkg.scripts.setup).toContain("prisma");
    expect(pkg.scripts.verify).toContain("verify.sh");
  });

  it("includes prisma seed config", () => {
    expect(pkg.prisma.seed).toContain("tsx");
  });

  it("pins next-auth to the patched v5 beta compatible with the generated API", () => {
    expect(pkg.dependencies["next-auth"]).toBe("5.0.0-beta.32");
  });

  it("overrides vulnerable transitive dependencies with patched versions", () => {
    expect(pkg.overrides.postcss).toBe("8.5.26");
    expect(pkg.overrides["deepmerge-ts"]).toBe("8.0.2");
  });
});

describe("generateNextConfig", () => {
  it("does not suppress TypeScript failures during production builds", () => {
    expect(generateNextConfig()).not.toContain("ignoreBuildErrors");
  });
});

describe("generateRootLayout", () => {
  it("emits a syntactically valid TSX title for punctuation-bearing output directories", () => {
    const layout = generateRootLayout('my"site');
    const result = ts.transpileModule(layout, {
      compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
    });

    expect(layout).toContain('title: "my\\\"site"');
    expect(result.diagnostics?.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });
});

describe("sortTablesByFkDependency", () => {
  const col = (name: string, type = "String") => ({
    name,
    type,
    nullable: false,
    isPrimary: name === "id",
    isAutoIncrement: name === "id",
  });

  it("puts FK parent tables before children", () => {
    const tables: TableDefinition[] = [
      { name: "order", columns: [col("id"), col("user_id", "Int")] },
      { name: "user", columns: [col("id"), col("name")] },
    ];
    const sorted = sortTablesByFkDependency(tables);
    const names = sorted.map(t => t.name);
    expect(names.indexOf("user")).toBeLessThan(names.indexOf("order"));
  });

  it("returns tables unchanged when no FK columns exist", () => {
    const tables: TableDefinition[] = [
      { name: "category", columns: [col("id"), col("title")] },
      { name: "tag", columns: [col("id"), col("label")] },
    ];
    const sorted = sortTablesByFkDependency(tables);
    expect(sorted.map(t => t.name)).toEqual(["category", "tag"]);
  });

  it("handles multi-level dependencies", () => {
    const tables: TableDefinition[] = [
      { name: "comment", columns: [col("id"), col("post_id", "Int")] },
      { name: "post", columns: [col("id"), col("user_id", "Int")] },
      { name: "user", columns: [col("id"), col("name")] },
    ];
    const sorted = sortTablesByFkDependency(tables);
    const names = sorted.map(t => t.name);
    expect(names.indexOf("user")).toBeLessThan(names.indexOf("post"));
    expect(names.indexOf("post")).toBeLessThan(names.indexOf("comment"));
  });
});

describe("collectAdminRouteResources", () => {
  it("returns unique resource segments from generated admin pages", () => {
    expect(
      collectAdminRouteResources([
        { path: "app/(admin)/articles/page.tsx" },
        { path: "app/(admin)/articles/[id]/page.tsx" },
        { path: "app/(admin)/media/page.tsx" },
        { path: "app/(admin)/page.tsx" },
        { path: "app/login/page.tsx" },
      ]),
    ).toEqual(["articles", "media"]);
  });
});

describe("ensureAuthPrismaSchema", () => {
  it("creates a complete minimal schema when auth is detected without a source schema", () => {
    const schema = ensureAuthPrismaSchema(undefined, true);

    expect(schema).toContain("generator client");
    expect(schema).toContain("datasource db");
    expect(schema).toContain("model AdminUser");
  });

  it("appends the auth model only once", () => {
    const once = ensureAuthPrismaSchema("generator client {}", true)!;
    const twice = ensureAuthPrismaSchema(once, true)!;

    expect(twice.match(/model AdminUser/g)).toHaveLength(1);
  });

  it("rejects an existing AdminUser model missing auth-required fields", () => {
    expect(() => ensureAuthPrismaSchema(`
      model AdminUser {
        id Int @id
        username String @unique
      }
    `, true)).toThrow("Existing AdminUser model is incompatible with the auth scaffold");
  });

  it("rejects incompatible field types in an existing AdminUser model", () => {
    expect(() => ensureAuthPrismaSchema(`
      model AdminUser {
        id String @id
        username String @unique
        password String
        name String?
        role String
        isActive Boolean
        expiresAt DateTime?
        createdAt DateTime
        updatedAt DateTime
      }
    `, true)).toThrow("id: expected Int, found String");
  });

  it("rejects existing auth models without unique lookup constraints", () => {
    expect(() => ensureAuthPrismaSchema(`
      model AdminUser {
        id Int
        username String
        password String
        name String?
        role String
        isActive Boolean
        expiresAt DateTime?
        createdAt DateTime
        updatedAt DateTime
      }
    `, true)).toThrow("id: expected @id");
  });

  it("rejects required optional-profile fields because generated creates may omit them", () => {
    expect(() => ensureAuthPrismaSchema(`
      model AdminUser {
        id Int @id @default(autoincrement())
        username String @unique
        password String
        name String
        role String
        isActive Boolean @default(true)
        expiresAt DateTime
        createdAt DateTime @default(now())
        updatedAt DateTime @updatedAt
      }
    `, true)).toThrow("name: expected String?, found String");
  });

  it("rejects models missing generated-create defaults", () => {
    expect(() => ensureAuthPrismaSchema(`
      model AdminUser {
        id Int @id
        username String @unique
        password String
        name String?
        role String
        isActive Boolean
        expiresAt DateTime?
        createdAt DateTime
        updatedAt DateTime
      }
    `, true)).toThrow("id: expected @default(autoincrement())");
  });

  it("does not create a schema when auth is absent", () => {
    expect(ensureAuthPrismaSchema(undefined, false)).toBeUndefined();
  });
});

describe("schema-only generated resources", () => {
  const schemaOnlyTable: TableDefinition = {
    name: "product",
    columns: [{ name: "id", type: "Int", nullable: false, isPrimary: true, isAutoIncrement: true }],
  };

  it("enables the auth scaffold and guards schema-driven CRUD and admin pages", () => {
    const hasAuth = requiresGeneratedAuth(false, [], [schemaOnlyTable]);
    const routes = generateApiStubs([], [schemaOnlyTable], { requireAuth: hasAuth });
    const adminPages = generateAdminScaffold([], [schemaOnlyTable], { requireAuth: hasAuth });
    const authFiles = generateAuthScaffold([], { force: hasAuth });

    expect(hasAuth).toBe(true);
    expect(ensureAuthPrismaSchema(undefined, hasAuth)).toContain("model AdminUser");
    expect(routes.get("app/api/products/route.ts")).toContain('requireActiveAccess("/products")');
    expect(adminPages.find((page) => page.path === "app/(admin)/layout.tsx")?.content).toContain('requireActiveAccess("/")');
    expect(authFiles.some((file) => file.path === "app/api/auth/[...nextauth]/route.ts")).toBe(true);
  });
});

describe("summarizeAiGeneration", () => {
  it("counts existing-route fallbacks as fallbacks instead of AI successes", () => {
    expect(summarizeAiGeneration([
      { fallback: false },
      { fallback: true },
    ])).toEqual({ generated: 1, fallback: 1 });
  });
});

describe("selectUniqueAiRouteInputs", () => {
  it("skips duplicate target routes deterministically instead of allowing last-write-wins", () => {
    const input = (targetRoutePath: string) => ({
      phpSource: "<?php",
      phpFilePath: `${targetRoutePath}.php`,
      targetRoutePath,
      accessPath: "/products",
      prismaSchema: "",
      staticAnalysis: { dbOperations: [], inputParams: [] },
    });
    const selected = selectUniqueAiRouteInputs([
      input("app/api/products/[id]/route.ts"),
      input("app/api/products/[id]/route.ts"),
      input("app/api/articles/route.ts"),
    ]);

    expect(selected.inputs.map((item) => item.targetRoutePath)).toEqual(["app/api/articles/route.ts"]);
    expect(selected.skippedTargetRoutePaths).toEqual(["app/api/products/[id]/route.ts"]);
  });
});

describe("inferTablesFromAnalyses", () => {
  it("creates a conservative Prisma-compatible table from PHP operations", () => {
    const tables = inferTablesFromAnalyses([
      {
        fileName: "create-item.php",
        purpose: "create",
        dbOperations: [{ type: "INSERT", table: "catalog_item", columns: ["name", "active"], inLoop: false }],
        inputParams: [{ name: "name", source: "$_POST", usage: "" }, { name: "active", source: "$_POST", usage: "" }],
        outputType: "redirect",
        securityIssues: [],
        phpVersionHints: [],
      },
    ]);

    expect(tables).toEqual([expect.objectContaining({
      name: "catalog_item",
      columns: expect.arrayContaining([
        expect.objectContaining({ name: "id", type: "Int", isPrimary: true, isAutoIncrement: true }),
        expect.objectContaining({ name: "name", type: "String", nullable: true }),
        expect.objectContaining({ name: "active", type: "String", nullable: true }),
      ]),
    })]);
  });
});

describe("generateSeedScript", () => {
  it("requires environment-provided passwords for generated auth users", () => {
    const script = generateSeedScript([], true);

    expect(script).toContain("process.env.SEED_ADMIN_PASSWORD");
    expect(script).toContain("process.env.SEED_EDITOR_PASSWORD");
    expect(script).toContain("Seed passwords must be at least 12 characters");
    expect(script).toContain("update: { password: adminPassword, isActive: true }");
    expect(script).toContain("update: { password: editorPassword, isActive: true }");
    expect(script).not.toMatch(/bcrypt\.hash\(["']/);
  });
});
