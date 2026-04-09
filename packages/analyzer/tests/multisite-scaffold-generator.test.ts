import { describe, it, expect } from "vitest";
import { generateMultisiteScaffold } from "../src/multisite-scaffold-generator.js";
import type { WpSite } from "@wp-transfer/core";

const sites: WpSite[] = [
  { siteId: 1, slug: "main", title: "Main Site", baseUrl: "https://example.com", networkUrl: "https://example.com", path: "/" },
  { siteId: 2, slug: "site2", title: "Sub Site", baseUrl: "https://example.com/site2", networkUrl: "https://example.com", path: "/site2" },
];

const remotePatterns = [{ protocol: "https", hostname: "example.com" }];

describe("generateMultisiteScaffold", () => {
  it("generates subpath scaffold with [site] dynamic route", () => {
    const files = generateMultisiteScaffold({ sites, mode: "subpath", remotePatterns });
    const paths = files.map((f) => f.path);
    expect(paths).toContain("middleware.ts");
    expect(paths).toContain("lib/tenant.ts");
    expect(paths).toContain("lib/prisma.ts");
    expect(paths).toContain("app/[site]/layout.tsx");
    expect(paths).toContain("app/[site]/page.tsx");
    expect(paths).toContain("app/[site]/blog/page.tsx");
    expect(paths).toContain("app/[site]/blog/[slug]/page.tsx");
    expect(paths).toContain("app/page.tsx");
    expect(paths).toContain("next.config.js");
  });

  it("generates subdomain scaffold without [site] route", () => {
    const files = generateMultisiteScaffold({ sites, mode: "subdomain", remotePatterns });
    const paths = files.map((f) => f.path);
    expect(paths).toContain("middleware.ts");
    expect(paths).toContain("lib/tenant.ts");
    expect(paths).toContain("app/layout.tsx");
    expect(paths).toContain("app/page.tsx");
    expect(paths).toContain("app/blog/page.tsx");
    expect(paths).toContain("app/blog/[slug]/page.tsx");
    expect(paths).not.toContain("app/[site]/layout.tsx");
  });

  it("subpath middleware resolves from path segment", () => {
    const files = generateMultisiteScaffold({ sites, mode: "subpath", remotePatterns });
    const mw = files.find((f) => f.path === "middleware.ts");
    expect(mw!.content).toContain("pathname");
    expect(mw!.content).toContain("slug");
  });

  it("subdomain middleware resolves from Host header", () => {
    const files = generateMultisiteScaffold({ sites, mode: "subdomain", remotePatterns });
    const mw = files.find((f) => f.path === "middleware.ts");
    expect(mw!.content).toContain("host");
  });

  it("tenant.ts uses Prisma Client Extensions for siteId scoping", () => {
    const files = generateMultisiteScaffold({ sites, mode: "subpath", remotePatterns });
    const tenant = files.find((f) => f.path === "lib/tenant.ts");
    expect(tenant!.content).toContain("$extends");
    expect(tenant!.content).toContain("siteId");
  });

  it("next.config.js includes remotePatterns", () => {
    const files = generateMultisiteScaffold({ sites, mode: "subpath", remotePatterns });
    const config = files.find((f) => f.path === "next.config.js");
    expect(config!.content).toContain("example.com");
  });

  it("subpath network top page lists all sites", () => {
    const files = generateMultisiteScaffold({ sites, mode: "subpath", remotePatterns });
    const top = files.find((f) => f.path === "app/page.tsx");
    expect(top!.content).toContain("Main Site");
    expect(top!.content).toContain("Sub Site");
  });
});
