import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "@wp-transfer/wxr-parser";
import { detectI18n, generateI18nScaffold } from "../src/index.js";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/wxr");

describe("E2E: i18n WXR → Detection → Scaffold", () => {
  it("full pipeline with WPML fixture", async () => {
    const stream = createReadStream(resolve(fixturesDir, "i18n-wpml.xml"), "utf-8");
    const wxr = await parseWxr(stream);
    expect(wxr.siteTitle).toBe("WPML Test Site");
    expect(wxr.posts).toHaveLength(4);

    const i18n = detectI18n(wxr.posts);
    expect(i18n.plugin).toBe("wpml");
    expect(i18n.locales.sort()).toEqual(["en", "ja"]);

    const files = generateI18nScaffold({ locales: i18n.locales, defaultLocale: i18n.defaultLocale });
    const paths = files.map((f) => f.path);
    expect(paths).toContain("middleware.ts");
    expect(paths).toContain("i18n/config.ts");
    expect(paths).toContain("app/[locale]/layout.tsx");
    expect(paths).toContain("app/[locale]/page.tsx");

    const config = files.find((f) => f.path === "i18n/config.ts")!;
    expect(config.content).toContain('"en"');
    expect(config.content).toContain('"ja"');

    for (const file of files) {
      expect(file.content.length).toBeGreaterThan(0);
    }
  });

  it("full pipeline with Polylang fixture", async () => {
    const stream = createReadStream(resolve(fixturesDir, "i18n-polylang.xml"), "utf-8");
    const wxr = await parseWxr(stream);
    expect(wxr.siteTitle).toBe("Polylang Test Site");

    const i18n = detectI18n(wxr.posts);
    expect(i18n.plugin).toBe("polylang");
    expect(i18n.locales.sort()).toEqual(["en", "ja"]);

    const files = generateI18nScaffold({ locales: i18n.locales, defaultLocale: i18n.defaultLocale });
    expect(files).toHaveLength(4);
    for (const file of files) {
      expect(file.content.length).toBeGreaterThan(0);
    }
  });

  it("no i18n with regular WXR", async () => {
    const stream = createReadStream(resolve(fixturesDir, "minimal.xml"), "utf-8");
    const wxr = await parseWxr(stream);
    const i18n = detectI18n(wxr.posts);
    expect(i18n.plugin).toBeNull();
    expect(i18n.locales).toHaveLength(0);
  });
});
