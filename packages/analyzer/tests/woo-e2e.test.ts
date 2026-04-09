import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "@wp-transfer/wxr-parser";
import {
  transformProducts,
  generateWooPrismaSchema,
  generateWooScaffold,
} from "../src/index.js";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/wxr");

describe("E2E: WooCommerce WXR → Products → Prisma + Scaffold", () => {
  it("runs the full WooCommerce pipeline", async () => {
    // Step 1: Parse WXR
    const stream = createReadStream(resolve(fixturesDir, "woocommerce.xml"), "utf-8");
    const wxr = await parseWxr(stream);

    expect(wxr.siteTitle).toBe("WooCommerce Test Shop");
    expect(wxr.errors).toHaveLength(0);

    // Verify products and variations are parsed
    const productPosts = wxr.posts.filter((p) => p.type === "product");
    const variationPosts = wxr.posts.filter((p) => p.type === "product_variation");
    expect(productPosts.length).toBe(4);
    expect(variationPosts.length).toBe(3);

    // Step 2: Transform products
    const products = transformProducts(wxr.posts, wxr.media);
    expect(products).toHaveLength(4);

    // Verify variable product has variations attached
    const hoodie = products.find((p) => p.slug === "premium-hoodie")!;
    expect(hoodie.type).toBe("variable");
    expect(hoodie.variations).toHaveLength(3);

    // Verify external product fields
    const headphones = products.find((p) => p.slug === "partner-headphones")!;
    expect(headphones.productUrl).toBe("https://partner.example.com/headphones");

    // Step 3: Generate Prisma schema
    const prismaSchema = generateWooPrismaSchema(products);
    expect(prismaSchema).toContain("model Product {");
    expect(prismaSchema).toContain("4 products");
    expect(prismaSchema).toContain("3 variations");

    // Step 4: Generate scaffold
    const categories = [
      ...new Map(
        products.flatMap((p) => p.categories).map((c) => [c.slug, c]),
      ).values(),
    ];
    const scaffoldFiles = generateWooScaffold({
      siteTitle: "WooCommerce Test Shop",
      products,
      categories,
      mediaDomains: ["shop.example.com"],
    });

    const paths = scaffoldFiles.map((f) => f.path);
    expect(paths).toContain("app/(shop)/products/page.tsx");
    expect(paths).toContain("app/(shop)/products/[slug]/page.tsx");
    expect(paths).toContain("app/(shop)/cart/page.tsx");
    expect(paths).toContain("app/(shop)/checkout/page.tsx");
    expect(paths).toContain("lib/cart-context.tsx");
    expect(paths).toContain("lib/prisma.ts");

    // Verify all generated files have non-empty content
    for (const file of scaffoldFiles) {
      expect(file.content.length).toBeGreaterThan(0);
    }
  });

  it("handles WXR with no WooCommerce products gracefully", async () => {
    const stream = createReadStream(resolve(fixturesDir, "minimal.xml"), "utf-8");
    const wxr = await parseWxr(stream);
    const products = transformProducts(wxr.posts, wxr.media);
    expect(products).toHaveLength(0);
  });
});
