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
  if (!input.tableNames || input.tableNames.length === 0) return null;

  const lines: string[] = [];
  lines.push('import { test, expect } from "@playwright/test";');
  lines.push("");

  for (const table of input.tableNames) {
    lines.push(`test.describe("${table} API", () => {`);
    lines.push(
      `  test("GET /api/${table} returns list", async ({ request }) => {`,
    );
    lines.push(`    const res = await request.get("/api/${table}");`);
    lines.push(`    expect(res.status()).toBe(200);`);
    lines.push(`    const body = await res.json();`);
    lines.push(`    expect(body).toHaveProperty("items");`);
    lines.push(`    expect(body).toHaveProperty("total");`);
    lines.push(`  });`);
    lines.push("");
    lines.push(
      `  test("GET /api/${table}/1 returns detail or 404", async ({ request }) => {`,
    );
    lines.push(`    const res = await request.get("/api/${table}/1");`);
    lines.push(`    expect([200, 404]).toContain(res.status());`);
    lines.push(`  });`);
    lines.push(`});`);
    lines.push("");
  }

  return lines.join("\n");
}

function generateAuthSpec(): string | null {
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
  lines.push(
    '  test("auth session endpoint responds", async ({ request }) => {',
  );
  lines.push('    const res = await request.get("/api/auth/session");');
  lines.push("    expect(res.status()).toBe(200);");
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

function generateAuthSetup(): string {
  return `import { test as setup, expect } from "@playwright/test";

/**
 * Global setup: log in as admin and save auth state.
 * Other test files use this via storageState in playwright.config.ts.
 */
setup("authenticate as admin", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="username"]', "admin");
  await page.fill('input[name="password"]', "admin123");
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
  }

  const apiSpec = generateApiSpec(input);
  if (apiSpec) {
    files.push({ path: "e2e/api.spec.ts", content: apiSpec });
  }

  if (input.hasAuth) {
    const authSpec = generateAuthSpec();
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

  return files;
}
