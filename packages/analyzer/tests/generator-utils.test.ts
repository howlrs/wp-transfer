import { describe, it, expect } from "vitest";
import {
  toCamelCase,
  toPascalCase,
  toPrismaModelName,
  toPascalModelName,
  toSchemaName,
  pluralizeResource,
  fieldTypeToInputType,
} from "../src/generator-utils.js";

describe("toCamelCase", () => {
  it("converts snake_case to camelCase", () => {
    expect(toCamelCase("order_item")).toBe("orderItem");
  });

  it("handles multi-segment snake_case", () => {
    expect(toCamelCase("legacy_product_categories")).toBe("legacyProductCategories");
  });

  it("handles kebab-case", () => {
    expect(toCamelCase("order-item")).toBe("orderItem");
  });

  it("handles single word", () => {
    expect(toCamelCase("article")).toBe("article");
  });
});

describe("toPascalCase", () => {
  it("converts snake_case to PascalCase", () => {
    expect(toPascalCase("order_item")).toBe("OrderItem");
  });

  it("converts kebab-case to PascalCase", () => {
    expect(toPascalCase("order-item")).toBe("OrderItem");
  });

  it("handles single word", () => {
    expect(toPascalCase("article")).toBe("Article");
  });
});

describe("toPrismaModelName", () => {
  it("converts table name to camelCase model name", () => {
    expect(toPrismaModelName("order_item")).toBe("orderItem");
  });

  it("handles single word", () => {
    expect(toPrismaModelName("article")).toBe("article");
  });
});

describe("toPascalModelName", () => {
  it("converts table name to PascalCase model name", () => {
    expect(toPascalModelName("order_item")).toBe("OrderItem");
  });
});

describe("toSchemaName", () => {
  it("converts simple PHP filename to schema name", () => {
    expect(toSchemaName("insert.php")).toBe("InsertSchema");
  });

  it("converts kebab-case PHP filename to schema name", () => {
    expect(toSchemaName("order-item-update.php")).toBe("OrderItemUpdateSchema");
  });

  it("converts snake_case PHP filename to schema name", () => {
    expect(toSchemaName("insert_order_item.php")).toBe("InsertOrderItemSchema");
  });

  it("handles filename without .php extension", () => {
    expect(toSchemaName("update")).toBe("UpdateSchema");
  });

  it("creates valid, deterministic identifiers for arbitrary filenames", () => {
    expect(toSchemaName("create product.php")).toBe("CreateProductSchema");
    expect(toSchemaName("9.config.php")).toBe("Php9ConfigSchema");
    expect(toSchemaName("日本語.php")).toBe("U65e5U672cU8a9eSchema");
    expect(toSchemaName("...php")).toBe("PhpFileSchema");
    expect(toSchemaName("class.php")).toBe("ClassSchema");

    for (const fileName of ["create product.php", "9.config.php", "日本語.php", "...php", "class.php"]) {
      expect(toSchemaName(fileName)).toMatch(/^[A-Za-z_$][A-Za-z0-9_$]*$/);
    }
  });
});

describe("pluralizeResource", () => {
  it("pluralizes regular collection names", () => {
    expect(pluralizeResource("product")).toBe("products");
    expect(pluralizeResource("catalog_item")).toBe("catalog_items");
  });

  it("handles common English endings and stable uncountable names", () => {
    expect(pluralizeResource("category")).toBe("categories");
    expect(pluralizeResource("box")).toBe("boxes");
    expect(pluralizeResource("media")).toBe("media");
  });

  it("does not pluralize an existing collection name twice", () => {
    expect(pluralizeResource("products")).toBe("products");
  });
});

describe("fieldTypeToInputType", () => {
  it("maps Int to number", () => {
    expect(fieldTypeToInputType("Int")).toBe("number");
  });

  it("maps BigInt to number", () => {
    expect(fieldTypeToInputType("BigInt")).toBe("number");
  });

  it("maps Float to number", () => {
    expect(fieldTypeToInputType("Float")).toBe("number");
  });

  it("maps Boolean to checkbox", () => {
    expect(fieldTypeToInputType("Boolean")).toBe("checkbox");
  });

  it("maps DateTime to datetime-local", () => {
    expect(fieldTypeToInputType("DateTime")).toBe("datetime-local");
  });

  it("maps String to text", () => {
    expect(fieldTypeToInputType("String")).toBe("text");
  });

  it("maps unknown types to text", () => {
    expect(fieldTypeToInputType("Json")).toBe("text");
  });
});
