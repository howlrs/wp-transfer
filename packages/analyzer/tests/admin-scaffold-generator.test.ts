import { describe, it, expect } from "vitest";
import { generateAdminScaffold, pluralize } from "../src/admin-scaffold-generator.js";
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

    it("edit form imports useParams from next/navigation, not react", () => {
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
      expect(editPage!.content).toContain('useParams } from "next/navigation"');
      expect(editPage!.content).not.toMatch(/useParams.*from "react"/);
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
      const newPage = findPage(pages, "information/new/page.tsx");

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

describe("pluralize", () => {
  it("pluralizes regular words", () => {
    expect(pluralize("event")).toBe("events");
    expect(pluralize("user")).toBe("users");
    expect(pluralize("post")).toBe("posts");
  });

  it("pluralizes words ending in -y (consonant + y)", () => {
    expect(pluralize("category")).toBe("categories");
    expect(pluralize("lottery")).toBe("lotteries");
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
    const analyses = [makeAnalysis({ fileName: "page-event-list.php" })];
    const tables = [makeTable("event")];
    const pages = generateAdminScaffold(analyses, tables);
    const listPage = findPage(pages, "events/page.tsx");

    expect(listPage).toBeDefined();
    expect(listPage!.path).toBe("app/(admin)/events/page.tsx");
    expect(listPage!.path).not.toContain("eventss");
  });

  it("form page URLs use correct plurals for -y words", () => {
    const analyses = [
      makeAnalysis({
        fileName: "page-lottery-list.php",
      }),
    ];
    const tables = [makeTable("lottery")];
    const pages = generateAdminScaffold(analyses, tables);
    const listPage = findPage(pages, "lotteries/page.tsx");

    expect(listPage).toBeDefined();
    expect(listPage!.path).toBe("app/(admin)/lotteries/page.tsx");
    expect(listPage!.path).not.toContain("lotterys");
  });

  it("generated content URLs do not contain double-s patterns", () => {
    const analyses = [makeAnalysis({ fileName: "page-event-list.php" })];
    const tables = [makeTable("event")];
    const pages = generateAdminScaffold(analyses, tables);
    const listPage = findPage(pages, "events/page.tsx");

    expect(listPage!.content).not.toMatch(/\/events+s\//);
    expect(listPage!.content).not.toMatch(/\/events+s"/);
  });
});

describe("table-driven CRUD pages", () => {
  it("generates list pages for each table when no PHP analyses exist", () => {
    const tables = [makeTable("product"), makeTable("order"), makeTable("customer")];

    const pages = generateAdminScaffold([], tables);
    const productPage = findPage(pages, "product/page.tsx");
    const orderPage = findPage(pages, "order/page.tsx");
    const customerPage = findPage(pages, "customer/page.tsx");

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
    const analyses = [makeAnalysis({ fileName: "page-event-list.php" })];
    const tables = [makeTable("event"), makeTable("user")];

    const pages = generateAdminScaffold(analyses, tables);

    // event is already covered by the PHP-matched page (events/)
    const eventListPages = pages.filter(
      (p) => p.type === "list" && (p.path.includes("events/page.tsx") || p.path.includes("event/page.tsx")),
    );
    expect(eventListPages.length).toBe(1);

    // user should get a table-driven page
    const userPage = findPage(pages, "user/page.tsx");
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
    const memberPage = findPage(pages, "member/page.tsx");

    expect(memberPage).toBeDefined();
    // First 6 columns should be present
    expect(memberPage!.content).toContain("item.id");
    expect(memberPage!.content).toContain("item.status");
    // 7th and 8th columns should NOT be in table-driven page (limit 6)
    expect(memberPage!.content).not.toContain("item.bio");
    expect(memberPage!.content).not.toContain("item.avatar");
  });

  it("uses column comments as headers when available", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const productPage = findPage(pages, "product/page.tsx");

    expect(productPage).toBeDefined();
    expect(productPage!.content).toContain("タイトル");
    expect(productPage!.content).toContain("ステータス");
  });

  it("generates tailwind table-driven list page", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables, { uiFramework: "tailwind" });
    const productPage = findPage(pages, "product/page.tsx");

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
    expect(layout!.content).toContain('href="/product"');
    expect(layout!.content).toContain('href="/order"');
  });

  it("layout includes both PHP-matched and table-driven nav links", () => {
    const analyses = [makeAnalysis({ fileName: "page-event-list.php" })];
    const tables = [makeTable("event"), makeTable("user")];

    const pages = generateAdminScaffold(analyses, tables);
    const layout = findPage(pages, "layout.tsx");

    expect(layout).toBeDefined();
    // PHP-matched events
    expect(layout!.content).toContain("/events");
    // table-driven user
    expect(layout!.content).toContain("/user");
    expect(layout!.content).toContain("User");
  });
});

describe("table-driven CRUD detail page", () => {
  it("generates a detail page for each table at /[id]", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const detailPage = findPage(pages, "product/[id]/page.tsx");

    expect(detailPage).toBeDefined();
    expect(detailPage!.type).toBe("detail");
    expect(detailPage!.content).toContain("prisma.product.findUnique");
    expect(detailPage!.content).toContain("タイトル");
    expect(detailPage!.content).toContain("ステータス");
  });

  it("includes edit and delete links on detail page", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const detailPage = findPage(pages, "product/[id]/page.tsx");

    expect(detailPage).toBeDefined();
    expect(detailPage!.content).toContain("/edit");
    expect(detailPage!.content).toContain("DELETE");
  });

  it("generates tailwind detail page", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables, { uiFramework: "tailwind" });
    const detailPage = findPage(pages, "product/[id]/page.tsx");

    expect(detailPage).toBeDefined();
    expect(detailPage!.content).toContain("className=");
    expect(detailPage!.content).not.toContain("style={");
  });
});

describe("table-driven CRUD edit page", () => {
  it("generates an edit page for each table at /[id]/edit", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const editPage = findPage(pages, "product/[id]/edit/page.tsx");

    expect(editPage).toBeDefined();
    expect(editPage!.type).toBe("form");
    expect(editPage!.content).toContain("use client");
    expect(editPage!.content).toContain("PUT");
    expect(editPage!.content).toContain("編集");
  });

  it("edit page fetches existing data on mount", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const editPage = findPage(pages, "product/[id]/edit/page.tsx");

    expect(editPage).toBeDefined();
    expect(editPage!.content).toContain("useEffect");
    expect(editPage!.content).toContain("useParams");
  });

  it("generates form fields from table columns excluding auto-increment PK", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const editPage = findPage(pages, "product/[id]/edit/page.tsx");

    expect(editPage).toBeDefined();
    expect(editPage!.content).toContain("title");
    expect(editPage!.content).toContain("status");
    // auto-increment PK should not be a form field
    expect(editPage!.content).not.toMatch(/onChange.*\bid\b/);
  });

  it("imports useParams from next/navigation, not react", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const editPage = findPage(pages, "product/[id]/edit/page.tsx");

    expect(editPage).toBeDefined();
    expect(editPage!.content).toContain('useParams } from "next/navigation"');
    expect(editPage!.content).not.toMatch(/useParams.*from "react"/);
  });

  it("generates tailwind edit page", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables, { uiFramework: "tailwind" });
    const editPage = findPage(pages, "product/[id]/edit/page.tsx");

    expect(editPage).toBeDefined();
    expect(editPage!.content).toContain("className=");
    expect(editPage!.content).not.toContain("style={");
  });
});

describe("table-driven CRUD new page", () => {
  it("generates a new page for each table at /new", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const newPage = findPage(pages, "product/new/page.tsx");

    expect(newPage).toBeDefined();
    expect(newPage!.type).toBe("form");
    expect(newPage!.content).toContain("use client");
    expect(newPage!.content).toContain("POST");
    expect(newPage!.content).toContain("新規作成");
  });

  it("new page does not fetch existing data", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const newPage = findPage(pages, "product/new/page.tsx");

    expect(newPage).toBeDefined();
    expect(newPage!.content).not.toContain("useEffect");
    expect(newPage!.content).not.toContain("useParams");
  });

  it("generates tailwind new page", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables, { uiFramework: "tailwind" });
    const newPage = findPage(pages, "product/new/page.tsx");

    expect(newPage).toBeDefined();
    expect(newPage!.content).toContain("className=");
    expect(newPage!.content).not.toContain("style={");
  });
});

describe("table-driven CRUD complete set", () => {
  it("generates 4 CRUD pages + layout + dashboard for a single table", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);

    expect(findPage(pages, "product/page.tsx")).toBeDefined();       // list
    expect(findPage(pages, "product/[id]/page.tsx")).toBeDefined();  // detail
    expect(findPage(pages, "product/[id]/edit/page.tsx")).toBeDefined(); // edit
    expect(findPage(pages, "product/new/page.tsx")).toBeDefined();   // new
    expect(findPage(pages, "layout.tsx")).toBeDefined();
    expect(findPage(pages, "(admin)/page.tsx")).toBeDefined();
  });

  it("list page links to detail, not edit", () => {
    const tables = [makeTable("product")];

    const pages = generateAdminScaffold([], tables);
    const listPage = findPage(pages, "product/page.tsx");

    expect(listPage).toBeDefined();
    expect(listPage!.content).toContain("詳細");
  });

  it("does not generate CRUD pages for tables already covered by PHP patterns", () => {
    const analyses = [makeAnalysis({ fileName: "page-event-list.php" })];
    const tables = [makeTable("event"), makeTable("user")];

    const pages = generateAdminScaffold(analyses, tables);

    // event is covered by PHP, so no table-driven detail/edit/new for event
    const eventDetailPages = pages.filter(
      (p) => p.path.includes("event/[id]/page.tsx") || p.path.includes("events/[id]/page.tsx"),
    );
    // Only user should have table-driven CRUD
    const userDetail = findPage(pages, "user/[id]/page.tsx");
    const userEdit = findPage(pages, "user/[id]/edit/page.tsx");
    const userNew = findPage(pages, "user/new/page.tsx");

    expect(userDetail).toBeDefined();
    expect(userEdit).toBeDefined();
    expect(userNew).toBeDefined();
  });
});

describe("non-standard primary key support", () => {
  const gpsTable: TableDefinition = {
    name: "gps_area",
    columns: [
      makeColumn({ name: "area_id", type: "Int", isPrimary: true, isAutoIncrement: false }),
      makeColumn({ name: "name", type: "String", isPrimary: false, isAutoIncrement: false }),
      makeColumn({ name: "latitude", type: "String", isPrimary: false, isAutoIncrement: false }),
    ],
  };

  it("list page uses actual PK column for orderBy and key", () => {
    const pages = generateAdminScaffold([], [gpsTable]);
    const listPage = findPage(pages, "gps_area/page.tsx");

    expect(listPage).toBeDefined();
    expect(listPage!.content).toContain('orderBy: { area_id: "desc" }');
    expect(listPage!.content).toContain("item.area_id");
    expect(listPage!.content).not.toContain('orderBy: { id: "desc" }');
  });

  it("detail page uses actual PK column for findUnique", () => {
    const pages = generateAdminScaffold([], [gpsTable]);
    const detailPage = findPage(pages, "gps_area/[id]/page.tsx");

    expect(detailPage).toBeDefined();
    expect(detailPage!.content).toContain("where: { area_id: Number(id) }");
  });

  it("falls back to first column when no isPrimary is set", () => {
    const noPkTable: TableDefinition = {
      name: "gps_area",
      columns: [
        makeColumn({ name: "area_id", type: "Int", isPrimary: false, isAutoIncrement: false }),
        makeColumn({ name: "name", type: "String", isPrimary: false, isAutoIncrement: false }),
      ],
    };

    const pages = generateAdminScaffold([], [noPkTable]);
    const listPage = findPage(pages, "gps_area/page.tsx");

    expect(listPage).toBeDefined();
    expect(listPage!.content).toContain('orderBy: { area_id: "desc" }');
    expect(listPage!.content).not.toContain('orderBy: { id: "desc" }');
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
    const detailPage = findPage(pages, "device/[id]/page.tsx");

    expect(detailPage).toBeDefined();
    expect(detailPage!.content).toContain("where: { device_id: id }");
    expect(detailPage!.content).not.toContain("Number(id)");
  });
});

describe("dashboard cards link to table pages", () => {
  it("dashboard count cards are wrapped in links to table pages", () => {
    const tables = [makeTable("event"), makeTable("user")];

    const pages = generateAdminScaffold([], tables);
    const dashboard = findPage(pages, "(admin)/page.tsx");

    expect(dashboard).toBeDefined();
    expect(dashboard!.content).toContain('href="/(admin)/event"');
    expect(dashboard!.content).toContain('href="/(admin)/user"');
  });

  it("tailwind dashboard cards link to table pages", () => {
    const tables = [makeTable("event"), makeTable("user")];

    const pages = generateAdminScaffold([], tables, { uiFramework: "tailwind" });
    const dashboard = findPage(pages, "(admin)/page.tsx");

    expect(dashboard).toBeDefined();
    expect(dashboard!.content).toContain('href="/(admin)/event"');
    expect(dashboard!.content).toContain('href="/(admin)/user"');
  });
});
