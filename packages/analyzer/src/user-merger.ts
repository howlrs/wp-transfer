import type { WpUser, WpPost, MergedUser, UserConflict } from "@wp-transfer/core";

interface SiteUserData {
  siteId: number;
  users: WpUser[];
  posts: WpPost[];
}

export interface UserMergeResult {
  sharedUsers: MergedUser[];
  userConflicts: UserConflict[];
}

export function mergeUsers(sites: SiteUserData[]): UserMergeResult {
  if (sites.length === 0) return { sharedUsers: [], userConflicts: [] };

  // Group users by dedupe key (email, fallback to login)
  const groups = new Map<string, { siteId: number; user: WpUser }[]>();
  for (const site of sites) {
    for (const user of site.users) {
      const key = user.email || user.login;
      if (!key) continue;
      const group = groups.get(key) || [];
      group.push({ siteId: site.siteId, user });
      groups.set(key, group);
    }
  }

  const sharedUsers: MergedUser[] = [];
  const userConflicts: UserConflict[] = [];
  let nextId = 1;

  for (const [, group] of groups) {
    // Sort by siteId to ensure deterministic priority (siteId=1 first)
    group.sort((a, b) => a.siteId - b.siteId);
    const primary = group[0]!;

    // Detect conflicts
    const names = new Set(group.map((g) => g.user.displayName));
    if (names.size > 1) {
      userConflicts.push({
        email: primary.user.email || primary.user.login,
        field: "displayName",
        values: group.map((g) => ({ siteId: g.siteId, value: g.user.displayName })),
        resolved: primary.user.displayName,
      });
    }

    const logins = new Set(group.map((g) => g.user.login));
    if (logins.size > 1) {
      userConflicts.push({
        email: primary.user.email || primary.user.login,
        field: "login",
        values: group.map((g) => ({ siteId: g.siteId, value: g.user.login })),
        resolved: primary.user.login,
      });
    }

    // Build site roles
    const siteIds = new Set(group.map((g) => g.siteId));
    const siteRoles = [...siteIds].map((siteId) => ({
      siteId,
      role: "contributor",
    }));

    sharedUsers.push({
      id: nextId++,
      email: primary.user.email,
      name: primary.user.displayName,
      login: primary.user.login,
      siteRoles,
    });
  }

  return { sharedUsers, userConflicts };
}
