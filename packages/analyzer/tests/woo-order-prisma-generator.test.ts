import { describe, it, expect } from "vitest";
import { generateWooOrderPrismaSchema } from "../src/woo-order-prisma-generator.js";

describe("generateWooOrderPrismaSchema", () => {
  it("generates Customer, Order, OrderItem models", () => {
    const schema = generateWooOrderPrismaSchema();

    expect(schema).toContain("model Customer {");
    expect(schema).toContain("model Order {");
    expect(schema).toContain("model OrderItem {");
  });

  it("includes relations and indexes", () => {
    const schema = generateWooOrderPrismaSchema();

    // Customer.email unique index
    expect(schema).toContain("email     String   @unique");

    // Order -> Customer relation
    expect(schema).toContain("customerId Int");
    expect(schema).toContain(
      "customer   Customer    @relation(fields: [customerId], references: [id])",
    );

    // Order -> OrderItem relation
    expect(schema).toContain("items      OrderItem[]");

    // OrderItem -> Order relation
    expect(schema).toContain("orderId   Int");
    expect(schema).toContain(
      "order     Order   @relation(fields: [orderId], references: [id])",
    );

    // Customer -> Order[] relation
    expect(schema).toContain("orders    Order[]");
  });

  it("includes Decimal type for monetary fields", () => {
    const schema = generateWooOrderPrismaSchema();

    expect(schema).toContain("total      Decimal     @db.Decimal(10, 2)");
    // OrderItem total
    expect(schema).toContain("total     Decimal @db.Decimal(10, 2)");
  });

  it("includes default values", () => {
    const schema = generateWooOrderPrismaSchema();

    expect(schema).toContain('@default("USD")');
    expect(schema).toContain("@default(now())");
    expect(schema).toContain("@default(autoincrement())");
  });

  it("includes productId as optional in OrderItem", () => {
    const schema = generateWooOrderPrismaSchema();

    expect(schema).toContain("productId Int?");
  });
});
