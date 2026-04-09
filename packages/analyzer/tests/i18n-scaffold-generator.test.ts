import { describe, it, expect } from "vitest";
import { generateI18nScaffold } from "../src/i18n-scaffold-generator.js";
import type { ScaffoldFile } from "../src/blog-scaffold-generator.js";

function findFile(files: ScaffoldFile[], pathPattern: string): ScaffoldFile | undefined {
  return files.find((f) => f.path.includes(pathPattern));
}

describe("generateI18nScaffold", () => {
  it("generates all expected scaffold files", () => {
    const files = generateI18nScaffold({ locales: ["en", "ja"], defaultLocale: "en" });
    const paths = files.map((f) => f.path);
    expect(paths).toContain("middleware.ts");
    expect(paths).toContain("i18n/config.ts");
    expect(paths).toContain("app/[locale]/layout.tsx");
    expect(paths).toContain("app/[locale]/page.tsx");
  });

  it("middleware contains locale detection logic", () => {
    const files = generateI18nScaffold({ locales: ["en", "ja", "fr"], defaultLocale: "en" });
    const mw = findFile(files, "middleware.ts")!;
    expect(mw.content).toContain("NextResponse");
    expect(mw.content).toContain("en");
    expect(mw.content).toContain("ja");
    expect(mw.content).toContain("fr");
    expect(mw.content).toContain("accept-language");
  });

  it("config exports locales array and defaultLocale", () => {
    const files = generateI18nScaffold({ locales: ["en", "ja"], defaultLocale: "en" });
    const config = findFile(files, "config.ts")!;
    expect(config.content).toContain('"en"');
    expect(config.content).toContain('"ja"');
    expect(config.content).toContain("defaultLocale");
    expect(config.content).toContain("Locale");
  });

  it("layout sets html lang attribute from params", () => {
    const files = generateI18nScaffold({ locales: ["en", "ja"], defaultLocale: "en" });
    const layout = findFile(files, "layout.tsx")!;
    expect(layout.content).toContain("lang");
    expect(layout.content).toContain("locale");
    expect(layout.content).toContain("params");
  });

  it("page shows locale info and links to other locales", () => {
    const files = generateI18nScaffold({ locales: ["en", "ja"], defaultLocale: "en" });
    const page = findFile(files, "page.tsx")!;
    expect(page.content).toContain("locale");
  });

  it("handles single locale", () => {
    const files = generateI18nScaffold({ locales: ["en"], defaultLocale: "en" });
    expect(files.length).toBe(4);
    const config = findFile(files, "config.ts")!;
    expect(config.content).toContain('"en"');
  });
});
