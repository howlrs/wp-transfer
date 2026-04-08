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
});
