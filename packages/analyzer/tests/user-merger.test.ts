import { describe, it, expect } from "vitest";
import { mergeUsers } from "../src/user-merger.js";
import type { WpUser, WpPost } from "@wp-transfer/core";

function makeUser(overrides: Partial<WpUser>): WpUser {
  return { id: 1, login: "user", email: "user@example.com", displayName: "User", role: "", registered: "2024-01-01", ...overrides };
}

function makePost(overrides: Partial<WpPost>): WpPost {
  return {
    id: 1, title: "Post", slug: "post", status: "publish", type: "post",
    content: "", excerpt: "", date: "2024-01-01", modified: "2024-01-01",
    author: 1, meta: {}, ...overrides,
  };
}

describe("mergeUsers", () => {
  it("deduplicates users by email across sites", () => {
    const sites = [
      { siteId: 1, users: [makeUser({ email: "admin@example.com", displayName: "Admin" })], posts: [] },
      { siteId: 2, users: [makeUser({ email: "admin@example.com", displayName: "Administrator" })], posts: [] },
    ];

    const result = mergeUsers(sites);

    expect(result.sharedUsers).toHaveLength(1);
    expect(result.sharedUsers[0]!.email).toBe("admin@example.com");
    expect(result.sharedUsers[0]!.name).toBe("Admin"); // Main site (siteId=1) takes priority
  });

  it("reports name conflicts", () => {
    const sites = [
      { siteId: 1, users: [makeUser({ email: "admin@example.com", displayName: "Admin" })], posts: [] },
      { siteId: 2, users: [makeUser({ email: "admin@example.com", displayName: "Administrator" })], posts: [] },
    ];

    const result = mergeUsers(sites);

    expect(result.userConflicts).toHaveLength(1);
    expect(result.userConflicts[0]!.field).toBe("displayName");
    expect(result.userConflicts[0]!.resolved).toBe("Admin");
  });

  it("assigns site roles based on post authorship", () => {
    const sites = [
      {
        siteId: 1,
        users: [makeUser({ id: 1, email: "admin@example.com" })],
        posts: [makePost({ author: 1 })],
      },
      {
        siteId: 2,
        users: [makeUser({ id: 1, email: "admin@example.com" })],
        posts: [],
      },
    ];

    const result = mergeUsers(sites);
    const admin = result.sharedUsers[0]!;
    expect(admin.siteRoles).toContainEqual({ siteId: 1, role: "contributor" });
    expect(admin.siteRoles).toContainEqual({ siteId: 2, role: "contributor" });
  });

  it("falls back to login when email is empty", () => {
    const sites = [
      { siteId: 1, users: [makeUser({ email: "", login: "shared-user", displayName: "A" })], posts: [] },
      { siteId: 2, users: [makeUser({ email: "", login: "shared-user", displayName: "B" })], posts: [] },
    ];

    const result = mergeUsers(sites);
    expect(result.sharedUsers).toHaveLength(1);
    expect(result.sharedUsers[0]!.name).toBe("A"); // siteId=1 priority
  });

  it("keeps unique users separate", () => {
    const sites = [
      { siteId: 1, users: [makeUser({ email: "a@example.com" })], posts: [] },
      { siteId: 2, users: [makeUser({ email: "b@example.com" })], posts: [] },
    ];

    const result = mergeUsers(sites);
    expect(result.sharedUsers).toHaveLength(2);
    expect(result.userConflicts).toHaveLength(0);
  });

  it("handles empty input", () => {
    const result = mergeUsers([]);
    expect(result.sharedUsers).toHaveLength(0);
    expect(result.userConflicts).toHaveLength(0);
  });
});
