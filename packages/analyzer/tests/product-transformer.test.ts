import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "@wp-transfer/wxr-parser";
import { transformProducts } from "../src/product-transformer.js";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/wxr");

async function loadWooFixture() {
  const stream = createReadStream(resolve(fixturesDir, "woocommerce.xml"), "utf-8");
  return parseWxr(stream);
}

describe("transformProducts", () => {
  it("extracts only product posts, ignoring regular posts and variations at top level", async () => {
    const wxr = await loadWooFixture();
    const products = transformProducts(wxr.posts, wxr.media);
    expect(products).toHaveLength(4);
    expect(products.map((p) => p.slug).sort()).toEqual([
      "basic-tshirt",
      "laptop-bundle",
      "partner-headphones",
      "premium-hoodie",
    ]);
  });

  it("detects product types from product_type taxonomy", async () => {
    const wxr = await loadWooFixture();
    const products = transformProducts(wxr.posts, wxr.media);
    const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
    expect(bySlug["basic-tshirt"].type).toBe("simple");
    expect(bySlug["premium-hoodie"].type).toBe("variable");
    expect(bySlug["laptop-bundle"].type).toBe("grouped");
    expect(bySlug["partner-headphones"].type).toBe("external");
  });

  it("extracts price metadata", async () => {
    const wxr = await loadWooFixture();
    const products = transformProducts(wxr.posts, wxr.media);
    const tshirt = products.find((p) => p.slug === "basic-tshirt")!;
    expect(tshirt.price).toBe("19.99");
    expect(tshirt.regularPrice).toBe("24.99");
    expect(tshirt.salePrice).toBe("19.99");
    expect(tshirt.sku).toBe("TSHIRT-BASIC-001");
    expect(tshirt.stockStatus).toBe("instock");
    expect(tshirt.weight).toBe("0.2");
  });

  it("attaches variations to parent products via parentId", async () => {
    const wxr = await loadWooFixture();
    const products = transformProducts(wxr.posts, wxr.media);
    const hoodie = products.find((p) => p.slug === "premium-hoodie")!;
    expect(hoodie.variations).toHaveLength(3);
    expect(hoodie.variations[0].sku).toBe("HOODIE-PREM-S-BLU");
    expect(hoodie.variations[0].attributes).toContainEqual({ name: "pa_size", value: "small" });
    expect(hoodie.variations[0].attributes).toContainEqual({ name: "pa_color", value: "blue" });
  });

  it("extracts product categories from product_cat terms", async () => {
    const wxr = await loadWooFixture();
    const products = transformProducts(wxr.posts, wxr.media);
    const tshirt = products.find((p) => p.slug === "basic-tshirt")!;
    expect(tshirt.categories).toContainEqual({ slug: "clothing", name: "Clothing" });
  });

  it("extracts attributes from pa_* terms and _product_attributes", async () => {
    const wxr = await loadWooFixture();
    const products = transformProducts(wxr.posts, wxr.media);
    const hoodie = products.find((p) => p.slug === "premium-hoodie")!;
    const sizeAttr = hoodie.attributes.find((a) => a.slug === "pa_size");
    expect(sizeAttr).toBeDefined();
    expect(sizeAttr!.name).toBe("Size");
    expect(sizeAttr!.values.sort()).toEqual(["large", "medium", "small"]);
    expect(sizeAttr!.isVariation).toBe(true);
    const colorAttr = hoodie.attributes.find((a) => a.slug === "pa_color");
    expect(colorAttr).toBeDefined();
    expect(colorAttr!.values.sort()).toEqual(["black", "blue"]);
  });

  it("resolves thumbnail and gallery images from media", async () => {
    const wxr = await loadWooFixture();
    const products = transformProducts(wxr.posts, wxr.media);
    const tshirt = products.find((p) => p.slug === "basic-tshirt")!;
    expect(tshirt.images.length).toBeGreaterThanOrEqual(2);
    expect(tshirt.images[0].url).toContain("tshirt-front.jpg");
    expect(tshirt.images[1].url).toContain("tshirt-back.jpg");
  });

  it("extracts external product fields", async () => {
    const wxr = await loadWooFixture();
    const products = transformProducts(wxr.posts, wxr.media);
    const headphones = products.find((p) => p.slug === "partner-headphones")!;
    expect(headphones.type).toBe("external");
    expect(headphones.productUrl).toBe("https://partner.example.com/headphones");
    expect(headphones.buttonText).toBe("Buy on Partner Site");
  });

  it("defaults to simple type when product_type taxonomy is missing", () => {
    const products = transformProducts(
      [{
        id: 999, title: "No Type", slug: "no-type", status: "publish" as const,
        type: "product", content: "", excerpt: "", date: "", modified: "",
        author: 0, meta: {},
        terms: [{ domain: "product_cat", slug: "clothing", name: "Clothing" }],
      }],
      [],
    );
    expect(products[0].type).toBe("simple");
  });

  it("handles products with no metadata gracefully", () => {
    const products = transformProducts(
      [{
        id: 1, title: "Empty Product", slug: "empty", status: "publish" as const,
        type: "product", content: "", excerpt: "", date: "", modified: "",
        author: 0, meta: {},
      }],
      [],
    );
    expect(products).toHaveLength(1);
    expect(products[0].price).toBe("");
    expect(products[0].sku).toBe("");
    expect(products[0].stockStatus).toBe("instock");
    expect(products[0].variations).toHaveLength(0);
  });
});
