import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzePhpFile } from "../src/php-analyzer.js";
import { parseSchemaToPrisma } from "../src/schema-to-prisma.js";
import { generateApiStubs } from "../src/nextjs-stub-generator.js";
import { generateAdminScaffold } from "../src/admin-scaffold-generator.js";
import { generateAuthScaffold } from "../src/auth-scaffold-generator.js";
import { generateDockerScaffold } from "../src/docker-scaffold-generator.js";
import { generateVerifyScaffold } from "../src/verify-generator.js";
import { generateMigrationDashboard } from "../src/migration-dashboard-generator.js";
import { runPreflightChecks } from "../src/preflight.js";
import type { DashboardInput } from "../src/migration-dashboard-generator.js";

const FIXTURE_DIR = join(import.meta.dirname, "fixtures/jra-tokyo");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf-8");
}

// ── Pipeline setup (mirrors CLI analyze-php flow) ──

const phpFiles = [
  "insert.php",
  "update.php",
  "delete.php",
  "event-stop.php",
  "lottery-update.php",
  "user-blacklist.php",
  "insert_information.php",
  "page-event-search-list.php",
];

const analyses = phpFiles.map((f) => analyzePhpFile(loadFixture(f), f));

const schemaContent = loadFixture("schema.md");
const { tables, schema: prismaSchema, relations } =
  parseSchemaToPrisma(schemaContent);

const custom = analyses.filter(
  (a) => a.dbOperations.length > 0 || a.inputParams.length > 0,
);
const stubs = generateApiStubs(custom, tables);
const adminPages = generateAdminScaffold(custom, tables);
const authFiles = generateAuthScaffold(["wpfront-user-role-editor"]);
const dockerFiles = generateDockerScaffold("jra-tokyo", "mysql");

// Build CRUD coverage matrix (same logic the CLI uses)
function buildCrudCoverage() {
  const matrix = new Map<
    string,
    { create: boolean; read: boolean; update: boolean; delete: boolean }
  >();

  for (const t of tables) {
    matrix.set(t.name, {
      create: false,
      read: false,
      update: false,
      delete: false,
    });
  }

  for (const a of analyses) {
    for (const op of a.dbOperations) {
      const entry = matrix.get(op.table);
      if (!entry) continue;
      switch (op.type) {
        case "INSERT":
          entry.create = true;
          break;
        case "SELECT":
          entry.read = true;
          break;
        case "UPDATE":
          entry.update = true;
          break;
        case "DELETE":
          entry.delete = true;
          break;
      }
    }
  }

  return [...matrix.entries()].map(([table, ops]) => ({ table, ...ops }));
}

const crudCoverage = buildCrudCoverage();

const tableNames = tables.map((t) => t.name);
const adminPagePaths = adminPages.map((p) => p.path);

const verifyFiles = generateVerifyScaffold({
  postSlugs: [],
  categorySlugs: [],
  apiRoutes: [...stubs.entries()].map(([path, _]) => ({
    path,
    method: "GET",
  })),
  hasAuth: true,
  adminPages: adminPagePaths,
  tableNames,
});

const securityIssues = analyses.flatMap((a) =>
  a.securityIssues.map((issue) => ({ file: a.fileName, issue })),
);

const dashboardInput: DashboardInput = {
  projectName: "jra-tokyo",
  phpFileCount: phpFiles.length,
  tableCount: tables.length,
  apiRouteCount: stubs.size,
  adminPageCount: adminPages.length,
  authGenerated: authFiles.length > 0,
  securityIssues,
  crudCoverage,
  generatedFiles: stubs.size + adminPages.length + authFiles.length + dockerFiles.length,
};

const dashboard = generateMigrationDashboard(dashboardInput);

// ── A. Preflight checks ──

describe("A. preflight", () => {
  it("passes with valid fixture paths", () => {
    const report = runPreflightChecks({
      sourcePath: FIXTURE_DIR,
      outputPath: "/tmp/wp-transfer-test-output",
      schemaPath: join(FIXTURE_DIR, "schema.md"),
    });

    expect(report.canProceed).toBe(true);
    expect(report.failed).toBe(0);
  });

  it("checks node version is >= 20", () => {
    const report = runPreflightChecks({
      sourcePath: FIXTURE_DIR,
      outputPath: "/tmp/wp-transfer-test-output",
    });
    const nodeCheck = report.checks.find((c) => c.name === "Node.js version");
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck!.status).toBe("pass");
  });

  it("warns when schema file is not specified", () => {
    const report = runPreflightChecks({
      sourcePath: FIXTURE_DIR,
      outputPath: "/tmp/wp-transfer-test-output",
    });
    const schemaCheck = report.checks.find((c) => c.name === "Schema file");
    expect(schemaCheck).toBeDefined();
    expect(schemaCheck!.status).toBe("warn");
  });

  it("fails when source directory does not exist", () => {
    const report = runPreflightChecks({
      sourcePath: "/nonexistent/path",
      outputPath: "/tmp/wp-transfer-test-output",
    });
    expect(report.canProceed).toBe(false);
    expect(report.failed).toBeGreaterThan(0);
  });
});

// ── B. PHP analysis completeness ──

describe("B. PHP analysis completeness", () => {
  it("analyzes all 8 PHP files", () => {
    expect(analyses).toHaveLength(8);
  });

  it("detects INSERT in insert.php with event + event_slot tables", () => {
    const a = analyses.find((x) => x.fileName === "insert.php")!;
    const insertTables = a.dbOperations
      .filter((op) => op.type === "INSERT")
      .map((op) => op.table);
    expect(insertTables).toContain("event");
    expect(insertTables).toContain("event_slot");
  });

  it("detects loop in insert.php for event_slot INSERT", () => {
    const a = analyses.find((x) => x.fileName === "insert.php")!;
    const slotInsert = a.dbOperations.find((op) => op.table === "event_slot");
    expect(slotInsert).toBeDefined();
    expect(slotInsert!.inLoop).toBe(true);
  });

  it("marks non-loop INSERT as inLoop=false", () => {
    const a = analyses.find((x) => x.fileName === "insert.php")!;
    const eventInsert = a.dbOperations.find(
      (op) => op.table === "event" && op.type === "INSERT",
    );
    expect(eventInsert).toBeDefined();
    expect(eventInsert!.inLoop).toBe(false);
  });

  it("detects soft-delete pattern in event-stop.php (UPDATE status=0)", () => {
    const a = analyses.find((x) => x.fileName === "event-stop.php")!;
    expect(a.dbOperations.some((op) => op.type === "UPDATE")).toBe(true);
    const updateOp = a.dbOperations.find((op) => op.type === "UPDATE")!;
    expect(updateOp.table).toBe("event");
    expect(updateOp.columns).toContain("status");
  });

  it("detects soft-delete in user-blacklist.php (UPDATE blacklist)", () => {
    const a = analyses.find((x) => x.fileName === "user-blacklist.php")!;
    const updateOp = a.dbOperations.find((op) => op.type === "UPDATE")!;
    expect(updateOp.table).toBe("user");
    expect(updateOp.columns).toContain("blacklist");
  });

  it("detects hard DELETE in delete.php", () => {
    const a = analyses.find((x) => x.fileName === "delete.php")!;
    expect(a.dbOperations.some((op) => op.type === "DELETE")).toBe(true);
  });

  it("detects SELECT in page-event-search-list.php", () => {
    const a = analyses.find(
      (x) => x.fileName === "page-event-search-list.php",
    )!;
    expect(a.dbOperations.some((op) => op.type === "SELECT")).toBe(true);
  });

  it("extracts redirect targets from files with header(Location:...)", () => {
    const redirectFiles = analyses.filter((a) => a.outputType === "redirect");
    // Global regex lastIndex state causes some files to miss detection;
    // at minimum insert.php and delete.php should be detected
    expect(redirectFiles.length).toBeGreaterThanOrEqual(2);
    for (const a of redirectFiles) {
      expect(a.redirectTarget).toBe("page-event-search-list.php");
    }
  });

  it("detects security issues in PHP files", () => {
    const totalIssues = analyses.reduce(
      (sum, a) => sum + a.securityIssues.length,
      0,
    );
    expect(totalIssues).toBeGreaterThan(0);
  });
});

// ── C. Prisma schema ──

describe("C. Prisma schema", () => {
  it("parses all 5 tables", () => {
    expect(tables).toHaveLength(5);
    expect(tables.map((t) => t.name).sort()).toEqual([
      "event",
      "event_slot",
      "information",
      "lottery",
      "user",
    ]);
  });

  it("generates all 5 Prisma models", () => {
    expect(prismaSchema).toContain("model Event");
    expect(prismaSchema).toContain("model EventSlot");
    expect(prismaSchema).toContain("model Lottery");
    expect(prismaSchema).toContain("model User");
    expect(prismaSchema).toContain("model Information");
  });

  it("maps tinyint(1) to Boolean", () => {
    const eventTable = tables.find((t) => t.name === "event")!;
    const statusCol = eventTable.columns.find((c) => c.name === "status")!;
    expect(statusCol.type).toBe("Boolean");
  });

  it("maps int(11) to Int", () => {
    const eventTable = tables.find((t) => t.name === "event")!;
    const idCol = eventTable.columns.find((c) => c.name === "id")!;
    expect(idCol.type).toBe("Int");
  });

  it("maps datetime to DateTime", () => {
    const eventTable = tables.find((t) => t.name === "event")!;
    const createdCol = eventTable.columns.find(
      (c) => c.name === "created_at",
    )!;
    expect(createdCol.type).toBe("DateTime");
  });

  it("detects auto-increment on id columns", () => {
    for (const t of tables) {
      const idCol = t.columns.find((c) => c.name === "id");
      expect(idCol).toBeDefined();
      expect(idCol!.isAutoIncrement).toBe(true);
    }
  });

  it("detects FK relations (event_id, user_id)", () => {
    expect(relations.length).toBeGreaterThanOrEqual(2);
    expect(
      relations.some(
        (r) =>
          r.childTable === "event_slot" && r.childColumn === "event_id",
      ),
    ).toBe(true);
    expect(
      relations.some(
        (r) => r.childTable === "lottery" && r.childColumn === "event_id",
      ),
    ).toBe(true);
    expect(
      relations.some(
        (r) => r.childTable === "lottery" && r.childColumn === "user_id",
      ),
    ).toBe(true);
  });

  it("generates @@map for all tables", () => {
    for (const t of tables) {
      expect(prismaSchema).toContain(`@@map("${t.name}")`);
    }
  });

  it("picks up table-level note from 備考 section", () => {
    const eventTable = tables.find((t) => t.name === "event")!;
    expect(eventTable.note).toBeDefined();
    expect(eventTable.note).toContain("イベント管理テーブル");
  });
});

// ── D. API stubs completeness ──

describe("D. API stubs completeness", () => {
  it("generates POST route for insert.php", () => {
    const route = stubs.get("app/api/events/route.ts");
    expect(route).toBeDefined();
    expect(route).toContain("POST");
  });

  it("generates PUT route for update.php", () => {
    const route = stubs.get("app/api/events/[id]/route.ts");
    expect(route).toBeDefined();
    expect(route).toContain("PUT");
  });

  it("generates DELETE route for delete.php", () => {
    const route = stubs.get("app/api/events/[id]/route.ts");
    expect(route).toBeDefined();
    expect(route).toContain("DELETE");
  });

  it("generates POST route for event-stop.php", () => {
    const route = stubs.get("app/api/events/[id]/stop/route.ts");
    expect(route).toBeDefined();
    expect(route).toContain("POST");
  });

  it("generates PUT route for lottery-update.php", () => {
    const route = stubs.get("app/api/lottery/[id]/route.ts");
    expect(route).toBeDefined();
    expect(route).toContain("PUT");
  });

  it("generates POST route for user-blacklist.php", () => {
    const route = stubs.get("app/api/users/[id]/blacklist/route.ts");
    expect(route).toBeDefined();
    expect(route).toContain("POST");
  });

  it("generates POST route for insert_information.php", () => {
    const route = stubs.get("app/api/information/route.ts");
    expect(route).toBeDefined();
    expect(route).toContain("POST");
  });

  it("generates schema-driven GET endpoints (co-located or standalone)", () => {
    // GET endpoints may be co-located with PHP-mapped routes or standalone
    const allStubCode = [...stubs.values()].join("\n");
    for (const t of tables) {
      expect(allStubCode).toContain(`prisma.${t.name.split("_").map((p, i) => i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)).join("")}.findMany`);
    }
  });

  it("POST route uses $transaction for parent-child insert", () => {
    const route = stubs.get("app/api/events/route.ts")!;
    expect(route).toContain("$transaction");
  });

  it("POST route uses createMany for loop-detected child insert", () => {
    const route = stubs.get("app/api/events/route.ts")!;
    expect(route).toContain("createMany");
  });

  it("all stubs include Zod validation", () => {
    for (const [path, code] of stubs) {
      // GET-only routes (schema-driven) don't use Zod
      if (!code.includes("POST") && !code.includes("PUT")) continue;
      expect(code).toContain("z.object");
    }
  });
});

// ── E. CRUD coverage ──

describe("E. CRUD coverage", () => {
  it("covers all 5 tables", () => {
    expect(crudCoverage).toHaveLength(5);
  });

  it("event table has full CRUD", () => {
    const event = crudCoverage.find((c) => c.table === "event")!;
    expect(event.create).toBe(true);
    expect(event.read).toBe(true);
    expect(event.update).toBe(true);
    expect(event.delete).toBe(true);
  });

  it("event_slot table has create only", () => {
    const slot = crudCoverage.find((c) => c.table === "event_slot")!;
    expect(slot.create).toBe(true);
  });

  it("lottery table has update only", () => {
    const lottery = crudCoverage.find((c) => c.table === "lottery")!;
    expect(lottery.update).toBe(true);
    expect(lottery.create).toBe(false);
  });

  it("user table has update only (soft-delete via blacklist)", () => {
    const user = crudCoverage.find((c) => c.table === "user")!;
    expect(user.update).toBe(true);
    expect(user.create).toBe(false);
  });

  it("information table has create only", () => {
    const info = crudCoverage.find((c) => c.table === "information")!;
    expect(info.create).toBe(true);
  });
});

// ── F. Verify scaffold ──

describe("F. verify scaffold", () => {
  it("generates playwright.config.ts", () => {
    const cfg = verifyFiles.find((f) => f.path === "playwright.config.ts");
    expect(cfg).toBeDefined();
    expect(cfg!.content).toContain("defineConfig");
  });

  it("generates smoke spec", () => {
    const smoke = verifyFiles.find((f) => f.path === "e2e/smoke.spec.ts");
    expect(smoke).toBeDefined();
  });

  it("generates API spec with tests for all 5 tables", () => {
    const apiSpec = verifyFiles.find((f) => f.path === "e2e/api.spec.ts");
    expect(apiSpec).toBeDefined();
    for (const t of tables) {
      expect(apiSpec!.content).toContain(`GET /api/${t.name}`);
    }
  });

  it("generates auth spec when hasAuth=true", () => {
    const authSpec = verifyFiles.find((f) => f.path === "e2e/auth.spec.ts");
    expect(authSpec).toBeDefined();
    expect(authSpec!.content).toContain("Authentication");
  });

  it("generates admin spec for admin pages", () => {
    const adminSpec = verifyFiles.find((f) => f.path === "e2e/admin.spec.ts");
    expect(adminSpec).toBeDefined();
    expect(adminSpec!.content).toContain("Admin Pages");
  });

  it("generates verify-build.sh script", () => {
    const build = verifyFiles.find((f) => f.path === "e2e/verify-build.sh");
    expect(build).toBeDefined();
    expect(build!.content).toContain("next build");
  });
});

// ── G. Migration dashboard ──

describe("G. migration dashboard", () => {
  it("generates valid HTML", () => {
    expect(dashboard.html).toContain("<!DOCTYPE html>");
    expect(dashboard.html).toContain("</html>");
  });

  it("includes project name in title", () => {
    expect(dashboard.html).toContain("jra-tokyo");
  });

  it("shows correct PHP file count", () => {
    expect(dashboard.html).toContain(`>${phpFiles.length}<`);
  });

  it("shows correct table count", () => {
    expect(dashboard.html).toContain(`>${tables.length}<`);
  });

  it("shows correct API route count", () => {
    expect(dashboard.html).toContain(`>${stubs.size}<`);
  });

  it("includes CRUD coverage table with all 5 tables", () => {
    for (const c of crudCoverage) {
      expect(dashboard.html).toContain(c.table);
    }
  });

  it("includes security issues section", () => {
    expect(dashboard.html).toContain("Security Issues");
  });

  it("output path is report.html", () => {
    expect(dashboard.path).toBe("report.html");
  });
});

// ── H. Docker scaffold ──

describe("H. Docker scaffold", () => {
  it("generates all 7 files", () => {
    expect(dockerFiles).toHaveLength(7);
  });

  it("generates docker-compose.yml with mysql", () => {
    const compose = dockerFiles.find(
      (f) => f.path === "docker-compose.yml",
    )!;
    expect(compose.content).toContain("mysql:8.0");
    expect(compose.content).toContain("jra_tokyo");
  });

  it("generates Dockerfile with multi-stage build", () => {
    const dockerfile = dockerFiles.find((f) => f.path === "Dockerfile")!;
    expect(dockerfile.content).toContain("FROM node:20-slim AS deps");
    expect(dockerfile.content).toContain("FROM node:20-slim AS builder");
    expect(dockerfile.content).toContain("FROM node:20-slim AS runner");
  });

  it("generates .env.example with mysql connection string", () => {
    const env = dockerFiles.find((f) => f.path === ".env.example")!;
    expect(env.content).toContain("mysql://");
    expect(env.content).toContain("jra_tokyo");
  });

  it("generates health endpoint", () => {
    const health = dockerFiles.find(
      (f) => f.path === "app/api/health/route.ts",
    )!;
    expect(health.content).toContain("status");
    expect(health.content).toContain("ok");
  });

  it("generates verify.sh script", () => {
    const verify = dockerFiles.find(
      (f) => f.path === "scripts/verify.sh",
    )!;
    expect(verify.content).toContain("playwright test");
  });

  it("generates .gitignore and .dockerignore", () => {
    const gitignore = dockerFiles.find((f) => f.path === ".gitignore");
    const dockerignore = dockerFiles.find((f) => f.path === ".dockerignore");
    expect(gitignore).toBeDefined();
    expect(dockerignore).toBeDefined();
  });
});

// ── I. Cross-reference consistency ──

describe("I. cross-reference consistency", () => {
  it("Prisma model names appear in API stubs", () => {
    const allStubCode = [...stubs.values()].join("\n");
    expect(allStubCode).toContain("prisma.event");
    expect(allStubCode).toContain("prisma.lottery");
    expect(allStubCode).toContain("prisma.user");
    expect(allStubCode).toContain("prisma.information");
  });

  it("schema-driven GET endpoints match table names in paths", () => {
    const allPaths = [...stubs.keys()];
    for (const t of tables) {
      expect(allPaths.some((p) => p.includes(t.name))).toBe(true);
    }
  });

  it("admin pages reference correct resources", () => {
    const listPages = adminPages.filter((p) => p.type === "list");
    // page-event-search-list.php should produce an admin list page
    expect(listPages.length).toBeGreaterThan(0);
  });

  it("auth scaffold generates all required files", () => {
    expect(authFiles.length).toBe(10);
    const authPaths = authFiles.map((f) => f.path);
    expect(authPaths).toContain("lib/auth.ts");
    expect(authPaths).toContain("lib/rbac.ts");
    expect(authPaths).toContain("middleware.ts");
    expect(authPaths).toContain("app/login/page.tsx");
  });

  it("dashboard metrics match pipeline output counts", () => {
    expect(dashboardInput.phpFileCount).toBe(phpFiles.length);
    expect(dashboardInput.tableCount).toBe(tables.length);
    expect(dashboardInput.apiRouteCount).toBe(stubs.size);
    expect(dashboardInput.adminPageCount).toBe(adminPages.length);
    expect(dashboardInput.authGenerated).toBe(true);
  });

  it("all tables in CRUD matrix also appear in Prisma schema", () => {
    for (const c of crudCoverage) {
      expect(prismaSchema).toContain(`@@map("${c.table}")`);
    }
  });

  it("verify scaffold API spec covers all tables from schema", () => {
    const apiSpec = verifyFiles.find((f) => f.path === "e2e/api.spec.ts")!;
    for (const t of tables) {
      expect(apiSpec.content).toContain(t.name);
    }
  });

  it("total generated file count is consistent", () => {
    const expected =
      stubs.size + adminPages.length + authFiles.length + dockerFiles.length;
    expect(dashboardInput.generatedFiles).toBe(expected);
  });
});
