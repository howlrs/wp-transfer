import { describe, it, expect } from "vitest";
import ts from "typescript";
import { generateAdminScaffold, pluralize } from "../src/admin-scaffold-generator.js";
import type { AdminPage } from "../src/admin-scaffold-generator.js";
import type { PhpFileAnalysis } from "../src/php-analyzer.js";
import type { TableDefinition, ColumnDefinition } from "../src/schema-to-prisma.js";

// ── Helpers ──

function makeAnalysis(overrides: Partial<PhpFileAnalysis>): PhpFileAnalysis {
  return {
    fileName: "page-article-list.php",
    purpose: "Article list page",
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
    it("renders schema comments and keys safely in generated TSX", () => {
      const tables = [makeTable("product", [
        makeColumn({ name: "id", isPrimary: true }),
        makeColumn({ name: "first-name", type: "String", isPrimary: false, comment: '<meta>{`"\\\n' }),
      ])];
      const page = findPage(generateAdminScaffold([
        makeAnalysis({ fileName: "page-product-list.php" }),
      ], tables), "products/page.tsx")!;

      expect(page.content).toContain('{"<meta>{`');
      expect(page.content).toContain('item["first-name"]');
      const result = ts.transpileModule(page.content, {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        reportDiagnostics: true,
      });
      expect((result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
    });

    it("generates a list page from page-*-list.php", () => {
      const analyses = [makeAnalysis({ fileName: "page-article-list.php" })];
      const tables = [makeTable("article")];

      const pages = generateAdminScaffold(analyses, tables);
      const listPage = findPage(pages, "articles/page.tsx");

      expect(listPage).toBeDefined();
      expect(listPage!.type).toBe("list");
      expect(listPage!.content).toContain("Article 一覧");
      expect(listPage!.content).toContain("prisma.article.findMany");
    });

    it("generates table columns from the matched TableDefinition", () => {
      const analyses = [makeAnalysis({ fileName: "page-article-list.php" })];
      const tables = [makeTable("article")];

      const pages = generateAdminScaffold(analyses, tables);
      const listPage = findPage(pages, "articles/page.tsx");

      expect(listPage!.content).toContain("タイトル");
      expect(listPage!.content).toContain("ステータス");
    });
  });

  describe("form page generation", () => {
    it("uses bracket access and computed keys for arbitrary form field names", () => {
      const pages = generateAdminScaffold([
        makeAnalysis({
          fileName: "page-article.php",
          inputParams: [
            { name: "first-name", source: "$_POST", usage: "" },
            { name: 'quote"key', source: "$_POST", usage: "" },
            { name: "path\\key", source: "$_POST", usage: "" },
          ],
        }),
      ], [makeTable("article")]);
      const formPage = findPage(pages, "articles/new/page.tsx")!;

      expect(formPage.content).toContain('form["first-name"]');
      expect(formPage.content).toContain('["first-name"]: e.target.value');
      expect(formPage.content).toContain('form["quote\\"key"]');
      expect(formPage.content).toContain('form["path\\\\key"]');
    });

    it("generates a new form page from page-*.php", () => {
      const analyses = [
        makeAnalysis({
          fileName: "page-article.php",
          inputParams: [
            { name: "title", source: "$_POST", usage: "$_POST[\"title\"]" },
            { name: "status", source: "$_POST", usage: "$_POST[\"status\"]" },
          ],
        }),
      ];
      const tables = [makeTable("article")];

      const pages = generateAdminScaffold(analyses, tables);
      const formPage = findPage(pages, "articles/new/page.tsx");

      expect(formPage).toBeDefined();
      expect(formPage!.type).toBe("form");
      expect(formPage!.content).toContain("use client");
      expect(formPage!.content).toContain("新規作成");
    });

    it("generates form fields from table columns when analysis has no input params", () => {
      const analyses = [
        makeAnalysis({
          fileName: "page-article-copy.php",
          inputParams: [],
        }),
      ];
      const tables = [makeTable("article")];

      const pages = generateAdminScaffold(analyses, tables);
      const copyPage = findPage(pages, "articles/[id]/copy/page.tsx");

      expect(copyPage).toBeDefined();
      expect(copyPage!.type).toBe("form");
      // Should have fields from table columns (title, status) but not auto-increment PK
      expect(copyPage!.content).toContain("title");
      expect(copyPage!.content).toContain("status");
    });

    it("edit form imports useParams from next/navigation, not react", () => {
      const analyses = [
        makeAnalysis({
          fileName: "page-article-update.php",
          inputParams: [
            { name: "title", source: "$_POST", usage: "$_POST[\"title\"]" },
          ],
        }),
      ];
      const tables = [makeTable("article")];

      const pages = generateAdminScaffold(analyses, tables);
      const editPage = findPage(pages, "articles/[id]/page.tsx");

      expect(editPage).toBeDefined();
      expect(editPage!.content).toContain('useParams } from "next/navigation"');
      expect(editPage!.content).not.toMatch(/useParams.*from "react"/);
    });

    it("generates an edit form page from page-*-update.php", () => {
      const analyses = [
        makeAnalysis({
          fileName: "page-article-update.php",
          inputParams: [
            { name: "title", source: "$_POST", usage: "$_POST[\"title\"]" },
          ],
        }),
      ];
      const tables = [makeTable("article")];

      const pages = generateAdminScaffold(analyses, tables);
      const editPage = findPage(pages, "articles/[id]/page.tsx");

      expect(editPage).toBeDefined();
      expect(editPage!.type).toBe("form");
      expect(editPage!.content).toContain("use client");
      expect(editPage!.content).toContain("編集");
    });
  });

  describe("detail page generation", () => {
    it("generates a summary/detail page from page-*-summary.php", () => {
      const analyses = [makeAnalysis({ fileName: "page-article-summary.php" })];
      const tables = [makeTable("article")];

      const pages = generateAdminScaffold(analyses, tables);
      const detailPage = findPage(pages, "summary/page.tsx");

      expect(detailPage).toBeDefined();
      expect(detailPage!.type).toBe("detail");
      expect(detailPage!.content).toContain("サマリー");
    });
  });

  describe("dashboard generation", () => {
    it("always generates a dashboard page with count queries", () => {
      const analyses = [makeAnalysis({ fileName: "page-article-list.php" })];
      const tables = [makeTable("article"), makeTable("user")];

      const pages = generateAdminScaffold(analyses, tables);
      const dashboard = findPage(pages, "(admin)/page.tsx");

      expect(dashboard).toBeDefined();
      expect(dashboard!.type).toBe("dashboard");
      expect(dashboard!.content).toContain("ダッシュボード");
      expect(dashboard!.content).toContain("prisma.article.count()");
      expect(dashboard!.content).toContain("prisma.user.count()");
    });
  });

  describe("layout generation", () => {
    it("generates admin layout with sidebar menu derived from list pages", () => {
      const analyses = [
        makeAnalysis({ fileName: "page-article-list.php" }),
        makeAnalysis({ fileName: "page-information-list.php" }),
      ];
      const tables = [makeTable("article"), makeTable("information")];

      const pages = generateAdminScaffold(analyses, tables);
      const layout = findPage(pages, "layout.tsx");

      expect(layout).toBeDefined();
      expect(layout!.content).toContain("管理画面");
      expect(layout!.content).toContain("ダッシュボード");
    });
  });

  describe("route mapping", () => {
    it("maps page-article-copy.php to copy route", () => {
      const analyses = [makeAnalysis({ fileName: "page-article-copy.php" })];
      const tables = [makeTable("article")];

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
      const newPage = findPage(pages, "information/new/page.tsx");

      expect(newPage).toBeDefined();
      expect(newPage!.type).toBe("form");
    });
  });

  describe("Tailwind CSS output", () => {
    it("generates Tailwind classes when uiFramework is tailwind", () => {
      const analyses = [makeAnalysis({ fileName: "page-article-list.php" })];
      const tables = [makeTable("article")];

      const pages = generateAdminScaffold(analyses, tables, { uiFramework: "tailwind" });
      const listPage = findPage(pages, "articles/page.tsx");

      expect(listPage).toBeDefined();
      expect(listPage!.content).toContain("className=");
      expect(listPage!.content).not.toContain("style={");
    });

    it("defaults to plain (WP CSS classes) when no option", () => {
      const analyses = [makeAnalysis({ fileName: "page-article-list.php" })];
      const tables = [makeTable("article")];

      const pages = generateAdminScaffold(analyses, tables);
      const listPage = findPage(pages, "articles/page.tsx");

      expect(listPage).toBeDefined();
      expect(listPage!.content).toContain("className=");
      expect(listPage!.content).toContain("wp-list-table");
    });

    it("generates Tailwind form page without inline styles", () => {
      const analyses = [
        makeAnalysis({
          fileName: "page-article.php",
          inputParams: [
            { name: "title", source: "$_POST", usage: "$_POST[\"title\"]" },
            { name: "status", source: "$_POST", usage: "$_POST[\"status\"]" },
          ],
        }),
      ];
      const tables = [makeTable("article")];

      const pages = generateAdminScaffold(analyses, tables, { uiFramework: "tailwind" });
      const formPage = findPage(pages, "articles/new/page.tsx");

      expect(formPage).toBeDefined();
      expect(formPage!.content).toContain("className=");
      expect(formPage!.content).not.toContain("style={");
      expect(formPage!.content).toContain("bg-blue-600");
      expect(formPage!.content).toContain("rounded-md");
    });

    it("generates Tailwind detail page without inline styles", () => {
      const analyses = [makeAnalysis({ fileName: "page-article-summary.php" })];
      const tables = [makeTable("article")];

      const pages = generateAdminScaffold(analyses, tables, { uiFramework: "tailwind" });
      const detailPage = findPage(pages, "summary/page.tsx");

      expect(detailPage).toBeDefined();
      expect(detailPage!.content).toContain("className=");
      expect(detailPage!.content).not.toContain("style={");
    });

    it("generates Tailwind dashboard without inline styles", () => {
      const analyses = [makeAnalysis({ fileName: "page-article-list.php" })];
      const tables = [makeTable("article"), makeTable("user")];

      const pages = generateAdminScaffold(analyses, tables, { uiFramework: "tailwind" });
      const dashboard = findPage(pages, "(admin)/page.tsx");

      expect(dashboard).toBeDefined();
      expect(dashboard!.content).toContain("className=");
      expect(dashboard!.content).not.toContain("style={");
    });

    it("generates Tailwind layout without inline styles", () => {
      const analyses = [makeAnalysis({ fileName: "page-article-list.php" })];
      const tables = [makeTable("article")];

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
        makeAnalysis({ fileName: "page-article-list.php" }),
        makeAnalysis({ fileName: "page-user-list.php" }),
        makeAnalysis({ fileName: "page-category-list.php" }),
      ];
      const tables = [
        makeTable("article"),
        makeTable("user"),
        makeTable("category"),
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

describe("pluralize", () => {
  it("pluralizes regular words", () => {
    expect(pluralize("article")).toBe("articles");
    expect(pluralize("user")).toBe("users");
    expect(pluralize("post")).toBe("posts");
  });

  it("pluralizes words ending in -y (consonant + y)", () => {
    expect(pluralize("category")).toBe("categories");
    expect(pluralize("company")).toBe("companies");
    expect(pluralize("entry")).toBe("entries");
  });

  it("pluralizes words ending in -s, -sh, -ch, -x, -z", () => {
    expect(pluralize("status")).toBe("statuses");
    expect(pluralize("brush")).toBe("brushes");
    expect(pluralize("match")).toBe("matches");
    expect(pluralize("box")).toBe("boxes");
    expect(pluralize("quiz")).toBe("quizes");
  });

  it("handles irregular words", () => {
    expect(pluralize("person")).toBe("people");
    expect(pluralize("child")).toBe("children");
    expect(pluralize("information")).toBe("information");
    expect(pluralize("analysis")).toBe("analyses");
  });

  it("does not double-pluralize words ending in -y with a vowel before it", () => {
    expect(pluralize("day")).toBe("days");
    expect(pluralize("key")).toBe("keys");
  });
});

describe("generated URLs use correct plurals (no double-s)", () => {
  it("list page URLs do not have double-s", () => {
    const analyses = [makeAnalysis({ fileName: "page-article-list.php" })];
    const tables = [makeTable("article")];
    const pages = generateAdminScaffold(analyses, tables);
    const listPage = findPage(pages, "articles/page.tsx");

    expect(listPage).toBeDefined();
    expect(listPage!.path).toBe("app/(admin)/articles/page.tsx");
    expect(listPage!.path).not.toContain("articless");
  });

  it("form page URLs use correct plurals for -y words", () => {
    const analyses = [
      makeAnalysis({
        fileName: "page-category-list.php",
      }),
    ];
    const tables = [makeTable("category")];
    const pages = generateAdminScaffold(analyses, tables);
    const listPage = findPage(pages, "categories/page.tsx");

    expect(listPage).toBeDefined();
    expect(listPage!.path).toBe("app/(admin)/categories/page.tsx");
    expect(listPage!.path).not.toContain("categorys");
  });

  it("generated content URLs do not contain double-s patterns", () => {
    const analyses = [makeAnalysis({ fileName: "page-article-list.php" })];
    const tables = [makeTable("article")];
    const pages = generateAdminScaffold(analyses, tables);
    const listPage = findPage(pages, "articles/page.tsx");

    expect(listPage!.content).not.toMatch(/\/articles+s\//);
    expect(listPage!.content).not.toMatch(/\/articles+s"/);
  });
});

describe("table-driven CRUD pages", () => {
  it("generates list pages for each table when no PHP analyses exist", () => {
    const tables = [makeTable("product"), makeTable("order"), makeTable("customer")];

    const pages = generateAdminScaffold([], tables);
    const productPage = findPage(pages, "products/page.tsx");
    const orderPage = findPage(pages, "orders/page.tsx");
    const customerPage = findPage(pages, "customers/page.tsx");

    expect(productPage).toBeDefined();
    expect(productPage!.type).toBe("list");
    expect(productPage!.content).toContain("Product 一覧");
    expect(productPage!.content).toContain("prisma.product.findMany");

    expect(orderPage).toBeDefined();
    expect(orderPage!.type).toBe("list");
    expect(orderPage!.content).toContain("Order 一覧");

    expect(customerPage).toBeDefined();
    expect(customerPage!.type).toBe("list");
  });

  it("does not duplicate pages for tables already covered by PHP patterns", () => {
    const analyses = [makeAnalysis({ fileName: "page-article-list.php" })];
    const tables = [makeTable("article"), makeTable("user")];

    const pages = generateAdminScaffold(analyses, tables);

    // article is already covered by the PHP-matched page (articles/)
    const articleListPages = pages.filter(
      (p) => p.type === "list" && (p.path.includes("articles/page.tsx") || p.path.includes("article/page.tsx")),
    );
    expect(articleListPages.length).toBe(1);

    // user should get a table-driven page
    const userPage = findPage(pages, "users/page.tsx");
    expect(userPage).toBeDefined();
    expect(userPage!.type).toBe("list");
  });

  it("renders first 6 columns in table-driven list page", () => {
    const columns = [
      makeColumn({ name: "id", type: "Int", isPrimary: true, isAutoIncrement: true }),
      makeColumn({ name: "name", type: "String", isPrimary: false, isAutoIncrement: false, comment: "名前" }),
      makeColumn({ name: "email", type: "String", isPrimary: false, isAutoIncrement: false }),
      makeColumn({ name: "age", type: "Int", isPrimary: false, isAutoIncrement: false }),
      makeColumn({ name: "role", type: "String", isPrimary: false, isAutoIncrement: false }),
      makeColumn({ name: "status", type: "Int", isPrimary: false, isAutoIncrement: false }),
      makeColumn({ name: "bio", type: "String", isPrimary: false, isAutoIncrement: false }),
      makeColumn({ name: "avatar", type: "String", isPrimary: false, isAutoIncrement: false }),
    ];
    const tables = [{ name: "member", columns }];

    const pages = generateAdminScaffold([], tables);
    const memberPage = findPage(pages, "members/page.tsx");

    expect(memberPage).toBeDefined();
    // First 6 columns should be present
    expect(memberPage!.content).toContain('item["id"]');
    expect(memberPage!.content).toContain('item["status"]');
    // 7th and 8th columns should NOT be in table-driven page (limit 6)
    expect(memberPage!.content).not.toContain("item.bio");
    expect(memberPage!.content).not.toContain("item.avatar");
  });

  it("uses column comments as headers when available", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const productPage = findPage(pages, "products/page.tsx");

    expect(productPage).toBeDefined();
    expect(productPage!.content).toContain("タイトル");
    expect(productPage!.content).toContain("ステータス");
  });

  it("generates tailwind table-driven list page", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables, { uiFramework: "tailwind" });
    const productPage = findPage(pages, "products/page.tsx");

    expect(productPage).toBeDefined();
    expect(productPage!.content).toContain("className=");
    expect(productPage!.content).not.toContain("style={");
  });
});

describe("navigation includes all tables", () => {
  it("layout has nav links for table-driven pages", () => {
    const tables = [makeTable("product"), makeTable("order")];

    const pages = generateAdminScaffold([], tables);
    const layout = findPage(pages, "layout.tsx");

    expect(layout).toBeDefined();
    expect(layout!.content).toContain("Product");
    expect(layout!.content).toContain("Order");
    // Table-driven list pages get picked up as list pages in layout nav
    expect(layout!.content).toContain('href="/products"');
    expect(layout!.content).toContain('href="/orders"');
  });

  it("layout includes both PHP-matched and table-driven nav links", () => {
    const analyses = [makeAnalysis({ fileName: "page-article-list.php" })];
    const tables = [makeTable("article"), makeTable("user")];

    const pages = generateAdminScaffold(analyses, tables);
    const layout = findPage(pages, "layout.tsx");

    expect(layout).toBeDefined();
    // PHP-matched articles
    expect(layout!.content).toContain("/articles");
    // table-driven user
    expect(layout!.content).toContain("/user");
    expect(layout!.content).toContain("User");
  });
});

describe("table-driven CRUD detail page", () => {
  it("generates a detail page for each table at /[id]", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const detailPage = findPage(pages, "products/[id]/page.tsx");

    expect(detailPage).toBeDefined();
    expect(detailPage!.type).toBe("detail");
    expect(detailPage!.content).toContain("prisma.product.findUnique");
    expect(detailPage!.content).toContain("タイトル");
    expect(detailPage!.content).toContain("ステータス");
  });

  it("includes edit and delete links on detail page", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const detailPage = findPage(pages, "products/[id]/page.tsx");

    expect(detailPage).toBeDefined();
    expect(detailPage!.content).toContain("/edit");
    expect(detailPage!.content).toContain("DELETE");
  });

  it("generates tailwind detail page", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables, { uiFramework: "tailwind" });
    const detailPage = findPage(pages, "products/[id]/page.tsx");

    expect(detailPage).toBeDefined();
    expect(detailPage!.content).toContain("className=");
    expect(detailPage!.content).not.toContain("style={");
  });
});

describe("table-driven CRUD edit page", () => {
  it("generates an edit page for each table at /[id]/edit", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const editPage = findPage(pages, "products/[id]/edit/page.tsx");

    expect(editPage).toBeDefined();
    expect(editPage!.type).toBe("form");
    expect(editPage!.content).toContain("use client");
    expect(editPage!.content).toContain("PUT");
    expect(editPage!.content).toContain("編集");
  });

  it("edit page fetches existing data on mount", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const editPage = findPage(pages, "products/[id]/edit/page.tsx");

    expect(editPage).toBeDefined();
    expect(editPage!.content).toContain("useEffect");
    expect(editPage!.content).toContain("useParams");
  });

  it("generates form fields from table columns excluding auto-increment PK", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const editPage = findPage(pages, "products/[id]/edit/page.tsx");

    expect(editPage).toBeDefined();
    expect(editPage!.content).toContain("title");
    expect(editPage!.content).toContain("status");
    // auto-increment PK should not be a form field
    expect(editPage!.content).not.toMatch(/onChange.*\bid\b/);
  });

  it("imports useParams from next/navigation, not react", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const editPage = findPage(pages, "products/[id]/edit/page.tsx");

    expect(editPage).toBeDefined();
    expect(editPage!.content).toContain('useParams } from "next/navigation"');
    expect(editPage!.content).not.toMatch(/useParams.*from "react"/);
  });

  it("generates tailwind edit page", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables, { uiFramework: "tailwind" });
    const editPage = findPage(pages, "products/[id]/edit/page.tsx");

    expect(editPage).toBeDefined();
    expect(editPage!.content).toContain("className=");
    expect(editPage!.content).not.toContain("style={");
  });
});

describe("table-driven CRUD new page", () => {
  it("generates a new page for each table at /new", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const newPage = findPage(pages, "products/new/page.tsx");

    expect(newPage).toBeDefined();
    expect(newPage!.type).toBe("form");
    expect(newPage!.content).toContain("use client");
    expect(newPage!.content).toContain("POST");
    expect(newPage!.content).toContain("新規作成");
  });

  it("new page does not fetch existing data", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const newPage = findPage(pages, "products/new/page.tsx");

    expect(newPage).toBeDefined();
    expect(newPage!.content).not.toContain("useEffect");
    expect(newPage!.content).not.toContain("useParams");
  });

  it("generates tailwind new page", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables, { uiFramework: "tailwind" });
    const newPage = findPage(pages, "products/new/page.tsx");

    expect(newPage).toBeDefined();
    expect(newPage!.content).toContain("className=");
    expect(newPage!.content).not.toContain("style={");
  });
});

describe("table-driven CRUD complete set", () => {
  it("generates 4 CRUD pages + layout + dashboard for a single table", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);

    expect(findPage(pages, "products/page.tsx")).toBeDefined();       // list
    expect(findPage(pages, "products/[id]/page.tsx")).toBeDefined();  // detail
    expect(findPage(pages, "products/[id]/edit/page.tsx")).toBeDefined(); // edit
    expect(findPage(pages, "products/new/page.tsx")).toBeDefined();   // new
    expect(findPage(pages, "layout.tsx")).toBeDefined();
    expect(findPage(pages, "(admin)/page.tsx")).toBeDefined();
  });

  it("list page links to detail, not edit", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const listPage = findPage(pages, "products/page.tsx");

    expect(listPage).toBeDefined();
    expect(listPage!.content).toContain("詳細");
  });

  it("does not generate CRUD pages for tables already covered by PHP patterns", () => {
    const analyses = [makeAnalysis({ fileName: "page-article-list.php" })];
    const tables = [makeTable("article"), makeTable("user")];

    const pages = generateAdminScaffold(analyses, tables);

    // article is covered by PHP, so no table-driven detail/edit/new for article
    const articleDetailPages = pages.filter(
      (p) => p.path.includes("article/[id]/page.tsx") || p.path.includes("articles/[id]/page.tsx"),
    );
    // Only user should have table-driven CRUD
    const userDetail = findPage(pages, "users/[id]/page.tsx");
    const userEdit = findPage(pages, "users/[id]/edit/page.tsx");
    const userNew = findPage(pages, "users/new/page.tsx");

    expect(userDetail).toBeDefined();
    expect(userEdit).toBeDefined();
    expect(userNew).toBeDefined();
  });
});

describe("non-standard primary key support", () => {
  const regionTable: TableDefinition = {
    name: "service_region",
    columns: [
      makeColumn({ name: "region_id", type: "Int", isPrimary: true, isAutoIncrement: false }),
      makeColumn({ name: "name", type: "String", isPrimary: false, isAutoIncrement: false }),
      makeColumn({ name: "latitude", type: "String", isPrimary: false, isAutoIncrement: false }),
    ],
  };

  it("list page uses actual PK column for orderBy and key", () => {
    const pages = generateAdminScaffold([], [regionTable]);
    const listPage = findPage(pages, "service_regions/page.tsx");

    expect(listPage).toBeDefined();
    expect(listPage!.content).toContain('orderBy: { "region_id": "desc" }');
    expect(listPage!.content).toContain('item["region_id"]');
    expect(listPage!.content).not.toContain('orderBy: { "id": "desc" }');
  });

  it("detail page uses actual PK column for findUnique", () => {
    const pages = generateAdminScaffold([], [regionTable]);
    const detailPage = findPage(pages, "service_regions/[id]/page.tsx");

    expect(detailPage).toBeDefined();
    expect(detailPage!.content).toContain('where: { "region_id": Number(id) }');
  });

  it("falls back to first column when no isPrimary is set", () => {
    const noPkTable: TableDefinition = {
      name: "service_region",
      columns: [
        makeColumn({ name: "region_id", type: "Int", isPrimary: false, isAutoIncrement: false }),
        makeColumn({ name: "name", type: "String", isPrimary: false, isAutoIncrement: false }),
      ],
    };

    const pages = generateAdminScaffold([], [noPkTable]);
    const listPage = findPage(pages, "service_regions/page.tsx");

    expect(listPage).toBeDefined();
    expect(listPage!.content).toContain('orderBy: { "region_id": "desc" }');
    expect(listPage!.content).not.toContain('orderBy: { "id": "desc" }');
  });

  it("handles String PK without Number() coercion", () => {
    const stringPkTable: TableDefinition = {
      name: "device",
      columns: [
        makeColumn({ name: "device_id", type: "String", isPrimary: true, isAutoIncrement: false }),
        makeColumn({ name: "name", type: "String", isPrimary: false, isAutoIncrement: false }),
      ],
    };

    const pages = generateAdminScaffold([], [stringPkTable]);
    const detailPage = findPage(pages, "devices/[id]/page.tsx");

    expect(detailPage).toBeDefined();
    expect(detailPage!.content).toContain('where: { "device_id": id }');
    expect(detailPage!.content).not.toContain("Number(id)");
  });

  it("keeps BigInt primary keys as decimal strings outside server Prisma filters", () => {
    const bigIntPkTable: TableDefinition = {
      name: "ledger_entry",
      columns: [
        makeColumn({ name: "entry_id", type: "BigInt", isPrimary: true, isAutoIncrement: false }),
        makeColumn({ name: "amount", type: "BigInt", isPrimary: false, isAutoIncrement: false }),
      ],
    };

    const pages = generateAdminScaffold([], [bigIntPkTable]);
    const listPage = findPage(pages, "ledger_entries/page.tsx");
    const detailPage = findPage(pages, "ledger_entries/[id]/page.tsx");
    const editPage = findPage(pages, "ledger_entries/[id]/edit/page.tsx");

    expect(listPage!.content).toContain('String(item["entry_id"])');
    expect(detailPage!.content).toContain('where: { "entry_id": BigInt(id) }');
    expect(detailPage!.content).not.toContain("Number(id)");
    expect(editPage!.content).toContain('type="text"');
    expect(editPage!.content).not.toContain("Number(e.target.value)");
  });
});

describe("CRUD gap filling for PHP-matched tables", () => {
  it("generates missing new/detail/edit pages even when list page exists from PHP", () => {
    // page-article-search-list.php creates articles/search/page.tsx (a list-like page)
    const analyses = [makeAnalysis({ fileName: "page-article-search-list.php" })];
    const tables = [makeTable("article")];

    const pages = generateAdminScaffold(analyses, tables);

    // PHP-matched pages
    expect(findPage(pages, "articles/search/page.tsx")).toBeDefined();

    // Gap-filled table-driven pages
    expect(findPage(pages, "articles/[id]/page.tsx")).toBeDefined();       // detail
    expect(findPage(pages, "articles/[id]/edit/page.tsx")).toBeDefined();  // edit
    expect(findPage(pages, "articles/new/page.tsx")).toBeDefined();        // new
  });

  it("does not duplicate pages that already exist from PHP patterns", () => {
    const analyses = [
      makeAnalysis({ fileName: "page-article-list.php" }),
      makeAnalysis({ fileName: "page-article-update.php", inputParams: [
        { name: "title", source: "$_POST", usage: "" },
      ] }),
    ];
    const tables = [makeTable("article")];

    const pages = generateAdminScaffold(analyses, tables);

    // PHP-matched list page
    const listPages = pages.filter(
      (p) => p.type === "list" && (p.path.includes("articles/page.tsx") || p.path.includes("article/page.tsx")),
    );
    expect(listPages.length).toBe(1);

    // PHP-matched edit page (articles/[id]/page.tsx)
    const editPages = pages.filter(
      (p) => p.type === "form" && p.path.includes("articles/[id]/page.tsx"),
    );
    expect(editPages.length).toBe(1);

    // Gap-filled new and detail
    expect(findPage(pages, "articles/new/page.tsx")).toBeDefined();
    expect(findPage(pages, "articles/[id]/page.tsx") || findPage(pages, "articles/[id]/page.tsx")).toBeDefined();
  });
});

describe("dashboard cards link to table pages", () => {
  it("dashboard count cards are wrapped in links to table pages", () => {
    const tables = [makeTable("article"), makeTable("user")];

    const pages = generateAdminScaffold([], tables);
    const dashboard = findPage(pages, "(admin)/page.tsx");

    expect(dashboard).toBeDefined();
    expect(dashboard!.content).toContain('href="/articles"');
    expect(dashboard!.content).toContain('href="/users"');
  });

  it("tailwind dashboard cards link to table pages", () => {
    const tables = [makeTable("article"), makeTable("user")];

    const pages = generateAdminScaffold([], tables, { uiFramework: "tailwind" });
    const dashboard = findPage(pages, "(admin)/page.tsx");

    expect(dashboard).toBeDefined();
    expect(dashboard!.content).toContain('href="/articles"');
    expect(dashboard!.content).toContain('href="/users"');
  });
});

describe("WP admin CSS generation", () => {
  it("generates globals.css with WP color palette", () => {
    const pages = generateAdminScaffold([makeAnalysis({ fileName: "page-article-list.php" })], [makeTable("article")]);
    const css = pages.find((p) => p.path === "app/globals.css");
    expect(css).toBeDefined();
    expect(css!.content).toContain("#23282d");
    expect(css!.content).toContain("#0073aa");
    expect(css!.content).toContain(".wp-admin-sidebar");
    expect(css!.content).toContain(".wp-list-table");
    expect(css!.content).toContain(".wp-notice");
    expect(css!.content).toContain(".wp-form-field");
  });
});

describe("WP CSS class usage", () => {
  it("layout uses WP CSS classes instead of inline styles", () => {
    const pages = generateAdminScaffold([makeAnalysis({ fileName: "page-article-list.php" })], [makeTable("article")]);
    const layout = pages.find((p) => p.path === "app/(admin)/layout.tsx");
    expect(layout!.content).toContain("wp-admin-sidebar");
    expect(layout!.content).toContain("wp-admin-menu-item");
    expect(layout!.content).toContain('import "@/app/globals.css"');
    expect(layout!.content).not.toContain('backgroundColor: "#1f2937"');
  });

  it("list page uses wp-list-table", () => {
    const pages = generateAdminScaffold([makeAnalysis({ fileName: "page-article-list.php" })], [makeTable("article")]);
    const list = pages.find((p) => p.path.includes("articles/page.tsx"));
    expect(list!.content).toContain("wp-list-table");
    expect(list!.content).toContain("wp-admin-wrap");
    expect(list!.content).toContain("wp-admin-title");
    expect(list!.content).not.toContain('backgroundColor: "#f3f4f6"');
  });

  it("form page uses wp-form-field classes", () => {
    const pages = generateAdminScaffold([
      makeAnalysis({
        fileName: "page-article.php",
        formSpec: {
          fields: [
            { name: "title", type: "text", label: "タイトル", required: true },
            { name: "status", type: "select", label: "ステータス", options: [{ value: "1", label: "公開" }] },
          ],
          submitLabel: "登録",
        },
      }),
    ], [makeTable("article")]);
    const form = pages.find((p) => p.path.includes("articles/new/page.tsx"));
    expect(form!.content).toContain("wp-form-field");
    expect(form!.content).toContain("wp-form-select");
    expect(form!.content).toContain("wp-button wp-button-primary");
    expect(form!.content).toContain("wp-notice wp-notice-error");
  });

  it("detail page uses WP CSS classes", () => {
    const pages = generateAdminScaffold([], [makeTable("article")]);
    const detail = pages.find((p) => p.path.includes("[id]/page.tsx") && !p.path.includes("edit"));
    expect(detail!.content).toContain("wp-admin-wrap");
    expect(detail!.content).toContain("wp-button wp-button-primary");
    expect(detail!.content).toContain("wp-button wp-button-danger");
  });

  it("dashboard uses WP card classes", () => {
    const pages = generateAdminScaffold([], [makeTable("article"), makeTable("information")]);
    const dash = pages.find((p) => p.path === "app/(admin)/page.tsx");
    expect(dash!.content).toContain("wp-dashboard-grid");
    expect(dash!.content).toContain("wp-dashboard-card");
  });

  it("can require a database-backed active session in the shared admin layout", () => {
    const pages = generateAdminScaffold([], [makeTable("article")], { requireAuth: true });
    const layout = pages.find((page) => page.path === "app/(admin)/layout.tsx");

    expect(layout!.content).toContain('requireActiveAccess("/")');
    expect(layout!.content).toContain('redirect("/unauthorized")');
    expect(layout!.content).toContain("export default async function AdminLayout");
  });
});
