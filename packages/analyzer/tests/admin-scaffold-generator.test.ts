import { describe, it, expect } from "vitest";
import { generateAdminScaffold } from "../src/admin-scaffold-generator.js";
import type { AdminPage } from "../src/admin-scaffold-generator.js";
import type { PhpFileAnalysis } from "../src/php-analyzer.js";
import type { TableDefinition, ColumnDefinition } from "../src/schema-to-prisma.js";

// ── Helpers ──

function makeAnalysis(overrides: Partial<PhpFileAnalysis>): PhpFileAnalysis {
  return {
    fileName: "page-event-list.php",
    purpose: "Event list page",
    dbOperations: [],
    inputParams: [],
    outputType: "html",
    securityIssues: [],
    ...overrides,
  };
}

function makeColumn(overrides: Partial<ColumnDefinition>): ColumnDefinition {
  return {
    name: "id",
    type: "Int",
    nullable: false,
    isPrimary: true,
    isAutoIncrement: true,
    ...overrides,
  };
}

function makeTable(
  name: string,
  columns?: ColumnDefinition[],
): TableDefinition {
  return {
    name,
    columns: columns ?? [
      makeColumn({ name: "id", type: "Int", isPrimary: true, isAutoIncrement: true }),
      makeColumn({ name: "title", type: "String", isPrimary: false, isAutoIncrement: false, nullable: false, comment: "タイトル" }),
      makeColumn({ name: "status", type: "Int", isPrimary: false, isAutoIncrement: false, nullable: false, comment: "ステータス" }),
      makeColumn({ name: "created_at", type: "DateTime", isPrimary: false, isAutoIncrement: false, nullable: true, comment: "作成日時" }),
    ],
  };
}

function findPage(pages: AdminPage[], pathPattern: string): AdminPage | undefined {
  return pages.find((p) => p.path.includes(pathPattern));
}

// ── Tests ──

describe("Admin Scaffold Generator", () => {
  describe("list page generation", () => {
    it("generates a list page from page-*-list.php", () => {
      const analyses = [makeAnalysis({ fileName: "page-event-list.php" })];
      const tables = [makeTable("event")];

      const pages = generateAdminScaffold(analyses, tables);
      const listPage = findPage(pages, "events/page.tsx");

      expect(listPage).toBeDefined();
      expect(listPage!.type).toBe("list");
      expect(listPage!.content).toContain("Event 一覧");
      expect(listPage!.content).toContain("prisma.event.findMany");
    });

    it("generates table columns from the matched TableDefinition", () => {
      const analyses = [makeAnalysis({ fileName: "page-event-list.php" })];
      const tables = [makeTable("event")];

      const pages = generateAdminScaffold(analyses, tables);
      const listPage = findPage(pages, "events/page.tsx");

      expect(listPage!.content).toContain("タイトル");
      expect(listPage!.content).toContain("ステータス");
    });
  });

  describe("form page generation", () => {
    it("generates a new form page from page-*.php", () => {
      const analyses = [
        makeAnalysis({
          fileName: "page-event.php",
          inputParams: [
            { name: "title", source: "$_POST", usage: "$_POST[\"title\"]" },
            { name: "status", source: "$_POST", usage: "$_POST[\"status\"]" },
          ],
        }),
      ];
      const tables = [makeTable("event")];

      const pages = generateAdminScaffold(analyses, tables);
      const formPage = findPage(pages, "events/new/page.tsx");

      expect(formPage).toBeDefined();
      expect(formPage!.type).toBe("form");
      expect(formPage!.content).toContain("use client");
      expect(formPage!.content).toContain("新規作成");
    });

    it("generates form fields from table columns when analysis has no input params", () => {
      const analyses = [
        makeAnalysis({
          fileName: "page-event-copy.php",
          inputParams: [],
        }),
      ];
      const tables = [makeTable("event")];

      const pages = generateAdminScaffold(analyses, tables);
      const copyPage = findPage(pages, "events/[id]/copy/page.tsx");

      expect(copyPage).toBeDefined();
      expect(copyPage!.type).toBe("form");
      // Should have fields from table columns (title, status) but not auto-increment PK
      expect(copyPage!.content).toContain("title");
      expect(copyPage!.content).toContain("status");
    });

    it("generates an edit form page from page-*-update.php", () => {
      const analyses = [
        makeAnalysis({
          fileName: "page-event-update.php",
          inputParams: [
            { name: "title", source: "$_POST", usage: "$_POST[\"title\"]" },
          ],
        }),
      ];
      const tables = [makeTable("event")];

      const pages = generateAdminScaffold(analyses, tables);
      const editPage = findPage(pages, "events/[id]/page.tsx");

      expect(editPage).toBeDefined();
      expect(editPage!.type).toBe("form");
      expect(editPage!.content).toContain("use client");
      expect(editPage!.content).toContain("編集");
    });
  });

  describe("detail page generation", () => {
    it("generates a summary/detail page from page-*-summary.php", () => {
      const analyses = [makeAnalysis({ fileName: "page-event-summary.php" })];
      const tables = [makeTable("event")];

      const pages = generateAdminScaffold(analyses, tables);
      const detailPage = findPage(pages, "summary/page.tsx");

      expect(detailPage).toBeDefined();
      expect(detailPage!.type).toBe("detail");
      expect(detailPage!.content).toContain("サマリー");
    });
  });

  describe("dashboard generation", () => {
    it("always generates a dashboard page with count queries", () => {
      const analyses = [makeAnalysis({ fileName: "page-event-list.php" })];
      const tables = [makeTable("event"), makeTable("user")];

      const pages = generateAdminScaffold(analyses, tables);
      const dashboard = findPage(pages, "(admin)/page.tsx");

      expect(dashboard).toBeDefined();
      expect(dashboard!.type).toBe("dashboard");
      expect(dashboard!.content).toContain("ダッシュボード");
      expect(dashboard!.content).toContain("prisma.event.count()");
      expect(dashboard!.content).toContain("prisma.user.count()");
    });
  });

  describe("layout generation", () => {
    it("generates admin layout with sidebar menu derived from list pages", () => {
      const analyses = [
        makeAnalysis({ fileName: "page-event-list.php" }),
        makeAnalysis({ fileName: "page-information-list.php" }),
      ];
      const tables = [makeTable("event"), makeTable("information")];

      const pages = generateAdminScaffold(analyses, tables);
      const layout = findPage(pages, "layout.tsx");

      expect(layout).toBeDefined();
      expect(layout!.content).toContain("管理画面");
      expect(layout!.content).toContain("ダッシュボード");
    });
  });

  describe("route mapping", () => {
    it("maps page-event-copy.php to copy route", () => {
      const analyses = [makeAnalysis({ fileName: "page-event-copy.php" })];
      const tables = [makeTable("event")];

      const pages = generateAdminScaffold(analyses, tables);
      const copyPage = findPage(pages, "copy/page.tsx");

      expect(copyPage).toBeDefined();
      expect(copyPage!.type).toBe("form");
    });

    it("maps page-new-information.php to new route", () => {
      const analyses = [
        makeAnalysis({
          fileName: "page-new-information.php",
          inputParams: [
            { name: "title", source: "$_POST", usage: "$_POST[\"title\"]" },
          ],
        }),
      ];
      const tables = [makeTable("information")];

      const pages = generateAdminScaffold(analyses, tables);
      const newPage = findPage(pages, "informations/new/page.tsx");

      expect(newPage).toBeDefined();
      expect(newPage!.type).toBe("form");
    });
  });

  describe("Tailwind CSS output", () => {
    it("generates Tailwind classes when uiFramework is tailwind", () => {
      const analyses = [makeAnalysis({ fileName: "page-event-list.php" })];
      const tables = [makeTable("event")];

      const pages = generateAdminScaffold(analyses, tables, { uiFramework: "tailwind" });
      const listPage = findPage(pages, "events/page.tsx");

      expect(listPage).toBeDefined();
      expect(listPage!.content).toContain("className=");
      expect(listPage!.content).not.toContain("style={");
    });

    it("defaults to plain (inline styles) when no option", () => {
      const analyses = [makeAnalysis({ fileName: "page-event-list.php" })];
      const tables = [makeTable("event")];

      const pages = generateAdminScaffold(analyses, tables);
      const listPage = findPage(pages, "events/page.tsx");

      expect(listPage).toBeDefined();
      expect(listPage!.content).toContain("style={");
      expect(listPage!.content).not.toContain("className=");
    });

    it("generates Tailwind form page without inline styles", () => {
      const analyses = [
        makeAnalysis({
          fileName: "page-event.php",
          inputParams: [
            { name: "title", source: "$_POST", usage: "$_POST[\"title\"]" },
            { name: "status", source: "$_POST", usage: "$_POST[\"status\"]" },
          ],
        }),
      ];
      const tables = [makeTable("event")];

      const pages = generateAdminScaffold(analyses, tables, { uiFramework: "tailwind" });
      const formPage = findPage(pages, "events/new/page.tsx");

      expect(formPage).toBeDefined();
      expect(formPage!.content).toContain("className=");
      expect(formPage!.content).not.toContain("style={");
      expect(formPage!.content).toContain("bg-blue-600");
      expect(formPage!.content).toContain("rounded-md");
    });

    it("generates Tailwind detail page without inline styles", () => {
      const analyses = [makeAnalysis({ fileName: "page-event-summary.php" })];
      const tables = [makeTable("event")];

      const pages = generateAdminScaffold(analyses, tables, { uiFramework: "tailwind" });
      const detailPage = findPage(pages, "summary/page.tsx");

      expect(detailPage).toBeDefined();
      expect(detailPage!.content).toContain("className=");
      expect(detailPage!.content).not.toContain("style={");
    });

    it("generates Tailwind dashboard without inline styles", () => {
      const analyses = [makeAnalysis({ fileName: "page-event-list.php" })];
      const tables = [makeTable("event"), makeTable("user")];

      const pages = generateAdminScaffold(analyses, tables, { uiFramework: "tailwind" });
      const dashboard = findPage(pages, "(admin)/page.tsx");

      expect(dashboard).toBeDefined();
      expect(dashboard!.content).toContain("className=");
      expect(dashboard!.content).not.toContain("style={");
    });

    it("generates Tailwind layout without inline styles", () => {
      const analyses = [makeAnalysis({ fileName: "page-event-list.php" })];
      const tables = [makeTable("event")];

      const pages = generateAdminScaffold(analyses, tables, { uiFramework: "tailwind" });
      const layout = findPage(pages, "layout.tsx");

      expect(layout).toBeDefined();
      expect(layout!.content).toContain("className=");
      expect(layout!.content).not.toContain("style={");
    });
  });

  describe("multiple resources", () => {
    it("generates pages for multiple resources", () => {
      const analyses = [
        makeAnalysis({ fileName: "page-event-list.php" }),
        makeAnalysis({ fileName: "page-user-list.php" }),
        makeAnalysis({ fileName: "page-lottery-list.php" }),
      ];
      const tables = [
        makeTable("event"),
        makeTable("user"),
        makeTable("lottery"),
      ];

      const pages = generateAdminScaffold(analyses, tables);

      // Should have list pages + layout + dashboard
      const listPages = pages.filter((p) => p.type === "list");
      expect(listPages.length).toBe(3);

      const dashboard = findPage(pages, "(admin)/page.tsx");
      expect(dashboard).toBeDefined();
    });
  });
});
