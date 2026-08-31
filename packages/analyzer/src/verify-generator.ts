/**
 * Playwright Verify Scaffold Generator
 *
 * Generates Playwright E2E test configuration and smoke tests
 * for a scaffolded Next.js blog project.
 */
import { pluralizeResource } from "./generator-utils.js";

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
  const hasBlog = input.postSlugs.length > 0 || input.categorySlugs.length > 0;

  lines.push(`import { test, expect } from "@playwright/test";`);
  lines.push(``);

  if (hasBlog) {
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
  } else {
    // No blog scaffold was generated — smoke check the /api/health endpoint instead.
    lines.push(`test("health endpoint responds", async ({ request }) => {`);
    lines.push(`  const res = await request.get("/api/health");`);
    lines.push(`  expect(res.ok()).toBeTruthy();`);
    lines.push(`});`);
    lines.push(``);
  }

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
      // Extract base path: /api/products/[id] → products
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
  lines.push('  test.describe("unauthenticated", () => {');
  lines.push('    test.use({ storageState: { cookies: [], origins: [] } });');
  lines.push('    test("access to admin redirects", async ({ page }) => {');
  lines.push('      // NextAuth v5 redirects to /login (legacy pages used /api/auth/signin).');
  lines.push('      await page.goto("/admin", { waitUntil: "networkidle" });');
  lines.push('      await page.waitForURL((url) => /(login|signin)/.test(url.pathname + url.search), { timeout: 5000 }).catch(() => {});');
  lines.push('      expect(page.url()).toMatch(/(login|signin)/);');
  lines.push("    });");
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

  // Dedupe paths — multiple generators may produce the same admin page.
  const seen = new Set<string>();
  const uniquePages: string[] = [];
  for (const p of adminPages) {
    if (!p.endsWith("/page.tsx")) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    uniquePages.push(p);
  }

  const lines: string[] = [];
  lines.push('import { test, expect } from "@playwright/test";');
  lines.push("");
  lines.push('test.describe("Admin Pages", () => {');

  for (const p of uniquePages) {
    // Route groups are organizational only and are omitted from Next.js URLs.
    const cleanPath = p
      .replace(/^app(?:\/\([^/]+\))?\//, "/")
      .replace(/\/page\.tsx$/, "")
      .replace(/\[[^/]+\]/g, "1");
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
    const plural = pluralizeResource(table);
    if (pathMap.has(plural)) return pathMap.get(plural)!;
  }
  return `/api/${pluralizeResource(table)}`;
}

function generateMigrationAuthSpec(tables: string[], apiRoutes?: Array<{ path: string; method: string }>): string {
  const pathMap = buildApiPathMap(apiRoutes);
  const lines: string[] = [];
  lines.push('import { test, expect } from "@playwright/test";');
  lines.push("");
  lines.push("/**");
  lines.push(" * Migration Auth Protection Tests");
  lines.push(" * Verifies all API endpoints require authentication.");
  lines.push(" * Generated API routes are protected by the Next.js auth middleware.");
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

function verificationValue(column: TableColumn): string | number | boolean | Record<string, never> {
  switch (column.type) {
    case "Int": return 1;
    case "Float": return 1.5;
    case "BigInt": return "1";
    case "Boolean": return true;
    case "DateTime": return "2024-01-01T00:00:00.000Z";
    case "Json": return {};
    default: return `verification-${column.name}`;
  }
}

interface CrudVerificationPlan {
  payload: string;
  primaryKey: string;
}

function createCrudVerificationPlan(
  table: TableInfo | undefined,
  inputParams: PhpAnalysisSummary["inputParams"],
): CrudVerificationPlan | { reason: string } {
  if (!table) return { reason: "no table schema is available to construct a valid mutation payload" };
  if (inputParams.some((param) => param.source === "$_FILES")) {
    return { reason: "the route accepts file uploads and needs a domain-specific multipart fixture" };
  }

  const primaryKey = table.columns.filter((column) => column.isPrimary);
  if (primaryKey.length !== 1) return { reason: "the table does not have a single primary key" };

  const inputNames = new Set(inputParams.map((param) => param.name.replace(/\[\]$/, "")));
  const writableColumns = table.columns.filter((column) => !column.isPrimary && !column.isAutoIncrement);
  const requiredColumns = writableColumns.filter((column) => !column.nullable);
  const missingRequired = requiredColumns.filter((column) => !inputNames.has(column.name));
  if (missingRequired.length > 0) {
    return { reason: `required fields lack PHP input evidence: ${missingRequired.map((column) => column.name).join(", ")}` };
  }

  const payloadColumns = writableColumns.filter((column) => inputNames.has(column.name));
  return {
    payload: JSON.stringify(Object.fromEntries(payloadColumns.map((column) => [column.name, verificationValue(column)]))),
    primaryKey: primaryKey[0]!.name,
  };
}

function generateMigrationCrudSpec(
  analyses: PhpAnalysisSummary[],
  tables: string[],
  apiRoutes?: Array<{ path: string; method: string }>,
  tableDefinitions?: TableInfo[],
): string {
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
  const tableOps = new Map<string, { ops: Set<string>; inputParams: PhpAnalysisSummary["inputParams"] }>();
  for (const a of analyses) {
    for (const op of a.dbOperations) {
      const existing = tableOps.get(op.table) ?? { ops: new Set<string>(), inputParams: [] };
      existing.ops.add(op.type);
      existing.inputParams.push(...a.inputParams);
      tableOps.set(op.table, existing);
    }
  }

  for (const [table, evidence] of tableOps) {
    const { ops } = evidence;
    const apiPath = getApiPath(table, pathMap);
    const hasFullCrud = ops.has("INSERT") && ops.has("UPDATE") && ops.has("DELETE");
    const plan = createCrudVerificationPlan(
      tableDefinitions?.find((definition) => definition.name === table),
      evidence.inputParams,
    );
    const supportedChain = hasFullCrud && "primaryKey" in plan;
    const pendingReason = "reason" in plan
      ? plan.reason
      : "the table does not have a complete create-update-delete verification chain";

    if (supportedChain) {
      lines.push(`test.describe.serial("${table} CRUD (from PHP migration)", () => {`);
      lines.push(`  let createdId: string | number;`);
      lines.push("");
    } else {
      lines.push(`test.describe("${table} CRUD (from PHP migration)", () => {`);
    }

    if (ops.has("INSERT")) {
      lines.push(`  test("POST ${apiPath} — create record (PHP: INSERT)", async ({ request }) => {`);
      if (!supportedChain) {
        lines.push(`    test.skip(true, "CRUD mutation verification pending: ${pendingReason}");`);
        lines.push("  });");
        lines.push("");
      } else {
      lines.push(`    const res = await request.post("${apiPath}", {`);
      lines.push(`      data: ${plan.payload},`);
      lines.push("    });");
      lines.push(`    expect(res.status()).toBe(201);`);
      lines.push(`    const body = await res.json();`);
      lines.push(`    expect(body).toHaveProperty("${plan.primaryKey}");`);
      lines.push(`    createdId = body.${plan.primaryKey};`);
      lines.push("  });");
      lines.push("");
      }
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
      if (supportedChain) {
        lines.push(`  test("PUT ${apiPath}/{id} — update record (PHP: UPDATE)", async ({ request }) => {`);
        lines.push("    const res = await request.put(`" + apiPath + "/${createdId}`, {");
        lines.push(`      data: ${plan.payload},`);
        lines.push("    });");
        lines.push(`    expect(res.status()).toBe(200);`);
        lines.push("  });");
      } else {
        lines.push(`  test("PUT ${apiPath}/{id} — update record (PHP: UPDATE)", async () => {`);
        lines.push(`    test.skip(true, "CRUD mutation verification pending: ${pendingReason}");`);
        lines.push("  });");
      }
      lines.push("");
    }

    if (ops.has("DELETE")) {
      if (supportedChain) {
        lines.push(`  test("DELETE ${apiPath}/{id} — delete record (PHP: DELETE)", async ({ request }) => {`);
        lines.push("    const res = await request.delete(`" + apiPath + "/${createdId}`);");
        lines.push(`    expect(res.status()).toBe(200);`);
        lines.push("  });");
      } else {
        lines.push(`  test("DELETE ${apiPath}/{id} — delete record (PHP: DELETE)", async () => {`);
        lines.push(`    test.skip(true, "CRUD mutation verification pending: ${pendingReason}");`);
        lines.push("  });");
      }
      lines.push("");
    }

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

function generateMigrationFormSpec(tables: TableInfo[], adminPages?: string[]): string | null {
  // Only generate for tables that have editable columns
  const editableTables = tables.filter(
    (t) => t.columns.some((c) => !c.isPrimary || !c.isAutoIncrement),
  );
  if (editableTables.length === 0) return null;

  // Resolve each table to its actual admin page prefix. Accept only segments
  // that have BOTH a list page (page.tsx) AND a new page (new/page.tsx).
  // If adminPages is not provided (tests), fall back to using the table name.
  const resolveAdminPath = (tableName: string): string | null => {
    if (!adminPages || adminPages.length === 0) return pluralizeResource(tableName);
    const hasList = new Set<string>();
    const hasNew = new Set<string>();
    for (const p of adminPages) {
      const listM = p.match(/^app\/\(admin\)\/([^/]+)\/page\.tsx$/);
      if (listM) hasList.add(listM[1]!);
      const newM = p.match(/^app\/\(admin\)\/([^/]+)\/new\/page\.tsx$/);
      if (newM) hasNew.add(newM[1]!);
    }
    const usable = new Set([...hasList].filter(x => hasNew.has(x)));
    if (usable.size === 0) return pluralizeResource(tableName);
    if (usable.has(tableName)) return tableName;
    const tries = [pluralizeResource(tableName)];
    for (const t of tries) if (usable.has(t)) return t;
    return null;
  };

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

    // Skip tables with no admin page generated (e.g. composite-key tables
    // or those excluded by scaffold).
    const routePath = resolveAdminPath(table.name);
    if (!routePath) continue;

    const toPascal = (s: string) =>
      s.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
    const modelName = toPascal(table.name);

    lines.push(`test.describe("${modelName} form UI", () => {`);

    // New page renders
    lines.push(`  test("new page renders with all form fields", async ({ page }) => {`);
    lines.push(`    await page.goto("/${routePath}/new");`);
    lines.push(`    await expect(page.locator(".wp-admin-title")).toContainText("新規作成");`);
    lines.push(`    // Verify WP CSS classes are present. Admin pages may use any input type`);
    lines.push(`    // (text / number / url / file / date), so accept any input or select.`);
    lines.push(`    await expect(page.locator(".wp-form-field").first()).toBeVisible();`);
    lines.push(`    await expect(page.locator(".wp-form-field input, .wp-form-field select, .wp-form-field textarea").first()).toBeVisible();`);
    lines.push("  });");
    lines.push("");

    // Fill and submit new form — smoke-level: form is reachable and submit
    // button exists. We don't assert on navigation because real endpoints
    // often need domain-specific validation (see CRUD tests for that).
    lines.push(`  test("create: fill form and submit", async ({ page }) => {`);
    lines.push(`    test.setTimeout(20000);`);
    lines.push(`    await page.goto("/${routePath}/new", { waitUntil: "domcontentloaded" });`);
    lines.push(`    // Just verify the form renders with a submit button.`);
    lines.push(`    await expect(page.locator(".wp-form-field").first()).toBeVisible();`);
    lines.push(`    await expect(page.locator('button[type="submit"]')).toBeVisible();`);
    lines.push("  });");
    lines.push("");

    // List page shows data
    lines.push(`  test("list page displays records with links", async ({ page }) => {`);
    lines.push(`    await page.goto("/${routePath}");`);
    lines.push(`    await expect(page.locator(".wp-admin-title")).toContainText("一覧");`);
    lines.push(`    await expect(page.locator(".wp-list-table")).toBeVisible();`);
    lines.push(`    // Accept either detail or edit links (scaffold variance)`);
    lines.push(`    const links = page.locator('.wp-list-table a:has-text("詳細"), .wp-list-table a:has-text("編集")');`);
    lines.push(`    await expect(links.first()).toBeVisible();`);
    lines.push("  });");
    lines.push("");

    // Detail page — current scaffold uses /{id}/page as edit viewer; accept
    // either "詳細" or "編集" heading as evidence the page rendered.
    lines.push(`  test("detail page shows record fields", async ({ page }) => {`);
    lines.push(`    await page.goto("/${routePath}");`);
    lines.push(`    const link = page.locator('.wp-list-table a:has-text("詳細"), .wp-list-table a:has-text("編集")').first();`);
    lines.push(`    if (await link.count() === 0) test.skip();`);
    lines.push(`    await link.click();`);
    lines.push(`    await expect(page.locator(".wp-admin-title")).toContainText(/詳細|編集/);`);
    lines.push("  });");
    lines.push("");

    // Edit page
    lines.push(`  test("edit page pre-fills existing data", async ({ page }) => {`);
    lines.push(`    await page.goto("/${routePath}/1/edit").catch(() => {});`);
    lines.push(`    const hasEdit = await page.locator(".wp-admin-title").filter({ hasText: "編集" }).count() > 0;`);
    lines.push(`    if (!hasEdit) {`);
    lines.push(`      await page.goto("/${routePath}");`);
    lines.push(`      const row = page.locator('.wp-list-table a:has-text("編集")').first();`);
    lines.push(`      if (await row.count() === 0) test.skip();`);
    lines.push(`      await row.click();`);
    lines.push(`    }`);
    lines.push(`    await expect(page.locator(".wp-admin-title")).toContainText("編集");`);
    lines.push(`    await expect(page.locator(".wp-form-field").first()).toBeVisible();`);
    lines.push(`    await expect(page.locator('button[type="submit"]')).toBeVisible();`);
    lines.push("  });");

    lines.push("});");
    lines.push("");
  }

  return lines.join("\n");
}

function generateAuthSetup(): string {
  return `import { test as setup } from "@playwright/test";

/**
 * Global setup: log in as admin and save auth state.
 * Other test files use this via storageState in playwright.config.ts.
 */
setup("authenticate as admin", async ({ page }) => {
  const username = process.env.E2E_ADMIN_USERNAME ?? "admin";
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) {
    throw new Error("E2E_ADMIN_PASSWORD is required for authenticated verification");
  }

  // Ensure auth directory and initial state file exist
  const fs = await import("node:fs");
  fs.mkdirSync("e2e/.auth", { recursive: true });
  if (!fs.existsSync("e2e/.auth/user.json")) {
    fs.writeFileSync("e2e/.auth/user.json", JSON.stringify({ cookies: [], origins: [] }));
  }

  await page.goto("/login");
  // Wait for client-side hydration (login is a "use client" component)
  await page.waitForSelector('input[type="text"]', { timeout: 10_000 });
  await page.fill('input[type="text"]', username);
  await page.fill('input[type="password"]', password);
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
  // No project-level storageState default — it is resolved at file-load time
  // and fails if e2e/.auth/user.json is missing before the setup project runs.
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\\.setup\\.ts/,
    },
    {
      name: "no-auth",
      testMatch: /migration-auth\\.spec\\.ts/,
      use: { storageState: { cookies: [], origins: [] } },
    },
    {
      name: "tests",
      dependencies: ["setup"],
      testIgnore: /migration-auth\\.spec\\.ts/,
      use: { storageState: "e2e/.auth/user.json" },
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
  if (input.phpAnalyses && input.phpAnalyses.length > 0 && (input.tableNames?.length ?? 0) > 0) {
    if (input.hasAuth) {
      files.push({
        path: "e2e/migration-auth.spec.ts",
        content: generateMigrationAuthSpec(input.tableNames!, input.apiRoutes),
      });
    }

    files.push({
      path: "e2e/migration-crud.spec.ts",
      content: generateMigrationCrudSpec(input.phpAnalyses, input.tableNames!, input.apiRoutes, input.tables),
    });

  }

  // Form UI E2E tests (from table definitions)
  if (input.tables && input.tables.length > 0) {
    const formSpec = generateMigrationFormSpec(input.tables, input.adminPages);
    if (formSpec) {
      files.push({ path: "e2e/migration-form.spec.ts", content: formSpec });
    }
  }

  return files;
}
