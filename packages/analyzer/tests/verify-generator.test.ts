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

  it("reads authenticated verification credentials from the environment", () => {
    const files = generateVerifyScaffold({
      postSlugs: [],
      categorySlugs: [],
      hasAuth: true,
    });
    const setup = findFile(files, "e2e/auth.setup.ts");

    expect(setup).toBeDefined();
    expect(setup!.content).toContain("E2E_ADMIN_PASSWORD");
    expect(setup!.content).toContain("page.fill('input[type=\"password\"]', password)");
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
  tableNames: ["product", "article", "account"],
  tables: [{
    name: "product",
    columns: [
      { name: "id", type: "Int", nullable: false, isPrimary: true, isAutoIncrement: true },
      { name: "name", type: "String", nullable: false, isPrimary: false, isAutoIncrement: false },
    ],
  }],
  adminPages: ["app/(admin)/product/page.tsx"],
  phpAnalyses: [
    { fileName: "create-product.php", dbOperations: [{ type: "INSERT" as const, table: "product" }], inputParams: [{ name: "name", source: "$_POST" as const, usage: "" }] },
    { fileName: "update-product.php", dbOperations: [{ type: "UPDATE" as const, table: "product" }], inputParams: [{ name: "name", source: "$_POST" as const, usage: "" }] },
    { fileName: "delete-product.php", dbOperations: [{ type: "DELETE" as const, table: "product" }], inputParams: [{ name: "id", source: "$_POST" as const, usage: "" }] },
    { fileName: "create-article.php", dbOperations: [{ type: "INSERT" as const, table: "article" }], inputParams: [{ name: "title", source: "$_POST" as const, usage: "" }] },
    { fileName: "update-account.php", dbOperations: [{ type: "UPDATE" as const, table: "account" }], inputParams: [{ name: "display_name", source: "$_POST" as const, usage: "" }] },
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
    expect(spec!.content).toContain("/api/products");
  });

  it("tests all table API endpoints for auth protection", () => {
    const files = generateVerifyScaffold(migrationInput);
    const spec = findFile(files, "e2e/migration-auth.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("/api/products");
    expect(spec!.content).toContain("/api/articles");
    expect(spec!.content).toContain("/api/accounts");
  });
});

describe("generated route and auth constraints", () => {
  it("does not generate auth-protection tests when auth is not scaffolded", () => {
    const files = generateVerifyScaffold({ ...migrationInput, hasAuth: false });
    expect(findFile(files, "e2e/migration-auth.spec.ts")).toBeUndefined();
  });

  it("uses public URLs rather than route-group filesystem paths", () => {
    const files = generateVerifyScaffold({
      postSlugs: [],
      categorySlugs: [],
      adminPages: ["app/(admin)/products/page.tsx"],
    });
    const admin = findFile(files, "e2e/admin.spec.ts");
    expect(admin?.content).toContain('page.goto("/products")');
    expect(admin?.content).not.toContain("/(admin)/products");
  });

  it("skips non-page admin artifacts and substitutes dynamic route parameters", () => {
    const files = generateVerifyScaffold({
      postSlugs: [],
      categorySlugs: [],
      adminPages: [
        "app/(admin)/layout.tsx",
        "app/globals.css",
        "app/(admin)/products/[id]/page.tsx",
      ],
    });
    const admin = findFile(files, "e2e/admin.spec.ts");

    expect(admin?.content).toContain('page.goto("/products/1")');
    expect(admin?.content).not.toContain("layout.tsx");
    expect(admin?.content).not.toContain("globals.css");
    expect(admin?.content).not.toContain("[id]");
  });

  it("does not generate database-dependent migration specs without schema tables", () => {
    const files = generateVerifyScaffold({
      postSlugs: [],
      categorySlugs: [],
      hasAuth: false,
      tableNames: [],
      phpAnalyses: [{ fileName: "create-item.php", dbOperations: [{ type: "INSERT", table: "item" }], inputParams: [] }],
    });
    expect(findFile(files, "e2e/migration-auth.spec.ts")).toBeUndefined();
    expect(findFile(files, "e2e/migration-crud.spec.ts")).toBeUndefined();
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
    expect(spec!.content).toContain("/api/products");
    expect(spec!.content).toContain("expect(res.status()).toBe(201)");
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

  it("covers all synthetic domains with CRUD tests", () => {
    const files = generateVerifyScaffold(migrationInput);
    const spec = findFile(files, "e2e/migration-crud.spec.ts");
    expect(spec).toBeDefined();
    expect(spec!.content).toContain("product");
    expect(spec!.content).toContain("article");
    expect(spec!.content).toContain("account");
  });
});

// ── Form UI E2E test generation ──

const formInput = {
  postSlugs: [],
  categorySlugs: [],
  hasAuth: true,
  tableNames: ["product", "article"],
  tables: [
    {
      name: "product",
      columns: [
        { name: "id", type: "Int", nullable: false, isPrimary: true, isAutoIncrement: true },
        { name: "name", type: "String", nullable: false, isPrimary: false, isAutoIncrement: false, comment: "商品名" },
        { name: "price", type: "Int", nullable: false, isPrimary: false, isAutoIncrement: false, comment: "価格" },
      ],
    },
    {
      name: "article",
      columns: [
        { name: "id", type: "Int", nullable: false, isPrimary: true, isAutoIncrement: true },
        { name: "title", type: "String", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "タイトル" },
        { name: "body", type: "String", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "本文" },
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
    expect(spec!.content).toContain("/products/new");
    expect(spec!.content).toContain("/articles/new");
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

  it("generates smoke-level form render check", () => {
    const files = generateVerifyScaffold(formInput);
    const spec = findFile(files, "e2e/migration-form.spec.ts");
    expect(spec).toBeDefined();
    // Must check form field visibility and submit button presence.
    expect(spec!.content).toContain(".wp-form-field");
    expect(spec!.content).toContain('button[type="submit"]');
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
      hasAuth: true, tableNames: ["product"],
    });
    const authSpec = result.find(f => f.path === "e2e/auth.spec.ts");
    expect(authSpec).toBeDefined();
    expect(authSpec!.content).toContain("401");
  });

  it("tests authenticated session returns user data with role", () => {
    const result = generateVerifyScaffold({
      postSlugs: [], categorySlugs: [],
      hasAuth: true, tableNames: ["product"],
    });
    const authSpec = result.find(f => f.path === "e2e/auth.spec.ts");
    expect(authSpec).toBeDefined();
    expect(authSpec!.content).toContain("role");
    expect(authSpec!.content).toContain("user");
  });
});

describe("enhanced CRUD spec", () => {
  const supportedProductTable = [{
    name: "product",
    columns: [
      { name: "id", type: "Int", nullable: false, isPrimary: true, isAutoIncrement: true },
      { name: "name", type: "String", nullable: false, isPrimary: false, isAutoIncrement: false },
    ],
  }];

  it("validates response body after POST", () => {
    const result = generateVerifyScaffold({
      postSlugs: [], categorySlugs: [],
      hasAuth: true, tableNames: ["product"],
      tables: supportedProductTable,
      phpAnalyses: [
        { fileName: "create-product.php", dbOperations: [{ type: "INSERT", table: "product" }], inputParams: [{ name: "name", source: "POST" }] },
        { fileName: "update-product.php", dbOperations: [{ type: "UPDATE", table: "product" }], inputParams: [] },
        { fileName: "delete-product.php", dbOperations: [{ type: "DELETE", table: "product" }], inputParams: [] },
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
      hasAuth: true, tableNames: ["product"],
      tables: supportedProductTable,
      phpAnalyses: [
        { fileName: "create-product.php", dbOperations: [{ type: "INSERT", table: "product" }], inputParams: [{ name: "name", source: "$_POST" }] },
        { fileName: "update-product.php", dbOperations: [{ type: "UPDATE", table: "product" }], inputParams: [] },
        { fileName: "delete-product.php", dbOperations: [{ type: "DELETE", table: "product" }], inputParams: [] },
      ],
    });
    const crudSpec = result.find(f => f.path === "e2e/migration-crud.spec.ts");
    expect(crudSpec).toBeDefined();
    expect(crudSpec!.content).toContain("createdId = body.id");
    expect(crudSpec!.content).toContain("createdId");
  });

  it("requires successful mutation statuses and keeps a supported chain active", () => {
    const result = generateVerifyScaffold({
      postSlugs: [], categorySlugs: [],
      hasAuth: true, tableNames: ["product"],
      tables: supportedProductTable,
      phpAnalyses: [
        { fileName: "create-product.php", dbOperations: [{ type: "INSERT", table: "product" }], inputParams: [{ name: "name", source: "$_POST" }] },
        { fileName: "update-product.php", dbOperations: [{ type: "UPDATE", table: "product" }], inputParams: [] },
        { fileName: "delete-product.php", dbOperations: [{ type: "DELETE", table: "product" }], inputParams: [] },
      ],
    });
    const crudSpec = result.find(f => f.path === "e2e/migration-crud.spec.ts");
    expect(crudSpec).toBeDefined();
    expect(crudSpec!.content).toContain("expect(res.status()).toBe(201)");
    expect(crudSpec!.content).toContain("expect(res.status()).toBe(200)");
    expect(crudSpec!.content).toContain('data: {"name":"verification-name"}');
    expect(crudSpec!.content).not.toContain("if (!createdId) test.skip()");
    expect(crudSpec!.content).not.toContain("typeof res.status()");
  });

  it("marks mutation verification pending when a valid payload cannot be constructed", () => {
    const result = generateVerifyScaffold({
      postSlugs: [], categorySlugs: [], tableNames: ["product"],
      phpAnalyses: [
        { fileName: "create-product.php", dbOperations: [{ type: "INSERT", table: "product" }], inputParams: [] },
      ],
    });
    const crudSpec = result.find(f => f.path === "e2e/migration-crud.spec.ts");
    expect(crudSpec!.content).toContain("test.skip(true, \"CRUD mutation verification pending:");
    expect(crudSpec!.content).not.toContain("request.post");
  });
});

describe("enhanced form spec with WP classes", () => {
  it("uses WP CSS class selectors", () => {
    const result = generateVerifyScaffold({
      postSlugs: [], categorySlugs: [],
      hasAuth: true,
      tables: [{
        name: "product",
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
        name: "product",
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
        name: "product",
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
      tableNames: ["product"],
    });
    expect(findFile(files, "e2e/migration-auth.spec.ts")).toBeUndefined();
    expect(findFile(files, "e2e/migration-crud.spec.ts")).toBeUndefined();
  });
});
