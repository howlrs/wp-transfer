import { describe, it, expect } from "vitest";
import {
  augmentWooPrismaForMultisite,
  augmentWooScaffoldForI18n,
  augmentI18nForMultisite,
} from "../src/cross-feature-utils.js";

// ── augmentWooPrismaForMultisite ──────────────────────────────────────────────

describe("augmentWooPrismaForMultisite", () => {
  const minimalSchema = `model Product {
  id   Int @id @default(autoincrement())
  name String
}
`;

  it("adds siteId to Product model in Prisma schema", () => {
    const result = augmentWooPrismaForMultisite(minimalSchema);
    expect(result).toContain("siteId           Int");
    expect(result).toContain("site             Site");
    expect(result).toContain("@@index([siteId])");
  });

  it("inserts siteId fields right after the model opening line", () => {
    const result = augmentWooPrismaForMultisite(minimalSchema);
    const lines = result.split("\n");
    // "model Product {" is line 0, siteId should be line 1
    expect(lines[0]).toBe("model Product {");
    expect(lines[1]).toContain("siteId");
  });

  it("places @@index before the closing brace of Product model", () => {
    const result = augmentWooPrismaForMultisite(minimalSchema);
    const indexPos = result.indexOf("@@index([siteId])");
    const closingPos = result.indexOf("\n}", result.indexOf("model Product {"));
    expect(indexPos).toBeLessThan(closingPos);
  });

  it("returns schema unchanged when no Product model found", () => {
    const schema = `model Order {\n  id Int @id\n}\n`;
    expect(augmentWooPrismaForMultisite(schema)).toBe(schema);
  });
});

// ── augmentWooScaffoldForI18n ─────────────────────────────────────────────────

describe("augmentWooScaffoldForI18n", () => {
  const shopFiles = [
    { path: "app/(shop)/products/page.tsx", content: "products" },
    { path: "app/(shop)/products/[slug]/page.tsx", content: "detail" },
    { path: "app/(shop)/cart/page.tsx", content: "cart" },
    { path: "lib/cart-context.tsx", content: "context" },
    { path: "lib/prisma.ts", content: "prisma" },
  ];

  it("prefixes (shop) paths with [locale]", () => {
    const result = augmentWooScaffoldForI18n(shopFiles, ["en", "ja"], "en");
    const paths = result.map((f) => f.path);
    expect(paths).toContain("app/[locale]/(shop)/products/page.tsx");
    expect(paths).toContain("app/[locale]/(shop)/products/[slug]/page.tsx");
    expect(paths).toContain("app/[locale]/(shop)/cart/page.tsx");
  });

  it("leaves non-shop paths unchanged", () => {
    const result = augmentWooScaffoldForI18n(shopFiles, ["en", "ja"], "en");
    const paths = result.map((f) => f.path);
    expect(paths).toContain("lib/cart-context.tsx");
    expect(paths).toContain("lib/prisma.ts");
  });

  it("does not modify file content", () => {
    const result = augmentWooScaffoldForI18n(shopFiles, ["en"], "en");
    const products = result.find((f) => f.path.includes("products/page.tsx"))!;
    expect(products.content).toBe("products");
  });

  it("returns empty array unchanged", () => {
    expect(augmentWooScaffoldForI18n([], ["en"], "en")).toEqual([]);
  });
});

// ── augmentI18nForMultisite ───────────────────────────────────────────────────

describe("augmentI18nForMultisite", () => {
  const i18nFiles = [
    { path: "middleware.ts", content: "export function middleware() {}\n" },
    { path: "i18n/config.ts", content: "export const locales = [];\n" },
  ];

  it("adds multisite comment to i18n middleware", () => {
    const result = augmentI18nForMultisite(i18nFiles);
    const mw = result.find((f) => f.path === "middleware.ts")!;
    expect(mw.content).toContain("TODO: For Multisite + i18n");
    expect(mw.content).toContain("per-site locale settings");
    expect(mw.content).toContain("Site model");
  });

  it("does not modify non-middleware files", () => {
    const result = augmentI18nForMultisite(i18nFiles);
    const config = result.find((f) => f.path === "i18n/config.ts")!;
    expect(config.content).toBe("export const locales = [];\n");
  });

  it("preserves existing middleware content before the comment", () => {
    const result = augmentI18nForMultisite(i18nFiles);
    const mw = result.find((f) => f.path === "middleware.ts")!;
    expect(mw.content.startsWith("export function middleware() {}\n")).toBe(true);
  });
});
