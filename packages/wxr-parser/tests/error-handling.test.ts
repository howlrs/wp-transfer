import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { parseWxr } from "../src/index.js";

describe("parseWxr — malformed XML", () => {
  it("recovers from completely invalid XML without throwing", async () => {
    const garbage = "this is not xml at all <><><<<";
    const stream = Readable.from([garbage]);
    const result = await parseWxr(stream);

    expect(result.posts).toEqual([]);
    expect(result.users).toEqual([]);
    expect(result.taxonomies).toEqual([]);
    expect(result.media).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("collects errors with line and column info", async () => {
    const garbage = "not xml";
    const stream = Readable.from([garbage]);
    const result = await parseWxr(stream);

    for (const err of result.errors) {
      expect(err.message).toBeTruthy();
      expect(typeof err.line).toBe("number");
      expect(typeof err.column).toBe("number");
    }
  });
});

describe("parseWxr — valid XML but not WXR", () => {
  it("returns empty collections for XML with no WXR elements", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <entry><name>Not a WordPress export</name></entry>
</root>`;
    const stream = Readable.from([xml]);
    const result = await parseWxr(stream);

    expect(result.posts).toEqual([]);
    expect(result.users).toEqual([]);
    expect(result.taxonomies).toEqual([]);
    expect(result.media).toEqual([]);
    expect(result.siteTitle).toBe("");
    expect(result.siteUrl).toBe("");
    expect(result.wpVersion).toBe("");
  });
});

describe("parseWxr — empty string input", () => {
  it("handles empty string without throwing", async () => {
    const stream = Readable.from([""]);
    const result = await parseWxr(stream);

    expect(result.posts).toEqual([]);
    expect(result.users).toEqual([]);
    expect(result.taxonomies).toEqual([]);
    expect(result.media).toEqual([]);
  });
});

describe("parseWxr — deeply nested XML", () => {
  it("handles deeply nested elements without crashing", async () => {
    const depth = 500;
    const open = Array.from({ length: depth }, (_, i) => `<n${i}>`).join("");
    const close = Array.from({ length: depth }, (_, i) => `</n${depth - 1 - i}>`).join("");
    const xml = `<?xml version="1.0"?><root>${open}leaf${close}</root>`;

    const stream = Readable.from([xml]);
    const result = await parseWxr(stream);

    // Should complete without stack overflow; content is irrelevant
    expect(result.posts).toEqual([]);
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
