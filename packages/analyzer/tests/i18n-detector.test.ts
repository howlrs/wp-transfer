import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "@wp-transfer/wxr-parser";
import { detectI18n } from "../src/i18n-detector.js";
import type { WpPost } from "@wp-transfer/core";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/wxr");

describe("detectI18n", () => {
  it("detects WPML from wpml_language meta", async () => {
    const stream = createReadStream(resolve(fixturesDir, "i18n-wpml.xml"), "utf-8");
    const wxr = await parseWxr(stream);
    const result = detectI18n(wxr.posts);
    expect(result.plugin).toBe("wpml");
    expect(result.locales.sort()).toEqual(["en", "ja"]);
    expect(result.defaultLocale).toBe("en");
    expect(result.postLocaleMap.size).toBe(4);
    expect(result.postLocaleMap.get(1)).toBe("en");
    expect(result.postLocaleMap.get(3)).toBe("ja");
  });

  it("detects Polylang from language taxonomy terms", async () => {
    const stream = createReadStream(resolve(fixturesDir, "i18n-polylang.xml"), "utf-8");
    const wxr = await parseWxr(stream);
    const result = detectI18n(wxr.posts);
    expect(result.plugin).toBe("polylang");
    expect(result.locales.sort()).toEqual(["en", "ja"]);
    expect(result.defaultLocale).toBe("en");
    expect(result.postLocaleMap.size).toBe(4);
  });

  it("returns null plugin when no i18n data found", async () => {
    const stream = createReadStream(resolve(fixturesDir, "minimal.xml"), "utf-8");
    const wxr = await parseWxr(stream);
    const result = detectI18n(wxr.posts);
    expect(result.plugin).toBeNull();
    expect(result.locales).toHaveLength(0);
    expect(result.defaultLocale).toBe("");
    expect(result.postLocaleMap.size).toBe(0);
  });

  it("defaults locale to most frequent", () => {
    const posts: WpPost[] = [
      { id: 1, title: "A", slug: "a", status: "publish", type: "post", content: "", excerpt: "", date: "", modified: "", author: 0, meta: { wpml_language: "fr" } },
      { id: 2, title: "B", slug: "b", status: "publish", type: "post", content: "", excerpt: "", date: "", modified: "", author: 0, meta: { wpml_language: "fr" } },
      { id: 3, title: "C", slug: "c", status: "publish", type: "post", content: "", excerpt: "", date: "", modified: "", author: 0, meta: { wpml_language: "en" } },
    ];
    const result = detectI18n(posts);
    expect(result.defaultLocale).toBe("fr");
  });

  it("ignores invalid locale values (non ISO 639-1)", () => {
    const posts: WpPost[] = [
      { id: 1, title: "A", slug: "a", status: "publish", type: "post", content: "", excerpt: "", date: "", modified: "", author: 0, meta: { wpml_language: "en" } },
      { id: 2, title: "B", slug: "b", status: "publish", type: "post", content: "", excerpt: "", date: "", modified: "", author: 0, meta: { wpml_language: "../etc" } },
    ];
    const result = detectI18n(posts);
    expect(result.locales).toEqual(["en"]);
    expect(result.postLocaleMap.size).toBe(1);
  });

  it("handles empty post array", () => {
    const result = detectI18n([]);
    expect(result.plugin).toBeNull();
    expect(result.locales).toHaveLength(0);
  });
});
