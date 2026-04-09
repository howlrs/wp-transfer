import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "@wp-transfer/wxr-parser";
import { detectMultisite } from "../src/multisite-detector.js";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/wxr");

describe("detectMultisite", () => {
  it("detects subdirectory network from main + sub WXR", async () => {
    const mainStream = createReadStream(resolve(fixturesDir, "multisite-main.xml"), "utf-8");
    const subStream = createReadStream(resolve(fixturesDir, "multisite-sub.xml"), "utf-8");
    const mainWxr = await parseWxr(mainStream);
    const subWxr = await parseWxr(subStream);

    const result = detectMultisite([mainWxr, subWxr]);

    expect(result.mode).toBe("subdirectory");
    expect(result.networkUrl).toBe("https://example.com");
    expect(result.sites).toHaveLength(2);

    const main = result.sites.find((s) => s.siteId === 1);
    expect(main).toBeDefined();
    expect(main!.slug).toBe("main");
    expect(main!.path).toBe("/");
    expect(main!.title).toBe("Main Site");

    const sub = result.sites.find((s) => s.siteId === 2);
    expect(sub).toBeDefined();
    expect(sub!.slug).toBe("site2");
    expect(sub!.path).toBe("/site2");
  });

  it("detects subdomain network", () => {
    const fakeMain = {
      siteTitle: "Main", siteUrl: "https://example.com", blogUrl: "https://example.com",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };
    const fakeSub = {
      siteTitle: "Blog", siteUrl: "https://example.com", blogUrl: "https://blog.example.com",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };

    const result = detectMultisite([fakeMain, fakeSub]);

    expect(result.mode).toBe("subdomain");
    expect(result.sites[1]!.subdomain).toBe("blog");
    expect(result.sites[1]!.slug).toBe("blog");
  });

  it("returns unknown mode when URLs don't match patterns", () => {
    const fakeA = {
      siteTitle: "Site A", siteUrl: "https://example.com", blogUrl: "https://other-domain.com",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };
    const fakeB = {
      siteTitle: "Site B", siteUrl: "https://example.com", blogUrl: "https://another-domain.com",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };

    const result = detectMultisite([fakeA, fakeB]);
    expect(result.mode).toBe("unknown");
  });

  it("assigns siteId=1 to main site and sorts subs alphabetically", () => {
    const fakeMain = {
      siteTitle: "Main", siteUrl: "https://example.com", blogUrl: "https://example.com",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };
    const fakeZ = {
      siteTitle: "Z Site", siteUrl: "https://example.com", blogUrl: "https://example.com/z-site",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };
    const fakeA = {
      siteTitle: "A Site", siteUrl: "https://example.com", blogUrl: "https://example.com/a-site",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };

    const result = detectMultisite([fakeZ, fakeMain, fakeA]);

    expect(result.sites[0]!.siteId).toBe(1);
    expect(result.sites[0]!.slug).toBe("main");
    expect(result.sites[1]!.siteId).toBe(2);
    expect(result.sites[1]!.slug).toBe("a-site");
    expect(result.sites[2]!.siteId).toBe(3);
    expect(result.sites[2]!.slug).toBe("z-site");
  });

  it("falls back to siteId=1 for first WXR when no main found", () => {
    const fakeA = {
      siteTitle: "A", siteUrl: "https://example.com", blogUrl: "https://example.com/a",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };

    const result = detectMultisite([fakeA]);
    expect(result.sites[0]!.siteId).toBe(1);
  });

  it("returns empty network for empty input", () => {
    const result = detectMultisite([]);
    expect(result.sites).toHaveLength(0);
    expect(result.mode).toBe("unknown");
  });
});
