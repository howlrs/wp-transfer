import { describe, it, expect } from "vitest";
import { generateVerifyScaffold } from "../src/verify-generator.js";
import type { VerifyScaffoldFile } from "../src/verify-generator.js";

// ── Helpers ──

function findFile(
  files: VerifyScaffoldFile[],
  path: string,
): VerifyScaffoldFile | undefined {
  return files.find((f) => f.path === path);
}

// ── Tests ──

describe("Verify Scaffold Generator", () => {
  const input = {
    postSlugs: ["hello-world", "second-post"],
    categorySlugs: ["uncategorized", "tech"],
  };

  it("generates playwright.config.ts (contains defineConfig, webServer, 'npm run dev')", () => {
    const files = generateVerifyScaffold(input);
    const config = findFile(files, "playwright.config.ts");
    expect(config).toBeDefined();
    expect(config!.content).toContain("defineConfig");
    expect(config!.content).toContain("webServer");
    expect(config!.content).toContain("npm run dev");
  });

  it("generates smoke test for blog archive (/blog, 200)", () => {
    const files = generateVerifyScaffold(input);
    const smoke = findFile(files, "e2e/smoke.spec.ts");
    expect(smoke).toBeDefined();
    expect(smoke!.content).toContain("/blog");
    expect(smoke!.content).toContain("200");
  });

  it("generates tests for individual post pages (hello-world, second-post)", () => {
    const files = generateVerifyScaffold(input);
    const smoke = findFile(files, "e2e/smoke.spec.ts");
    expect(smoke).toBeDefined();
    expect(smoke!.content).toContain("/blog/hello-world");
    expect(smoke!.content).toContain("/blog/second-post");
  });

  it("generates test for category pages (/blog/category/uncategorized, /blog/category/tech)", () => {
    const files = generateVerifyScaffold(input);
    const smoke = findFile(files, "e2e/smoke.spec.ts");
    expect(smoke).toBeDefined();
    expect(smoke!.content).toContain("/blog/category/uncategorized");
    expect(smoke!.content).toContain("/blog/category/tech");
  });

  it("generates console error check test", () => {
    const files = generateVerifyScaffold(input);
    const smoke = findFile(files, "e2e/smoke.spec.ts");
    expect(smoke).toBeDefined();
    expect(smoke!.content).toContain("console");
    expect(smoke!.content).toContain("error");
  });

  it("generates build verification script (next build)", () => {
    const files = generateVerifyScaffold(input);
    const script = findFile(files, "e2e/verify-build.sh");
    expect(script).toBeDefined();
    expect(script!.content).toContain("next build");
  });

  it("playwright config contains html and junit reporters", () => {
    const files = generateVerifyScaffold(input);
    const config = findFile(files, "playwright.config.ts");
    expect(config).toBeDefined();
    expect(config!.content).toContain("html");
    expect(config!.content).toContain("junit");
  });

  it("backward compatible: old VerifyInput without new fields still works", () => {
    const files = generateVerifyScaffold(input);
    expect(files.length).toBe(3);
    expect(findFile(files, "playwright.config.ts")).toBeDefined();
    expect(findFile(files, "e2e/smoke.spec.ts")).toBeDefined();
    expect(findFile(files, "e2e/verify-build.sh")).toBeDefined();
  });
});

describe("API spec generation", () => {
  it("generates api.spec.ts when tableNames provided", () => {
    const files = generateVerifyScaffold({
      postSlugs: ["a"],
      categorySlugs: [],
      tableNames: ["posts", "categories"],
    });
    const api = findFile(files, "e2e/api.spec.ts");
    expect(api).toBeDefined();
  });

  it("api spec contains GET list and detail tests for each table", () => {
    const files = generateVerifyScaffold({
      postSlugs: [],
      categorySlugs: [],
      tableNames: ["posts", "tags"],
    });
    const api = findFile(files, "e2e/api.spec.ts");
    expect(api).toBeDefined();
    expect(api!.content).toContain("/api/posts");
    expect(api!.content).toContain("/api/tags");
    expect(api!.content).toContain("/api/posts/1");
    expect(api!.content).toContain("/api/tags/1");
    expect(api!.content).toContain("returns list");
    expect(api!.content).toContain("returns detail or 404");
  });

  it("does not generate api.spec.ts when tableNames is empty", () => {
    const files = generateVerifyScaffold({
      postSlugs: [],
      categorySlugs: [],
      tableNames: [],
    });
    expect(findFile(files, "e2e/api.spec.ts")).toBeUndefined();
  });

  it("does not generate api.spec.ts when tableNames is undefined", () => {
    const files = generateVerifyScaffold({
      postSlugs: [],
      categorySlugs: [],
    });
    expect(findFile(files, "e2e/api.spec.ts")).toBeUndefined();
  });
});

describe("Auth spec generation", () => {
  it("generates auth.spec.ts when hasAuth is true", () => {
    const files = generateVerifyScaffold({
      postSlugs: [],
      categorySlugs: [],
      hasAuth: true,
    });
    const auth = findFile(files, "e2e/auth.spec.ts");
    expect(auth).toBeDefined();
    expect(auth!.content).toContain("Authentication");
    expect(auth!.content).toContain("/api/auth/signin");
    expect(auth!.content).toContain("/api/auth/session");
  });

  it("does not generate auth.spec.ts when hasAuth is false", () => {
    const files = generateVerifyScaffold({
      postSlugs: [],
      categorySlugs: [],
      hasAuth: false,
    });
    expect(findFile(files, "e2e/auth.spec.ts")).toBeUndefined();
  });

  it("does not generate auth.spec.ts when hasAuth is undefined", () => {
    const files = generateVerifyScaffold({
      postSlugs: [],
      categorySlugs: [],
    });
    expect(findFile(files, "e2e/auth.spec.ts")).toBeUndefined();
  });
});

describe("Admin spec generation", () => {
  it("generates admin.spec.ts when adminPages provided", () => {
    const files = generateVerifyScaffold({
      postSlugs: [],
      categorySlugs: [],
      adminPages: ["app/admin/page.tsx", "app/admin/posts/page.tsx"],
    });
    const admin = findFile(files, "e2e/admin.spec.ts");
    expect(admin).toBeDefined();
    expect(admin!.content).toContain("/admin");
    expect(admin!.content).toContain("/admin/posts");
  });

  it("does not generate admin.spec.ts when adminPages is empty", () => {
    const files = generateVerifyScaffold({
      postSlugs: [],
      categorySlugs: [],
      adminPages: [],
    });
    expect(findFile(files, "e2e/admin.spec.ts")).toBeUndefined();
  });

  it("does not generate admin.spec.ts when adminPages is undefined", () => {
    const files = generateVerifyScaffold({
      postSlugs: [],
      categorySlugs: [],
    });
    expect(findFile(files, "e2e/admin.spec.ts")).toBeUndefined();
  });
});

// ── Migration E2E test generation ──

const migrationInput = {
  postSlugs: [],
  categorySlugs: [],
  hasAuth: true,
  tableNames: ["event", "event_slot", "information", "lottery", "user"],
  adminPages: ["app/(admin)/event/page.tsx"],
  phpAnalyses: [
    { fileName: "insert.php", dbOperations: [{ type: "INSERT" as const, table: "event" }], inputParams: [{ name: "title", source: "$_POST" as const, usage: "" }] },
    { fileName: "update.php", dbOperations: [{ type: "UPDATE" as const, table: "event" }], inputParams: [{ name: "title", source: "$_POST" as const, usage: "" }] },
    { fileName: "delete.php", dbOperations: [{ type: "DELETE" as const, table: "event" }], inputParams: [{ name: "delete", source: "$_POST" as const, usage: "" }] },
    { fileName: "event-stop.php", dbOperations: [{ type: "UPDATE" as const, table: "event" }], inputParams: [{ name: "update", source: "$_POST" as const, usage: "" }] },
    { fileName: "event-restoration.php", dbOperations: [{ type: "UPDATE" as const, table: "event" }], inputParams: [{ name: "update", source: "$_POST" as const, usage: "" }] },
    { fileName: "user-blacklist.php", dbOperations: [{ type: "UPDATE" as const, table: "user" }], inputParams: [{ name: "update", source: "$_POST" as const, usage: "" }] },
    { fileName: "user-blacklist-out.php", dbOperations: [{ type: "UPDATE" as const, table: "user" }], inputParams: [{ name: "update", source: "$_POST" as const, usage: "" }] },
    { fileName: "lottery-update.php", dbOperations: [{ type: "UPDATE" as const, table: "lottery" }], inputParams: [{ name: "update", source: "$_POST" as const, usage: "" }] },
    { fileName: "insert_information.php", dbOperations: [{ type: "INSERT" as const, table: "information" }], inputParams: [{ name: "text", source: "$_POST" as const, usage: "" }] },
    { fileName: "information-text-in.php", dbOperations: [{ type: "UPDATE" as const, table: "information" }], inputParams: [{ name: "update", source: "$_POST" as const, usage: "" }] },
    { fileName: "information-banner-in.php", dbOperations: [{ type: "UPDATE" as const, table: "information" }], inputParams: [{ name: "update", source: "$_POST" as const, usage: "" }] },
  ],
};

describe("Migration auth protection tests", () => {
  it("generates migration-auth.spec.ts when phpAnalyses provided", () => {
    const files = generateVerifyScaffold(migrationInput);
    const spec = findFile(files, "e2e/migration-auth.spec.ts");
    expect(spec).toBeDefined();
  });

  it("tests that API endpoints return 401 without auth", () => {
    const files = generateVerifyScaffold(migrationInput);
    const spec = findFile(files, "e2e/migration-auth.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("401");
    expect(spec!.content).toContain("/api/event");
  });

  it("tests all table API endpoints for auth protection", () => {
    const files = generateVerifyScaffold(migrationInput);
    const spec = findFile(files, "e2e/migration-auth.spec.ts");
    expect(spec).toBeDefined();
    for (const table of migrationInput.tableNames) {
      expect(spec!.content).toContain(`/api/${table}`);
    }
  });
});

describe("Migration CRUD verification tests", () => {
  it("generates migration-crud.spec.ts when phpAnalyses provided", () => {
    const files = generateVerifyScaffold(migrationInput);
    const spec = findFile(files, "e2e/migration-crud.spec.ts");
    expect(spec).toBeDefined();
  });

  it("generates POST create test for INSERT operations", () => {
    const files = generateVerifyScaffold(migrationInput);
    const spec = findFile(files, "e2e/migration-crud.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("POST");
    expect(spec!.content).toContain("/api/events");
    expect(spec!.content).toContain("201");
  });

  it("generates PUT update test for UPDATE operations", () => {
    const files = generateVerifyScaffold(migrationInput);
    const spec = findFile(files, "e2e/migration-crud.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("PUT");
    expect(spec!.content).toContain("200");
  });

  it("generates DELETE test for DELETE operations", () => {
    const files = generateVerifyScaffold(migrationInput);
    const spec = findFile(files, "e2e/migration-crud.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("DELETE");
    expect(spec!.content).toContain("delete");
  });

  it("covers all 5 domains with CRUD tests", () => {
    const files = generateVerifyScaffold(migrationInput);
    const spec = findFile(files, "e2e/migration-crud.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("event");
    expect(spec!.content).toContain("information");
    expect(spec!.content).toContain("lottery");
    expect(spec!.content).toContain("user");
  });
});

describe("Migration business logic tests", () => {
  it("generates migration-logic.spec.ts when phpAnalyses provided", () => {
    const files = generateVerifyScaffold(migrationInput);
    const spec = findFile(files, "e2e/migration-logic.spec.ts");
    expect(spec).toBeDefined();
  });

  it("generates event stop/restore state transition tests", () => {
    const files = generateVerifyScaffold(migrationInput);
    const spec = findFile(files, "e2e/migration-logic.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("stop");
    expect(spec!.content).toContain("restore");
    expect(spec!.content).toContain("status");
  });

  it("generates blacklist on/off tests", () => {
    const files = generateVerifyScaffold(migrationInput);
    const spec = findFile(files, "e2e/migration-logic.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("blacklist");
  });

  it("generates lottery invalidation test", () => {
    const files = generateVerifyScaffold(migrationInput);
    const spec = findFile(files, "e2e/migration-logic.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("invalid");
  });

  it("generates information flag toggle tests", () => {
    const files = generateVerifyScaffold(migrationInput);
    const spec = findFile(files, "e2e/migration-logic.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("information");
    expect(spec!.content).toContain("banner");
  });
});

// ── Form UI E2E test generation ──

const formInput = {
  postSlugs: [],
  categorySlugs: [],
  hasAuth: true,
  tableNames: ["event", "information"],
  tables: [
    {
      name: "event",
      columns: [
        { name: "id", type: "Int", nullable: false, isPrimary: true, isAutoIncrement: true },
        { name: "title", type: "String", nullable: false, isPrimary: false, isAutoIncrement: false, comment: "タイトル" },
        { name: "status", type: "Int", nullable: false, isPrimary: false, isAutoIncrement: false, comment: "ステータス" },
        { name: "start_time", type: "DateTime", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "開始日時" },
      ],
    },
    {
      name: "information",
      columns: [
        { name: "id", type: "Int", nullable: false, isPrimary: true, isAutoIncrement: true },
        { name: "text", type: "String", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "本文" },
        { name: "banner", type: "String", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "バナー" },
      ],
    },
  ],
};

describe("Migration form UI tests", () => {
  it("generates migration-form.spec.ts when tables provided", () => {
    const files = generateVerifyScaffold(formInput);
    const spec = findFile(files, "e2e/migration-form.spec.ts");
    expect(spec).toBeDefined();
  });

  it("generates new page render test per table", () => {
    const files = generateVerifyScaffold(formInput);
    const spec = findFile(files, "e2e/migration-form.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("/event/new");
    expect(spec!.content).toContain("/information/new");
    expect(spec!.content).toContain("新規作成");
  });

  it("generates form fill and submit test", () => {
    const files = generateVerifyScaffold(formInput);
    const spec = findFile(files, "e2e/migration-form.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("fill");
    expect(spec!.content).toContain('button[type="submit"]');
    expect(spec!.content).toContain("click");
  });

  it("generates list page verification test", () => {
    const files = generateVerifyScaffold(formInput);
    const spec = findFile(files, "e2e/migration-form.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("一覧");
    expect(spec!.content).toContain("table");
    expect(spec!.content).toContain("詳細");
  });

  it("generates detail page test with edit link", () => {
    const files = generateVerifyScaffold(formInput);
    const spec = findFile(files, "e2e/migration-form.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("詳細");
    expect(spec!.content).toContain("編集");
  });

  it("generates edit page pre-fill test", () => {
    const files = generateVerifyScaffold(formInput);
    const spec = findFile(files, "e2e/migration-form.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("編集");
    expect(spec!.content).toContain('button[type="submit"]');
  });

  it("includes sample data based on column types", () => {
    const files = generateVerifyScaffold(formInput);
    const spec = findFile(files, "e2e/migration-form.spec.ts");
    expect(spec).toBeDefined();
    // String field should have テスト prefix
    expect(spec!.content).toContain("テスト");
    // DateTime field should have datetime value
    expect(spec!.content).toContain("2026-01-15");
  });

  it("does not generate form spec when no tables provided", () => {
    const files = generateVerifyScaffold({
      postSlugs: [],
      categorySlugs: [],
    });
    expect(findFile(files, "e2e/migration-form.spec.ts")).toBeUndefined();
  });
});

// ── Enhanced E2E test generation (Tasks 8-10) ──

describe("enhanced auth spec", () => {
  it("tests unauthenticated API returns 401", () => {
    const result = generateVerifyScaffold({
      postSlugs: [], categorySlugs: [],
      hasAuth: true, tableNames: ["event"],
    });
    const authSpec = result.find(f => f.path === "e2e/auth.spec.ts");
    expect(authSpec).toBeDefined();
    expect(authSpec!.content).toContain("401");
  });

  it("tests authenticated session returns user data with role", () => {
    const result = generateVerifyScaffold({
      postSlugs: [], categorySlugs: [],
      hasAuth: true, tableNames: ["event"],
    });
    const authSpec = result.find(f => f.path === "e2e/auth.spec.ts");
    expect(authSpec).toBeDefined();
    expect(authSpec!.content).toContain("role");
    expect(authSpec!.content).toContain("user");
  });
});

describe("enhanced CRUD spec", () => {
  it("validates response body after POST", () => {
    const result = generateVerifyScaffold({
      postSlugs: [], categorySlugs: [],
      hasAuth: true, tableNames: ["event"],
      phpAnalyses: [
        { fileName: "insert.php", dbOperations: [{ type: "INSERT", table: "event" }], inputParams: [{ name: "title", source: "POST" }] },
        { fileName: "update.php", dbOperations: [{ type: "UPDATE", table: "event" }], inputParams: [] },
        { fileName: "delete.php", dbOperations: [{ type: "DELETE", table: "event" }], inputParams: [] },
      ],
    });
    const crudSpec = result.find(f => f.path === "e2e/migration-crud.spec.ts");
    expect(crudSpec).toBeDefined();
    expect(crudSpec!.content).toContain("body.id");
    expect(crudSpec!.content).toContain("serial");
  });

  it("stores created ID for PUT and DELETE", () => {
    const result = generateVerifyScaffold({
      postSlugs: [], categorySlugs: [],
      hasAuth: true, tableNames: ["event"],
      phpAnalyses: [
        { fileName: "insert.php", dbOperations: [{ type: "INSERT", table: "event" }], inputParams: [] },
        { fileName: "update.php", dbOperations: [{ type: "UPDATE", table: "event" }], inputParams: [] },
        { fileName: "delete.php", dbOperations: [{ type: "DELETE", table: "event" }], inputParams: [] },
      ],
    });
    const crudSpec = result.find(f => f.path === "e2e/migration-crud.spec.ts");
    expect(crudSpec).toBeDefined();
    expect(crudSpec!.content).toContain("createdId = body.id");
    expect(crudSpec!.content).toContain("createdId");
  });

  it("verifies update persisted with GET after PUT", () => {
    const result = generateVerifyScaffold({
      postSlugs: [], categorySlugs: [],
      hasAuth: true, tableNames: ["event"],
      phpAnalyses: [
        { fileName: "insert.php", dbOperations: [{ type: "INSERT", table: "event" }], inputParams: [] },
        { fileName: "update.php", dbOperations: [{ type: "UPDATE", table: "event" }], inputParams: [] },
        { fileName: "delete.php", dbOperations: [{ type: "DELETE", table: "event" }], inputParams: [] },
      ],
    });
    const crudSpec = result.find(f => f.path === "e2e/migration-crud.spec.ts");
    expect(crudSpec).toBeDefined();
    expect(crudSpec!.content).toContain("Verify update persisted");
  });
});

describe("enhanced logic spec", () => {
  it("verifies state before and after transitions", () => {
    const result = generateVerifyScaffold({
      postSlugs: [], categorySlugs: [],
      hasAuth: true, tableNames: ["event", "user"],
      phpAnalyses: [
        { fileName: "event-stop.php", dbOperations: [{ type: "UPDATE", table: "event" }], inputParams: [] },
        { fileName: "event-restoration.php", dbOperations: [{ type: "UPDATE", table: "event" }], inputParams: [] },
        { fileName: "user-blacklist.php", dbOperations: [{ type: "UPDATE", table: "user" }], inputParams: [] },
        { fileName: "user-blacklist-out.php", dbOperations: [{ type: "UPDATE", table: "user" }], inputParams: [] },
      ],
    });
    const logicSpec = result.find(f => f.path === "e2e/migration-logic.spec.ts");
    expect(logicSpec).toBeDefined();
    expect(logicSpec!.content).toContain("status");
    expect(logicSpec!.content).toContain("blacklist");
  });

  it("includes initial state verification before transitions", () => {
    const result = generateVerifyScaffold({
      postSlugs: [], categorySlugs: [],
      hasAuth: true, tableNames: ["event"],
      phpAnalyses: [
        { fileName: "event-stop.php", dbOperations: [{ type: "UPDATE", table: "event" }], inputParams: [] },
        { fileName: "event-restoration.php", dbOperations: [{ type: "UPDATE", table: "event" }], inputParams: [] },
      ],
    });
    const logicSpec = result.find(f => f.path === "e2e/migration-logic.spec.ts");
    expect(logicSpec).toBeDefined();
    expect(logicSpec!.content).toContain("Verify initial state");
    expect(logicSpec!.content).toContain("initial.status");
  });
});

describe("enhanced form spec with WP classes", () => {
  it("uses WP CSS class selectors", () => {
    const result = generateVerifyScaffold({
      postSlugs: [], categorySlugs: [],
      hasAuth: true,
      tables: [{
        name: "event",
        columns: [
          { name: "id", type: "Int", nullable: false, isPrimary: true, isAutoIncrement: true },
          { name: "title", type: "String", nullable: false, isPrimary: false, isAutoIncrement: false },
        ],
      }],
    });
    const formSpec = result.find(f => f.path === "e2e/migration-form.spec.ts");
    expect(formSpec).toBeDefined();
    expect(formSpec!.content).toContain("wp-form-field");
  });

  it("uses wp-list-table for list pages", () => {
    const result = generateVerifyScaffold({
      postSlugs: [], categorySlugs: [],
      hasAuth: true,
      tables: [{
        name: "event",
        columns: [
          { name: "id", type: "Int", nullable: false, isPrimary: true, isAutoIncrement: true },
          { name: "title", type: "String", nullable: false, isPrimary: false, isAutoIncrement: false },
        ],
      }],
    });
    const formSpec = result.find(f => f.path === "e2e/migration-form.spec.ts");
    expect(formSpec).toBeDefined();
    expect(formSpec!.content).toContain("wp-list-table");
  });

  it("uses wp-admin-title for page headings", () => {
    const result = generateVerifyScaffold({
      postSlugs: [], categorySlugs: [],
      hasAuth: true,
      tables: [{
        name: "event",
        columns: [
          { name: "id", type: "Int", nullable: false, isPrimary: true, isAutoIncrement: true },
          { name: "title", type: "String", nullable: false, isPrimary: false, isAutoIncrement: false },
        ],
      }],
    });
    const formSpec = result.find(f => f.path === "e2e/migration-form.spec.ts");
    expect(formSpec).toBeDefined();
    expect(formSpec!.content).toContain("wp-admin-title");
  });
});

describe("Migration tests are not generated without phpAnalyses", () => {
  it("does not generate migration specs without phpAnalyses", () => {
    const files = generateVerifyScaffold({
      postSlugs: [],
      categorySlugs: [],
      hasAuth: true,
      tableNames: ["event"],
    });
    expect(findFile(files, "e2e/migration-auth.spec.ts")).toBeUndefined();
    expect(findFile(files, "e2e/migration-crud.spec.ts")).toBeUndefined();
    expect(findFile(files, "e2e/migration-logic.spec.ts")).toBeUndefined();
  });
});
