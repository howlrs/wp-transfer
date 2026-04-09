import { describe, it, expect } from "vitest";
import { generateMultisitePrismaSchema } from "../src/multisite-prisma-generator.js";
import type { WpSite } from "@wp-transfer/core";

const sites: WpSite[] = [
  { siteId: 1, slug: "main", title: "Main", baseUrl: "https://example.com", networkUrl: "https://example.com", path: "/" },
  { siteId: 2, slug: "site2", title: "Sub", baseUrl: "https://example.com/site2", networkUrl: "https://example.com", path: "/site2" },
];

describe("generateMultisitePrismaSchema", () => {
  it("generates schema with Site, Post, User, UserSiteRole, Media models", () => {
    const schema = generateMultisitePrismaSchema(sites);
    expect(schema).toContain("model Site {");
    expect(schema).toContain("model Post {");
    expect(schema).toContain("model User {");
    expect(schema).toContain("model UserSiteRole {");
    expect(schema).toContain("model Media {");
  });

  it("includes siteId index on Post", () => {
    const schema = generateMultisitePrismaSchema(sites);
    expect(schema).toContain("@@index([siteId, slug])");
    expect(schema).toContain("@@index([siteId, type])");
  });

  it("includes unique constraint on UserSiteRole", () => {
    const schema = generateMultisitePrismaSchema(sites);
    expect(schema).toContain("@@unique([userId, siteId])");
  });

  it("includes Prisma datasource and generator blocks", () => {
    const schema = generateMultisitePrismaSchema(sites);
    expect(schema).toContain("datasource db {");
    expect(schema).toContain("generator client {");
  });

  it("includes Site slug as unique", () => {
    const schema = generateMultisitePrismaSchema(sites);
    expect(schema).toContain("slug        String          @unique");
  });
});
