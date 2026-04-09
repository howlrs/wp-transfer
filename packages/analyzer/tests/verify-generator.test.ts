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
