import { describe, it, expect } from "vitest";
import { generateWooPrismaSchema } from "../src/woo-prisma-generator.js";
import type { WooProduct } from "@wp-transfer/core";

function makeProduct(overrides: Partial<WooProduct> = {}): WooProduct {
  return {
    id: 1, name: "Test Product", slug: "test-product", type: "simple",
    status: "publish", description: "", shortDescription: "",
    sku: "TEST-001", price: "29.99", regularPrice: "29.99", salePrice: "",
    stockStatus: "instock", weight: "",
    categories: [], attributes: [], variations: [], images: [],
    productUrl: "", buttonText: "",
    ...overrides,
  };
}

describe("generateWooPrismaSchema", () => {
  it("generates a valid Prisma schema string", () => {
    const schema = generateWooPrismaSchema([makeProduct()]);
    expect(schema).toContain("model Product {");
    expect(schema).toContain("model ProductVariation {");
    expect(schema).toContain("model ProductAttribute {");
    expect(schema).toContain("model ProductAttributeValue {");
    expect(schema).toContain("model ProductCategory {");
    expect(schema).toContain("model ProductImage {");
  });

  it("includes datasource and generator blocks", () => {
    const schema = generateWooPrismaSchema([makeProduct()]);
    expect(schema).toContain('provider = "prisma-client-js"');
    expect(schema).toContain('provider = "postgresql"');
    expect(schema).toContain("DATABASE_URL");
  });

  it("includes all Product model fields from the spec", () => {
    const schema = generateWooPrismaSchema([makeProduct()]);
    expect(schema).toContain("name");
    expect(schema).toContain("slug");
    expect(schema).toContain("type");
    expect(schema).toContain("status");
    expect(schema).toContain("description");
    expect(schema).toContain("shortDescription");
    expect(schema).toContain("productUrl");
    expect(schema).toContain("buttonText");
    expect(schema).toContain("sku");
    expect(schema).toContain("price");
    expect(schema).toContain("stockStatus");
  });

  it("includes relation fields", () => {
    const schema = generateWooPrismaSchema([makeProduct()]);
    expect(schema).toContain("variations");
    expect(schema).toContain("productId");
    expect(schema).toContain("@relation");
  });

  it("includes seed data comment with product count", () => {
    const products = [makeProduct(), makeProduct({ id: 2, slug: "second" })];
    const schema = generateWooPrismaSchema(products);
    expect(schema).toContain("2 products");
  });
});
