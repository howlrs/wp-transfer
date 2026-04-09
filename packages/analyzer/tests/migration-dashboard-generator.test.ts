import { describe, it, expect } from "vitest";
import { generateMigrationDashboard } from "../src/migration-dashboard-generator.js";
import type { DashboardInput } from "../src/migration-dashboard-generator.js";

// ── Helpers ──

function makeInput(overrides?: Partial<DashboardInput>): DashboardInput {
  return {
    projectName: "my-wp-site",
    phpFileCount: 42,
    tableCount: 12,
    apiRouteCount: 8,
    adminPageCount: 3,
    authGenerated: true,
    securityIssues: [],
    crudCoverage: [
      { table: "posts", create: true, read: true, update: true, delete: true },
      { table: "users", create: true, read: true, update: false, delete: false },
    ],
    generatedFiles: 25,
    ...overrides,
  };
}

// ── Tests ──

describe("Migration Dashboard Generator", () => {
  it("generates valid HTML with DOCTYPE", () => {
    const { html } = generateMigrationDashboard(makeInput());
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("includes project name in title and h1", () => {
    const { html } = generateMigrationDashboard(makeInput({ projectName: "acme-blog" }));
    expect(html).toContain("<title>Migration Report: acme-blog</title>");
    expect(html).toContain("<h1>Migration Report: acme-blog</h1>");
  });

  it("shows correct PHP file count", () => {
    const { html } = generateMigrationDashboard(makeInput({ phpFileCount: 99 }));
    expect(html).toContain(">99</div>");
    expect(html).toContain("PHP Files");
  });

  it("shows correct table count", () => {
    const { html } = generateMigrationDashboard(makeInput({ tableCount: 7 }));
    expect(html).toContain(">7</div>");
    expect(html).toContain("DB Tables");
  });

  it("shows correct API route count and admin page count", () => {
    const { html } = generateMigrationDashboard(
      makeInput({ apiRouteCount: 15, adminPageCount: 4 }),
    );
    expect(html).toContain(">15</div>");
    expect(html).toContain("API Routes");
    expect(html).toContain(">4</div>");
    expect(html).toContain("Admin Pages");
  });

  it("shows correct generated files count", () => {
    const { html } = generateMigrationDashboard(makeInput({ generatedFiles: 50 }));
    expect(html).toContain(">50</div>");
    expect(html).toContain("Generated Files");
  });

  it("CRUD coverage table shows checkmarks for true, X for false", () => {
    const { html } = generateMigrationDashboard(
      makeInput({
        crudCoverage: [
          { table: "orders", create: true, read: false, update: true, delete: false },
        ],
      }),
    );
    // The row for "orders" should have check, X, check, X
    expect(html).toContain("orders");
    // &#10003; = checkmark, &#10007; = X
    const row = html.split("orders")[1]!.split("</tr>")[0]!;
    const checks = row.match(/&#10003;/g) ?? [];
    const crosses = row.match(/&#10007;/g) ?? [];
    expect(checks.length).toBe(2);
    expect(crosses.length).toBe(2);
  });

  it("CRUD percentage calculated correctly (2/4 full CRUD = 50%)", () => {
    const { html } = generateMigrationDashboard(
      makeInput({
        crudCoverage: [
          { table: "a", create: true, read: true, update: true, delete: true },
          { table: "b", create: true, read: true, update: true, delete: true },
          { table: "c", create: true, read: false, update: true, delete: true },
          { table: "d", create: false, read: true, update: false, delete: false },
        ],
      }),
    );
    expect(html).toContain(">50%</div>");
  });

  it("security issues listed in table", () => {
    const { html } = generateMigrationDashboard(
      makeInput({
        securityIssues: [
          { file: "admin.php", issue: "SQL injection risk" },
          { file: "upload.php", issue: "Missing CSRF token" },
        ],
      }),
    );
    expect(html).toContain("admin.php");
    expect(html).toContain("SQL injection risk");
    expect(html).toContain("upload.php");
    expect(html).toContain("Missing CSRF token");
    expect(html).toContain("Security Issues (2)");
  });

  it("empty security issues shows 'No security issues' message", () => {
    const { html } = generateMigrationDashboard(makeInput({ securityIssues: [] }));
    expect(html).toContain("No security issues detected");
    expect(html).toContain("Security Issues (0)");
  });

  it("HTML-escapes special characters in project name", () => {
    const { html } = generateMigrationDashboard(
      makeInput({ projectName: '<script>alert("xss")</script>' }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;xss&quot;");
  });

  it('returns path "report.html"', () => {
    const { path } = generateMigrationDashboard(makeInput());
    expect(path).toBe("report.html");
  });

  it("footer contains 'wp-transfer'", () => {
    const { html } = generateMigrationDashboard(makeInput());
    expect(html).toContain("wp-transfer");
  });

  it("handles zero CRUD coverage gracefully (0%)", () => {
    const { html } = generateMigrationDashboard(
      makeInput({ crudCoverage: [] }),
    );
    expect(html).toContain(">0%</div>");
  });

  it("HTML-escapes special characters in security issue fields", () => {
    const { html } = generateMigrationDashboard(
      makeInput({
        securityIssues: [
          { file: "foo&bar.php", issue: 'uses <eval> with "user" input' },
        ],
      }),
    );
    expect(html).toContain("foo&amp;bar.php");
    expect(html).toContain("&lt;eval&gt;");
    expect(html).toContain("&quot;user&quot;");
  });
});
