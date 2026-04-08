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
}

// ── File generators ──

function generatePlaywrightConfig(): string {
  return `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
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

// ── Public API ──

export function generateVerifyScaffold(input: VerifyInput): VerifyScaffoldFile[] {
  return [
    {
      path: "playwright.config.ts",
      content: generatePlaywrightConfig(),
    },
    {
      path: "e2e/smoke.spec.ts",
      content: generateSmokeSpec(input),
    },
    {
      path: "e2e/verify-build.sh",
      content: generateVerifyBuildScript(),
    },
  ];
}
