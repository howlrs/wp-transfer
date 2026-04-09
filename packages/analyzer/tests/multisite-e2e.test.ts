import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "@wp-transfer/wxr-parser";
import {
  detectMultisite,
  mergeUsers,
  normalizeMedia,
  rewriteCrossSiteUrls,
  generateMultisitePrismaSchema,
  generateMultisiteScaffold,
} from "../src/index.js";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/wxr");

describe("Multisite E2E", () => {
  it("full pipeline: WXR directory → detect → merge → normalize → rewrite → scaffold", async () => {
    // Parse WXR files
    const mainStream = createReadStream(resolve(fixturesDir, "multisite-main.xml"), "utf-8");
    const subStream = createReadStream(resolve(fixturesDir, "multisite-sub.xml"), "utf-8");
    const mainWxr = await parseWxr(mainStream);
    const subWxr = await parseWxr(subStream);

    // Step 1: Detect multisite
    const network = detectMultisite([mainWxr, subWxr]);
    expect(network.mode).toBe("subdirectory");
    expect(network.sites).toHaveLength(2);

    // Step 2: Merge users
    const siteUserData = [
      { siteId: 1, users: mainWxr.users, posts: mainWxr.posts },
      { siteId: 2, users: subWxr.users, posts: subWxr.posts },
    ];
    const { sharedUsers, userConflicts } = mergeUsers(siteUserData);
    expect(sharedUsers.length).toBeGreaterThan(0);

    // admin@example.com appears in both: "Admin" vs "Administrator"
    const adminConflict = userConflicts.find((c) => c.email === "admin@example.com");
    expect(adminConflict).toBeDefined();
    expect(adminConflict!.resolved).toBe("Admin"); // main site priority

    // Step 3: Normalize media
    const subMedia = normalizeMedia(subWxr.media, 2);
    const legacyMedia = subMedia.media.find((m) => m.url.includes("blogs.dir"));
    expect(legacyMedia).toBeUndefined(); // should be normalized
    const normalizedMedia = subMedia.media.find((m) => m.url.includes("uploads/sites/2"));
    expect(normalizedMedia).toBeDefined();

    // Step 4: Rewrite cross-site URLs
    const mainPost = mainWxr.posts.find((p) => p.content.includes("site2"));
    expect(mainPost).toBeDefined();
    const { links } = rewriteCrossSiteUrls(mainPost!.content, 1, mainPost!.id, network.sites, "subpath");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]!.targetSiteId).toBe(2);

    // Step 5: Generate Prisma schema
    const prisma = generateMultisitePrismaSchema(network.sites);
    expect(prisma).toContain("model Site");
    expect(prisma).toContain("model Post");
    expect(prisma).toContain("@@index([siteId, slug])");

    // Step 6: Generate scaffold
    const remotePatterns = subMedia.remotePatterns;
    const scaffold = generateMultisiteScaffold({ sites: network.sites, mode: "subpath", remotePatterns });
    expect(scaffold.length).toBeGreaterThan(5);
    expect(scaffold.find((f) => f.path === "middleware.ts")).toBeDefined();
    expect(scaffold.find((f) => f.path === "lib/tenant.ts")).toBeDefined();
  });
});
