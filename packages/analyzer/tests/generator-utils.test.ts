import { describe, it, expect } from "vitest";
import {
  toCamelCase,
  toPascalCase,
  toPrismaModelName,
  toPascalModelName,
  toSchemaName,
  fieldTypeToInputType,
} from "../src/generator-utils.js";

describe("toCamelCase", () => {
  it("converts snake_case to camelCase", () => {
    expect(toCamelCase("event_slot")).toBe("eventSlot");
  });

  it("handles multi-segment snake_case", () => {
    expect(toCamelCase("m_coupon_target_stores")).toBe("mCouponTargetStores");
  });

  it("handles kebab-case", () => {
    expect(toCamelCase("event-slot")).toBe("eventSlot");
  });

  it("handles single word", () => {
    expect(toCamelCase("event")).toBe("event");
  });
});

describe("toPascalCase", () => {
  it("converts snake_case to PascalCase", () => {
    expect(toPascalCase("event_slot")).toBe("EventSlot");
  });

  it("converts kebab-case to PascalCase", () => {
    expect(toPascalCase("event-slot")).toBe("EventSlot");
  });

  it("handles single word", () => {
    expect(toPascalCase("event")).toBe("Event");
  });
});

describe("toPrismaModelName", () => {
  it("converts table name to camelCase model name", () => {
    expect(toPrismaModelName("event_slot")).toBe("eventSlot");
  });

  it("handles single word", () => {
    expect(toPrismaModelName("event")).toBe("event");
  });
});

describe("toPascalModelName", () => {
  it("converts table name to PascalCase model name", () => {
    expect(toPascalModelName("event_slot")).toBe("EventSlot");
  });
});

describe("toSchemaName", () => {
  it("converts simple PHP filename to schema name", () => {
    expect(toSchemaName("insert.php")).toBe("InsertSchema");
  });

  it("converts kebab-case PHP filename to schema name", () => {
    expect(toSchemaName("event-slot-update.php")).toBe("EventSlotUpdateSchema");
  });

  it("converts snake_case PHP filename to schema name", () => {
    expect(toSchemaName("insert_event_slot.php")).toBe("InsertEventSlotSchema");
  });

  it("handles filename without .php extension", () => {
    expect(toSchemaName("update")).toBe("UpdateSchema");
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
