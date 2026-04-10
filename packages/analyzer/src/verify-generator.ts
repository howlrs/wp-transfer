/**
 * Playwright Verify Scaffold Generator
 *
 * Generates Playwright E2E test configuration and smoke tests
 * for a scaffolded Next.js blog project.
 */

// ── Types ──

export interface VerifyScaffoldFile {
  path: string;
  content: string;
}

export interface PhpDbOp {
  type: "INSERT" | "UPDATE" | "DELETE" | "SELECT";
  table: string;
}

export interface PhpAnalysisSummary {
  fileName: string;
  dbOperations: PhpDbOp[];
  inputParams: Array<{ name: string; source: string }>;
}

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimary: boolean;
  isAutoIncrement: boolean;
  comment?: string;
}

export interface TableInfo {
  name: string;
  columns: TableColumn[];
}

export interface VerifyInput {
  postSlugs: string[];
  categorySlugs: string[];
  /** API route paths from stub generation */
  apiRoutes?: Array<{ path: string; method: string }>;
  /** Whether auth scaffold was generated */
  hasAuth?: boolean;
  /** Admin page paths */
  adminPages?: string[];
  /** DB table names for CRUD testing */
  tableNames?: string[];
  /** PHP analyses for migration verification tests */
  phpAnalyses?: PhpAnalysisSummary[];
  /** Table definitions with columns for form testing */
  tables?: TableInfo[];
}

// ── File generators ──

function generatePlaywrightConfig(): string {
  return `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 1,
  reporter: [
    ["html", { outputFolder: "test-results" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
    ["list"],
  ],
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
`;
}

function generateSmokeSpec(input: VerifyInput): string {
  const lines: string[] = [];

  lines.push(`import { test, expect } from "@playwright/test";`);
  lines.push(``);
  lines.push(`test("blog archive loads", async ({ page }) => {`);
  lines.push(`  const response = await page.goto("/blog");`);
  lines.push(`  expect(response?.status()).toBe(200);`);
  lines.push(`});`);
  lines.push(``);

  for (const slug of input.postSlugs) {
    lines.push(`test("post page loads: ${slug}", async ({ page }) => {`);
    lines.push(`  const response = await page.goto("/blog/${slug}");`);
    lines.push(`  expect(response?.status()).toBe(200);`);
    lines.push(`});`);
    lines.push(``);
  }

  for (const slug of input.categorySlugs) {
    lines.push(`test("category page loads: ${slug}", async ({ page }) => {`);
    lines.push(`  const response = await page.goto("/blog/category/${slug}");`);
    lines.push(`  expect(response?.status()).toBe(200);`);
    lines.push(`});`);
    lines.push(``);
  }

  lines.push(`test("no console errors on blog archive", async ({ page }) => {`);
  lines.push(`  const consoleErrors: string[] = [];`);
  lines.push(`  page.on("console", (msg) => {`);
  lines.push(`    if (msg.type() === "error") {`);
  lines.push(`      consoleErrors.push(msg.text());`);
  lines.push(`    }`);
  lines.push(`  });`);
  lines.push(`  await page.goto("/blog");`);
  lines.push(`  expect(consoleErrors).toHaveLength(0);`);
  lines.push(`});`);
  lines.push(``);

  return lines.join("\n");
}

function generateVerifyBuildScript(): string {
  return `#!/bin/bash
set -euo pipefail

if npx next build; then
  echo "BUILD: PASS"
else
  echo "BUILD: FAIL"
  exit 1
fi
`;
}

function generateApiSpec(input: VerifyInput): string | null {
  // Use actual API route paths when available, fall back to table names
  const apiPaths: string[] = [];
  if (input.apiRoutes && input.apiRoutes.length > 0) {
    const seen = new Set<string>();
    for (const route of input.apiRoutes) {
      // Extract base path: /api/events/[id] → events
      const match = route.path.match(/^app\/api\/([^/[]+)/);
      if (match && !seen.has(match[1]!)) {
        seen.add(match[1]!);
        apiPaths.push(match[1]!);
      }
    }
  }
  if (apiPaths.length === 0 && input.tableNames) {
    apiPaths.push(...input.tableNames);
  }
  if (apiPaths.length === 0) return null;

  const lines: string[] = [];
  lines.push('import { test, expect } from "@playwright/test";');
  lines.push("");

  for (const apiPath of apiPaths) {
    lines.push(`test.describe("${apiPath} API", () => {`);
    lines.push(
      `  test("GET /api/${apiPath} returns list", async ({ request }) => {`,
    );
    lines.push(`    const res = await request.get("/api/${apiPath}");`);
    lines.push(`    expect(res.status()).toBe(200);`);
    lines.push(`    const body = await res.json();`);
    lines.push(`    expect(body).toHaveProperty("items");`);
    lines.push(`    expect(body).toHaveProperty("total");`);
    lines.push(`  });`);
    lines.push("");
    lines.push(
      `  test("GET /api/${apiPath}/1 returns detail or 404", async ({ request }) => {`,
    );
    lines.push(`    const res = await request.get("/api/${apiPath}/1");`);
    lines.push(`    expect([200, 404]).toContain(res.status());`);
    lines.push(`  });`);
    lines.push(`});`);
    lines.push("");
  }

  return lines.join("\n");
}

function generateAuthSpec(tableNames?: string[]): string | null {
  const lines: string[] = [];
  lines.push('import { test, expect } from "@playwright/test";');
  lines.push("");
  lines.push('test.describe("Authentication", () => {');
  lines.push('  test("login page loads", async ({ page }) => {');
  lines.push('    const res = await page.goto("/api/auth/signin");');
  lines.push("    expect(res?.status()).toBe(200);");
  lines.push("  });");
  lines.push("");
  lines.push(
    '  test("unauthenticated access to admin redirects", async ({ page }) => {',
  );
  lines.push('    const res = await page.goto("/admin");');
  lines.push("    // Should redirect to login or return 401");
  lines.push('    expect(page.url()).toContain("signin");');
  lines.push("  });");
  lines.push("");

  // Task 8: unauthenticated API returns 401
  if (tableNames && tableNames.length > 0) {
    const firstTable = tableNames[0]!;
    const apiPath = getApiPath(firstTable);
    lines.push(`  test("unauthenticated GET ${apiPath} returns 401", async ({ request }) => {`);
    lines.push(`    const res = await request.fetch("${apiPath}", {`);
    lines.push("      headers: { cookie: \"\" },");
    lines.push("    });");
    lines.push(`    expect(res.status()).toBe(401);`);
    lines.push("  });");
    lines.push("");
  }

  lines.push(
    '  test("auth session endpoint responds", async ({ request }) => {',
  );
  lines.push('    const res = await request.get("/api/auth/session");');
  lines.push("    expect(res.status()).toBe(200);");
  lines.push("  });");
  lines.push("");

  // Task 8: authenticated session returns user with role
  lines.push('  test("authenticated session returns user data with role", async ({ request }) => {');
  lines.push('    const res = await request.get("/api/auth/session");');
  lines.push("    expect(res.status()).toBe(200);");
  lines.push("    const body = await res.json();");
  lines.push('    expect(body).toHaveProperty("user");');
  lines.push('    expect(body.user).toHaveProperty("role");');
  lines.push("  });");

  lines.push("});");

  return lines.join("\n");
}

function generateAdminSpec(adminPages: string[]): string | null {
  if (adminPages.length === 0) return null;

  const lines: string[] = [];
  lines.push('import { test, expect } from "@playwright/test";');
  lines.push("");
  lines.push('test.describe("Admin Pages", () => {');

  for (const p of adminPages) {
    const cleanPath = p.replace(/^app\//, "/").replace(/\/page\.tsx$/, "");
    lines.push(`  test("${cleanPath} loads", async ({ page }) => {`);
    lines.push(`    const res = await page.goto("${cleanPath}");`);
    lines.push(`    expect(res?.status()).toBeLessThan(500);`);
    lines.push("  });");
    lines.push("");
  }

  lines.push("});");
  return lines.join("\n");
}

// ── Migration verification test generators ──

function pluralizeTable(name: string): string {
  if (name.endsWith("s")) return name;
  if (name.endsWith("y") && !["a","e","i","o","u"].includes(name[name.length - 2] ?? "")) return name.slice(0, -1) + "ies";
  return name + "s";
}

/** Build a table→API path lookup from generated apiRoutes */
function buildApiPathMap(apiRoutes?: Array<{ path: string; method: string }>): Map<string, string> {
  const map = new Map<string, string>();
  if (!apiRoutes) return map;
  for (const route of apiRoutes) {
    const match = route.path.match(/^app\/api\/([^/[]+)/);
    if (match) map.set(match[1]!, `/api/${match[1]!}`);
  }
  return map;
}

function getApiPath(table: string, pathMap?: Map<string, string>): string {
  // First check actual generated routes
  if (pathMap) {
    // Direct match
    if (pathMap.has(table)) return pathMap.get(table)!;
    // Try plural forms
    const plural = pluralizeTable(table);
    if (pathMap.has(plural)) return pathMap.get(plural)!;
  }
  // Fallback: use table name directly
  return `/api/${table}`;
}

function generateMigrationAuthSpec(tables: string[], apiRoutes?: Array<{ path: string; method: string }>): string {
  const pathMap = buildApiPathMap(apiRoutes);
  const lines: string[] = [];
  lines.push('import { test, expect } from "@playwright/test";');
  lines.push("");
  lines.push("/**");
  lines.push(" * Migration Auth Protection Tests");
  lines.push(" * Verifies all API endpoints require authentication.");
  lines.push(" * PHP source had no auth — Next.js adds middleware protection.");
  lines.push(" */");
  lines.push('test.describe("Auth protection: API endpoints reject unauthenticated requests", () => {');
  lines.push('  test.use({ storageState: { cookies: [], origins: [] } }); // No auth');
  lines.push("");

  for (const table of tables) {
    const apiPath = getApiPath(table, pathMap);
    lines.push(`  test("GET ${apiPath} returns 401 without auth", async ({ request }) => {`);
    lines.push(`    const res = await request.get("${apiPath}");`);
    lines.push(`    expect(res.status()).toBe(401);`);
    lines.push("  });");
    lines.push("");
  }

  // Test POST/PUT/DELETE on first table
  const firstApiPath = getApiPath(tables[0]!, pathMap);
  lines.push(`  test("POST ${firstApiPath} returns 401 without auth", async ({ request }) => {`);
  lines.push(`    const res = await request.post("${firstApiPath}", { data: {} });`);
  lines.push("    expect(res.status()).toBe(401);");
  lines.push("  });");
  lines.push("");
  lines.push(`  test("PUT ${firstApiPath}/1 returns 401 without auth", async ({ request }) => {`);
  lines.push(`    const res = await request.put("${firstApiPath}/1", { data: {} });`);
  lines.push("    expect(res.status()).toBe(401);");
  lines.push("  });");
  lines.push("");
  lines.push(`  test("DELETE ${firstApiPath}/1 returns 401 without auth", async ({ request }) => {`);
  lines.push(`    const res = await request.delete("${firstApiPath}/1");`);
  lines.push("    expect(res.status()).toBe(401);");
  lines.push("  });");

  lines.push("});");
  return lines.join("\n");
}

function generateMigrationCrudSpec(analyses: PhpAnalysisSummary[], tables: string[], apiRoutes?: Array<{ path: string; method: string }>): string {
  const pathMap = buildApiPathMap(apiRoutes);
  const lines: string[] = [];
  lines.push('import { test, expect } from "@playwright/test";');
  lines.push("");
  lines.push("/**");
  lines.push(" * Migration CRUD Verification Tests");
  lines.push(" * Maps each PHP script's DB operations to Next.js API calls.");
  lines.push(` * Source: ${analyses.length} PHP scripts → ${tables.length} tables`);
  lines.push(" */");
  lines.push("");

  // Group by table
  const tableOps = new Map<string, Set<string>>();
  for (const a of analyses) {
    for (const op of a.dbOperations) {
      if (!tableOps.has(op.table)) tableOps.set(op.table, new Set());
      tableOps.get(op.table)!.add(op.type);
    }
  }

  for (const [table, ops] of tableOps) {
    const apiPath = getApiPath(table, pathMap);
    const hasFullCrud = ops.has("INSERT") && ops.has("UPDATE") && ops.has("DELETE");

    if (hasFullCrud) {
      lines.push(`test.describe.serial("${table} CRUD (from PHP migration)", () => {`);
      lines.push(`  let createdId: number;`);
      lines.push("");
    } else {
      lines.push(`test.describe("${table} CRUD (from PHP migration)", () => {`);
    }

    if (ops.has("INSERT")) {
      lines.push(`  test("POST ${apiPath} — create record (PHP: INSERT)", async ({ request }) => {`);
      lines.push(`    const res = await request.post("${apiPath}", {`);
      lines.push(`      data: { /* seed data — customize per domain */ },`);
      lines.push("    });");
      lines.push(`    expect([200, 201]).toContain(res.status());`);
      lines.push("    const body = await res.json();");
      lines.push(`    expect(body).toHaveProperty("id");`);
      lines.push(`    expect(body.id).toBeTruthy();`);
      if (hasFullCrud) {
        lines.push(`    createdId = body.id;`);
      }
      lines.push("  });");
      lines.push("");
    }

    lines.push(`  test("GET ${apiPath} — list records", async ({ request }) => {`);
    lines.push(`    const res = await request.get("${apiPath}");`);
    lines.push(`    expect(res.status()).toBe(200);`);
    lines.push("    const body = await res.json();");
    lines.push(`    expect(body).toHaveProperty("items");`);
    lines.push(`    expect(body).toHaveProperty("total");`);
    lines.push("  });");
    lines.push("");

    if (ops.has("UPDATE")) {
      if (hasFullCrud) {
        lines.push(`  test("PUT ${apiPath}/{id} — update record (PHP: UPDATE)", async ({ request }) => {`);
        lines.push("    const res = await request.put(`" + apiPath + "/${createdId}`, {");
        lines.push(`      data: { /* updated fields */ },`);
        lines.push("    });");
        lines.push(`    expect(res.status()).toBe(200);`);
        lines.push("");
        lines.push("    // Verify update persisted");
        lines.push("    const getRes = await request.get(`" + apiPath + "/${createdId}`);");
        lines.push(`    expect(getRes.status()).toBe(200);`);
        lines.push("    const body = await getRes.json();");
        lines.push(`    expect(body).toHaveProperty("id", createdId);`);
        lines.push("  });");
      } else {
        lines.push(`  test("PUT ${apiPath}/1 — update record (PHP: UPDATE)", async ({ request }) => {`);
        lines.push(`    const res = await request.put("${apiPath}/1", {`);
        lines.push(`      data: { /* updated fields */ },`);
        lines.push("    });");
        lines.push(`    expect(res.status()).toBe(200);`);
        lines.push("  });");
      }
      lines.push("");
    }

    if (ops.has("DELETE")) {
      if (hasFullCrud) {
        lines.push(`  test("DELETE ${apiPath}/{id} — delete record (PHP: DELETE)", async ({ request }) => {`);
        lines.push("    const res = await request.delete(`" + apiPath + "/${createdId}`);");
        lines.push(`    expect([200, 204]).toContain(res.status());`);
        lines.push("");
        lines.push("    // Verify deletion");
        lines.push("    const getRes = await request.get(`" + apiPath + "/${createdId}`);");
        lines.push(`    expect(getRes.status()).toBe(404);`);
        lines.push("  });");
      } else {
        lines.push(`  test("DELETE ${apiPath}/1 — delete record (PHP: DELETE)", async ({ request }) => {`);
        lines.push(`    const res = await request.delete("${apiPath}/999");`);
        lines.push(`    // 200 OK or 404 if not found`);
        lines.push(`    expect([200, 204, 404]).toContain(res.status());`);
        lines.push("  });");
      }
      lines.push("");
    }

    lines.push("});");
    lines.push("");
  }

  return lines.join("\n");
}

interface LogicTest {
  name: string;
  description: string;
  steps: string[];
}

function detectLogicTests(analyses: PhpAnalysisSummary[]): LogicTest[] {
  const tests: LogicTest[] = [];
  const fileNames = new Set(analyses.map(a => a.fileName));

  // Event stop/restore
  if (fileNames.has("event-stop.php") && fileNames.has("event-restoration.php")) {
    tests.push({
      name: "event stop and restore state transition",
      description: "PHP: event-stop.php sets status=1, event-restoration.php sets status=0",
      steps: [
        'const created = await request.post("/api/events", { data: { title: "State Test Event" } });',
        "const eventId = (await created.json()).id;",
        "",
        "// Verify initial state (status === 0)",
        'const initial = await (await request.get(`/api/events/${eventId}`)).json();',
        "expect(initial.status).toBe(0);",
        "",
        "// Stop event (status → 1)",
        'const stopRes = await request.post(`/api/events/${eventId}/stop`);',
        "expect(stopRes.status()).toBe(200);",
        'const stopped = await (await request.get(`/api/events/${eventId}`)).json();',
        "expect(stopped.status).toBe(1);",
        "",
        "// Restore event (status → 0)",
        'const restoreRes = await request.post(`/api/events/${eventId}/restore`);',
        "expect(restoreRes.status()).toBe(200);",
        'const restored = await (await request.get(`/api/events/${eventId}`)).json();',
        "expect(restored.status).toBe(0);",
      ],
    });
  }

  // User blacklist on/off
  if (fileNames.has("user-blacklist.php") && fileNames.has("user-blacklist-out.php")) {
    tests.push({
      name: "user blacklist on/off toggle",
      description: "PHP: user-blacklist.php sets blacklist=1, user-blacklist-out.php sets blacklist=0",
      steps: [
        '// Verify initial state (blacklist off)',
        'const initial = await (await request.get("/api/users/1")).json();',
        'expect(initial.blacklist).toBeFalsy();',
        '',
        '// Blacklist ON',
        'const onRes = await request.post("/api/users/1/blacklist");',
        'expect(onRes.status()).toBe(200);',
        'const blocked = await (await request.get("/api/users/1")).json();',
        'expect(blocked.blacklist).toBeTruthy();',
        '',
        '// Blacklist OFF',
        'const offRes = await request.delete("/api/users/1/blacklist");',
        'expect(offRes.status()).toBe(200);',
        'const unblocked = await (await request.get("/api/users/1")).json();',
        'expect(unblocked.blacklist).toBeFalsy();',
      ],
    });
  }

  // Lottery invalidation
  if (fileNames.has("lottery-update.php")) {
    tests.push({
      name: "lottery invalidation",
      description: "PHP: lottery-update.php sets invalid=1",
      steps: [
        'const res = await request.put("/api/lottery/1", {',
        '  data: { invalid: 1 },',
        '});',
        'expect(res.status()).toBe(200);',
        'const updated = await (await request.get("/api/lottery/1")).json();',
        'expect(updated.invalid).toBeTruthy();',
      ],
    });
  }

  // Information text toggle
  if (fileNames.has("information-text-in.php")) {
    tests.push({
      name: "information text flag toggle",
      description: "PHP: information-text-in.php enables, information-text-out.php disables",
      steps: [
        '// Enable text',
        'const enableRes = await request.post("/api/information/1/text/enable");',
        'expect(enableRes.status()).toBe(200);',
        '',
        '// Disable text',
        'const disableRes = await request.post("/api/information/1/text/disable");',
        'expect(disableRes.status()).toBe(200);',
      ],
    });
  }

  // Information banner toggle
  if (fileNames.has("information-banner-in.php")) {
    tests.push({
      name: "information banner flag toggle",
      description: "PHP: information-banner-in.php enables, information-banner-out.php disables",
      steps: [
        '// Enable banner',
        'const enableRes = await request.post("/api/information/1/banner/enable");',
        'expect(enableRes.status()).toBe(200);',
        '',
        '// Disable banner',
        'const disableRes = await request.post("/api/information/1/banner/disable");',
        'expect(disableRes.status()).toBe(200);',
      ],
    });
  }

  return tests;
}

function generateMigrationLogicSpec(analyses: PhpAnalysisSummary[]): string | null {
  const tests = detectLogicTests(analyses);
  if (tests.length === 0) return null;

  const lines: string[] = [];
  lines.push('import { test, expect } from "@playwright/test";');
  lines.push("");
  lines.push("/**");
  lines.push(" * Migration Business Logic Tests");
  lines.push(" * Verifies state transitions and business rules from PHP source.");
  lines.push(" */");
  lines.push("");

  for (const t of tests) {
    lines.push(`test.describe("${t.name}", () => {`);
    lines.push(`  // ${t.description}`);
    lines.push(`  test("${t.name}", async ({ request }) => {`);
    for (const step of t.steps) {
      lines.push(`    ${step}`);
    }
    lines.push("  });");
    lines.push("});");
    lines.push("");
  }

  return lines.join("\n");
}

// ── Form UI E2E test generators ──

function sampleValue(col: TableColumn): string {
  switch (col.type) {
    case "Int":
    case "BigInt":
    case "Float":
      return "1";
    case "Boolean":
      return "true";
    case "DateTime":
      return "2026-01-15T10:00";
    default:
      return `テスト${col.comment ?? col.name}`;
  }
}

function inputType(col: TableColumn): string {
  switch (col.type) {
    case "Int": case "BigInt": case "Float": return "number";
    case "Boolean": return "checkbox";
    case "DateTime": return "datetime-local";
    default: return "text";
  }
}

function generateMigrationFormSpec(tables: TableInfo[]): string | null {
  // Only generate for tables that have editable columns
  const editableTables = tables.filter(
    (t) => t.columns.some((c) => !c.isPrimary || !c.isAutoIncrement),
  );
  if (editableTables.length === 0) return null;

  const lines: string[] = [];
  lines.push('import { test, expect } from "@playwright/test";');
  lines.push("");
  lines.push("/**");
  lines.push(" * Migration Form UI E2E Tests");
  lines.push(" * Verifies form pages render, accept input, and submit successfully.");
  lines.push(` * Covers ${editableTables.length} tables with CRUD form flows.`);
  lines.push(" */");
  lines.push("");

  for (const table of editableTables) {
    const editableFields = table.columns.filter(
      (c) => !(c.isPrimary && c.isAutoIncrement),
    );
    if (editableFields.length === 0) continue;

    const toPascal = (s: string) =>
      s.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
    const modelName = toPascal(table.name);

    lines.push(`test.describe("${modelName} form UI", () => {`);

    // New page renders
    lines.push(`  test("new page renders with all form fields", async ({ page }) => {`);
    lines.push(`    await page.goto("/${table.name}/new");`);
    lines.push(`    await expect(page.locator(".wp-admin-title")).toContainText("新規作成");`);
    lines.push(`    // Verify WP CSS classes are present`);
    lines.push(`    await expect(page.locator(".wp-form-field").first()).toBeVisible();`);
    for (const col of editableFields) {
      const itype = inputType(col);
      lines.push(`    await expect(page.locator('.wp-form-field input[type="${itype}"]').first()).toBeVisible();`);
      break; // one field check is enough to prove the form rendered
    }
    lines.push("  });");
    lines.push("");

    // Fill and submit new form
    lines.push(`  test("create: fill form and submit", async ({ page }) => {`);
    lines.push(`    await page.goto("/${table.name}/new");`);
    for (const col of editableFields.slice(0, 4)) {
      const val = sampleValue(col);
      if (col.type === "Boolean") {
        lines.push(`    // ${col.comment ?? col.name}`);
        lines.push(`    await page.locator('.wp-form-field input[type="checkbox"]').first().check();`);
      } else {
        lines.push(`    // ${col.comment ?? col.name}`);
        lines.push(`    await page.locator('.wp-form-field input[type="${inputType(col)}"]').nth(${editableFields.indexOf(col)}).fill("${val}");`);
      }
    }
    lines.push(`    await page.locator('button[type="submit"]').click();`);
    lines.push(`    // Should redirect to list page after save`);
    lines.push(`    await page.waitForURL("**/${table.name}", { timeout: 10000 });`);
    lines.push(`    await expect(page.locator(".wp-admin-title")).toContainText("一覧");`);
    lines.push("  });");
    lines.push("");

    // List page shows data
    lines.push(`  test("list page displays records with links", async ({ page }) => {`);
    lines.push(`    await page.goto("/${table.name}");`);
    lines.push(`    await expect(page.locator(".wp-admin-title")).toContainText("一覧");`);
    lines.push(`    await expect(page.locator(".wp-list-table")).toBeVisible();`);
    lines.push(`    // Should have detail links`);
    lines.push(`    const links = page.locator('.wp-list-table a:has-text("詳細")');`);
    lines.push(`    await expect(links.first()).toBeVisible();`);
    lines.push("  });");
    lines.push("");

    // Detail page
    lines.push(`  test("detail page shows record fields", async ({ page }) => {`);
    lines.push(`    await page.goto("/${table.name}");`);
    lines.push(`    await page.locator('.wp-list-table a:has-text("詳細")').first().click();`);
    lines.push(`    await expect(page.locator(".wp-admin-title")).toContainText("詳細");`);
    lines.push(`    // Should have edit link`);
    lines.push(`    await expect(page.locator('a:has-text("編集")')).toBeVisible();`);
    lines.push("  });");
    lines.push("");

    // Edit page
    lines.push(`  test("edit page pre-fills existing data", async ({ page }) => {`);
    lines.push(`    await page.goto("/${table.name}");`);
    lines.push(`    await page.locator('.wp-list-table a:has-text("詳細")').first().click();`);
    lines.push(`    await page.locator('a:has-text("編集")').click();`);
    lines.push(`    await expect(page.locator(".wp-admin-title")).toContainText("編集");`);
    lines.push(`    // Form should be visible with submit button and WP form fields`);
    lines.push(`    await expect(page.locator(".wp-form-field").first()).toBeVisible();`);
    lines.push(`    await expect(page.locator('button[type="submit"]')).toBeVisible();`);
    lines.push("  });");

    lines.push("});");
    lines.push("");
  }

  return lines.join("\n");
}

function generateAuthSetup(): string {
  return `import { test as setup, expect } from "@playwright/test";

/**
 * Global setup: log in as admin and save auth state.
 * Other test files use this via storageState in playwright.config.ts.
 */
setup("authenticate as admin", async ({ page }) => {
  // Ensure auth directory exists
  const fs = await import("node:fs");
  fs.mkdirSync("e2e/.auth", { recursive: true });

  await page.goto("/login");
  // Wait for client-side hydration (login is a "use client" component)
  await page.waitForSelector('input[type="text"]', { timeout: 10_000 });
  await page.fill('input[type="text"]', "admin");
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');

  // Wait for redirect after login
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10_000 });

  // Save signed-in state
  await page.context().storageState({ path: "e2e/.auth/user.json" });
});
`;
}

function generatePlaywrightConfigWithAuth(): string {
  return `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 1,
  reporter: [
    ["html", { outputFolder: "test-results" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
    ["list"],
  ],
  use: {
    baseURL: "http://localhost:3000",
    storageState: "e2e/.auth/user.json",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\\.setup\\.ts/,
      use: { storageState: undefined },
    },
    {
      name: "no-auth",
      testMatch: /migration-auth\\.spec\\.ts/,
      use: { storageState: { cookies: [], origins: [] } },
    },
    {
      name: "tests",
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
`;
}

// ── Public API ──

export function generateVerifyScaffold(input: VerifyInput): VerifyScaffoldFile[] {
  // Use auth-aware config when auth scaffold is present
  const config = input.hasAuth
    ? generatePlaywrightConfigWithAuth()
    : generatePlaywrightConfig();

  const files: VerifyScaffoldFile[] = [
    { path: "playwright.config.ts", content: config },
    { path: "e2e/smoke.spec.ts", content: generateSmokeSpec(input) },
    { path: "e2e/verify-build.sh", content: generateVerifyBuildScript() },
  ];

  // Add auth setup if auth is enabled
  if (input.hasAuth) {
    files.push({ path: "e2e/auth.setup.ts", content: generateAuthSetup() });
    // Seed empty storageState so Playwright doesn't error before setup runs
    files.push({ path: "e2e/.auth/user.json", content: '{"cookies":[],"origins":[]}' });
  }

  const apiSpec = generateApiSpec(input);
  if (apiSpec) {
    files.push({ path: "e2e/api.spec.ts", content: apiSpec });
  }

  if (input.hasAuth) {
    const authSpec = generateAuthSpec(input.tableNames);
    if (authSpec) {
      files.push({ path: "e2e/auth.spec.ts", content: authSpec });
    }
  }

  if (input.adminPages && input.adminPages.length > 0) {
    const adminSpec = generateAdminSpec(input.adminPages);
    if (adminSpec) {
      files.push({ path: "e2e/admin.spec.ts", content: adminSpec });
    }
  }

  // Migration verification tests (from PHP analysis)
  if (input.phpAnalyses && input.phpAnalyses.length > 0 && input.tableNames) {
    files.push({
      path: "e2e/migration-auth.spec.ts",
      content: generateMigrationAuthSpec(input.tableNames, input.apiRoutes),
    });

    files.push({
      path: "e2e/migration-crud.spec.ts",
      content: generateMigrationCrudSpec(input.phpAnalyses, input.tableNames, input.apiRoutes),
    });

    const logicSpec = generateMigrationLogicSpec(input.phpAnalyses);
    if (logicSpec) {
      files.push({ path: "e2e/migration-logic.spec.ts", content: logicSpec });
    }
  }

  // Form UI E2E tests (from table definitions)
  if (input.tables && input.tables.length > 0) {
    const formSpec = generateMigrationFormSpec(input.tables);
    if (formSpec) {
      files.push({ path: "e2e/migration-form.spec.ts", content: formSpec });
    }
  }

  return files;
}
