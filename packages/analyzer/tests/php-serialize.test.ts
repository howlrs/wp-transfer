import { describe, it, expect } from "vitest";
import { phpUnserialize } from "../src/php-serialize.js";

describe("phpUnserialize", () => {
  it("parses a string", () => {
    expect(phpUnserialize('s:5:"hello";')).toBe("hello");
  });

  it("parses an integer", () => {
    expect(phpUnserialize("i:42;")).toBe(42);
  });

  it("parses a boolean true", () => {
    expect(phpUnserialize("b:1;")).toBe(true);
  });

  it("parses a boolean false", () => {
    expect(phpUnserialize("b:0;")).toBe(false);
  });

  it("parses an empty array", () => {
    expect(phpUnserialize("a:0:{}")).toEqual({});
  });

  it("parses a simple associative array", () => {
    const input = 'a:2:{s:4:"name";s:5:"Color";s:5:"value";s:3:"Red";}';
    expect(phpUnserialize(input)).toEqual({ name: "Color", value: "Red" });
  });

  it("parses nested associative arrays", () => {
    const input = 'a:1:{s:5:"color";a:2:{s:4:"name";s:5:"Color";s:10:"is_visible";i:1;}}';
    expect(phpUnserialize(input)).toEqual({
      color: { name: "Color", is_visible: 1 },
    });
  });

  it("parses WooCommerce _product_attributes format", () => {
    const input =
      'a:1:{s:5:"color";a:6:{s:4:"name";s:5:"Color";s:5:"value";s:0:"";s:8:"position";i:0;s:10:"is_visible";i:1;s:12:"is_variation";i:0;s:11:"is_taxonomy";i:1;}}';
    const result = phpUnserialize(input) as Record<string, Record<string, unknown>>;
    expect(result.color).toBeDefined();
    expect(result.color.name).toBe("Color");
    expect(result.color.is_variation).toBe(0);
    expect(result.color.is_taxonomy).toBe(1);
  });

  it("returns null for invalid input", () => {
    expect(phpUnserialize("invalid")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(phpUnserialize("")).toBeNull();
  });

  it("returns null for input exceeding 1MB", () => {
    const huge = "s:" + (1024 * 1024 + 1) + ':"' + "x".repeat(1024 * 1024 + 1) + '";';
    expect(phpUnserialize(huge)).toBeNull();
  });

  it("handles integer keys in arrays", () => {
    const input = 'a:2:{i:0;s:3:"foo";i:1;s:3:"bar";}';
    expect(phpUnserialize(input)).toEqual({ 0: "foo", 1: "bar" });
  });

  it("parses null values", () => {
    expect(phpUnserialize("N;")).toBeNull();
  });
});
