import { describe, it, expect } from "vitest";
import { generateWooScaffold } from "../src/woo-scaffold-generator.js";
import type { WooProduct } from "@wp-transfer/core";
import type { ScaffoldFile } from "../src/blog-scaffold-generator.js";

function makeProduct(overrides: Partial<WooProduct> = {}): WooProduct {
  return {
    id: 1, name: "Test Product", slug: "test-product", type: "simple",
    status: "publish", description: "<p>Test description</p>",
    shortDescription: "Short desc", sku: "TEST-001",
    price: "29.99", regularPrice: "29.99", salePrice: "",
    stockStatus: "instock", weight: "",
    categories: [{ slug: "general", name: "General" }],
    attributes: [], variations: [],
    images: [{ url: "https://example.com/img.jpg", alt: "Test" }],
    productUrl: "", buttonText: "",
    ...overrides,
  };
}

function findFile(files: ScaffoldFile[], pathPattern: string): ScaffoldFile | undefined {
  return files.find((f) => f.path.includes(pathPattern));
}

describe("generateWooScaffold", () => {
  it("generates all expected scaffold files", () => {
    const files = generateWooScaffold({
      siteTitle: "Test Shop",
      products: [makeProduct()],
      categories: [{ slug: "general", name: "General" }],
      mediaDomains: ["example.com"],
    });
    const paths = files.map((f) => f.path);
    expect(paths).toContain("app/(shop)/products/page.tsx");
    expect(paths).toContain("app/(shop)/products/[slug]/page.tsx");
    expect(paths).toContain("app/(shop)/categories/[slug]/page.tsx");
    expect(paths).toContain("app/(shop)/cart/page.tsx");
    expect(paths).toContain("app/(shop)/checkout/page.tsx");
    expect(paths).toContain("app/(shop)/layout.tsx");
    expect(paths).toContain("lib/cart-context.tsx");
    expect(paths).toContain("lib/prisma.ts");
  });

  it("product list page includes status:publish filter", () => {
    const files = generateWooScaffold({
      siteTitle: "Shop", products: [makeProduct()],
      categories: [], mediaDomains: [],
    });
    const listPage = findFile(files, "products/page.tsx")!;
    expect(listPage.content).toContain("status");
    expect(listPage.content).toContain("publish");
  });

  it("product detail page includes variation selector for variable products", () => {
    const files = generateWooScaffold({
      siteTitle: "Shop",
      products: [makeProduct({
        type: "variable",
        variations: [{
          id: 2, sku: "VAR-1", price: "29.99", regularPrice: "29.99",
          salePrice: "", stockStatus: "instock",
          attributes: [{ name: "size", value: "S" }],
        }],
      })],
      categories: [], mediaDomains: [],
    });
    const detailPage = findFile(files, "[slug]/page.tsx")!;
    expect(detailPage.content).toContain("variation");
  });

  it("cart context includes add, remove, update, clear operations", () => {
    const files = generateWooScaffold({
      siteTitle: "Shop", products: [makeProduct()],
      categories: [], mediaDomains: [],
    });
    const cartCtx = findFile(files, "cart-context.tsx")!;
    expect(cartCtx.content).toContain("addToCart");
    expect(cartCtx.content).toContain("removeFromCart");
    expect(cartCtx.content).toContain("updateQuantity");
    expect(cartCtx.content).toContain("clearCart");
  });

  it("checkout page includes TODO comment for payment integration", () => {
    const files = generateWooScaffold({
      siteTitle: "Shop", products: [makeProduct()],
      categories: [], mediaDomains: [],
    });
    const checkout = findFile(files, "checkout/page.tsx")!;
    expect(checkout.content).toContain("TODO");
  });

  it("layout includes site title and cart icon", () => {
    const files = generateWooScaffold({
      siteTitle: "My Store", products: [makeProduct()],
      categories: [], mediaDomains: [],
    });
    const layout = findFile(files, "layout.tsx")!;
    expect(layout.content).toContain("My Store");
    expect(layout.content).toContain("cart");
  });

  it("sanitizes description with DOMPurify in generated code", () => {
    const files = generateWooScaffold({
      siteTitle: "Shop", products: [makeProduct()],
      categories: [], mediaDomains: [],
    });
    const detailPage = findFile(files, "[slug]/page.tsx")!;
    expect(detailPage.content).toContain("DOMPurify");
    expect(detailPage.content).toContain("sanitize");
  });

  it("product detail page shows external product link for type=external", () => {
    const files = generateWooScaffold({
      siteTitle: "Shop",
      products: [makeProduct({
        type: "external",
        productUrl: "https://external.example.com",
        buttonText: "Buy External",
      })],
      categories: [], mediaDomains: [],
    });
    const detailPage = findFile(files, "[slug]/page.tsx")!;
    expect(detailPage.content).toContain("external");
  });
});
