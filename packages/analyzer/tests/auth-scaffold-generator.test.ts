import { describe, it, expect } from "vitest";
import {
  generateAuthScaffold,
  isAuthPluginDetected,
  ADMIN_USER_PRISMA_MODEL,
} from "../src/auth-scaffold-generator.js";
import type { AuthScaffoldFile } from "../src/auth-scaffold-generator.js";

// ── Helpers ──

function findFile(files: AuthScaffoldFile[], pathPattern: string): AuthScaffoldFile | undefined {
  return files.find((f) => f.path.includes(pathPattern));
}

// ── Tests ──

describe("Auth Scaffold Generator", () => {
  describe("plugin detection", () => {
    it("detects wpfront-user-role-editor as auth plugin", () => {
      expect(isAuthPluginDetected(["wpfront-user-role-editor"])).toBe(true);
    });

    it("detects adminimize as auth plugin", () => {
      expect(isAuthPluginDetected(["adminimize"])).toBe(true);
    });

    it("detects plugins containing 'auth' in slug", () => {
      expect(isAuthPluginDetected(["custom-auth-plugin"])).toBe(true);
    });

    it("detects plugins containing 'role' in slug", () => {
      expect(isAuthPluginDetected(["my-role-manager"])).toBe(true);
    });

    it("returns false for non-auth plugins", () => {
      expect(isAuthPluginDetected(["contact-form-7", "yoast-seo"])).toBe(false);
    });

    it("returns false for empty plugin list", () => {
      expect(isAuthPluginDetected([])).toBe(false);
    });
  });

  describe("file generation", () => {
    it("returns empty array when no auth plugins detected", () => {
      const files = generateAuthScaffold(["contact-form-7"]);
      expect(files).toHaveLength(0);
    });

    it("generates a neutral baseline when explicitly forced", () => {
      const files = generateAuthScaffold([], { force: true });
      expect(files.map((file) => file.path)).toContain("middleware.ts");
      expect(files.map((file) => file.path)).toContain("lib/auth.ts");
    });

    it("generates all 12 auth files when auth plugin detected", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      expect(files.length).toBe(12);
    });

    it("generates lib/auth.ts with NextAuth config", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const authFile = findFile(files, "lib/auth.ts");

      expect(authFile).toBeDefined();
      expect(authFile!.content).toContain("NextAuth");
      expect(authFile!.content).toContain("CredentialsProvider");
      expect(authFile!.content).toContain("jwt");
      expect(authFile!.content).toContain("role");
      expect(authFile!.content).toContain("sessionUser.id = token.sub");
      expect(authFile!.content).toContain("maxAge: 15 * 60");
    });

    it("generates lib/rbac.ts with WordPress standard role definitions", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const rbacFile = findFile(files, "lib/rbac.ts");

      expect(rbacFile).toBeDefined();
      expect(rbacFile!.content).toContain("administrator");
      expect(rbacFile!.content).toContain("editor");
      expect(rbacFile!.content).toContain("author");
      expect(rbacFile!.content).toContain("contributor");
      expect(rbacFile!.content).toContain("subscriber");
      expect(rbacFile!.content).toContain("filterMenuByRole");
      expect(rbacFile!.content).toContain("canAccess");
      expect(rbacFile!.content).toContain("if (level === undefined) return false");
    });

    it("generates lib/providers.tsx with SessionProvider", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const providers = findFile(files, "lib/providers.tsx");

      expect(providers).toBeDefined();
      expect(providers!.content).toContain("SessionProvider");
      expect(providers!.content).toContain("use client");
    });

    it("generates middleware.ts with JWT auth check", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const middleware = findFile(files, "middleware.ts");

      expect(middleware).toBeDefined();
      expect(middleware!.content).toContain("getToken");
      expect(middleware!.content).toContain("/login");
    });

    it("generates login page", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const loginPage = findFile(files, "app/login/page.tsx");

      expect(loginPage).toBeDefined();
      expect(loginPage!.content).toContain("ログイン");
      expect(loginPage!.content).toContain("signIn");
      expect(loginPage!.content).toContain('callbackParam?.startsWith("/")');
      expect(loginPage!.content).toContain('!callbackParam.startsWith("//")');
      expect(loginPage!.content).toContain('!callbackParam.includes("\\\\")');
    });

    it("generates NextAuth route handler", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const route = findFile(files, "nextauth");

      expect(route).toBeDefined();
      expect(route!.content).toContain("handlers");
    });

    it("generates generic user management API routes", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const usersRoute = findFile(files, "api/admin-users/route.ts");
      const userIdRoute = findFile(files, "api/admin-users/[id]/route.ts");

      expect(usersRoute).toBeDefined();
      expect(usersRoute!.content).toContain("GET");
      expect(usersRoute!.content).toContain("POST");
      expect(usersRoute!.content).toContain("allowedRoles");
      expect(usersRoute!.content).toContain("requireActiveAdministrator");
      expect(usersRoute!.content).toContain('"subscriber"');
      expect(usersRoute!.content).toContain("JSON形式が正しくありません");
      expect(usersRoute!.content).toContain("/^[A-Za-z0-9._-]{3,64}$/");
      expect(usersRoute!.content).toContain("password.length < 12");
      expect(usersRoute!.content).toContain('typeof role !== "string"');

      expect(userIdRoute).toBeDefined();
      expect(userIdRoute!.content).toContain("DELETE");
      expect(userIdRoute!.content).toContain("administrator.id === userId");
      expect(userIdRoute!.content).toContain('result === "not-found"');
      expect(userIdRoute!.content).toContain("最後の有効な管理者は削除できません");
    });

    it("uses a serializable transaction with retry to preserve an active administrator", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const userIdRoute = findFile(files, "api/admin-users/[id]/route.ts");

      expect(userIdRoute).toBeDefined();
      expect(userIdRoute!.content).toContain("deleteUserAtomically");
      expect(userIdRoute!.content).toContain("prisma.$transaction");
      expect(userIdRoute!.content).toContain('isolationLevel: "Serializable"');
      expect(userIdRoute!.content).toContain("tx.adminUser.count");
      expect(userIdRoute!.content).toContain("activeAdministrators <= 1");
      expect(userIdRoute!.content).toContain('code === "P2034" && attempt < 2');
      expect(userIdRoute!.content).toContain('code === "P2025"');
    });

    it("generates generic user management page", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const usersPage = findFile(files, "admin-users/page.tsx");

      expect(usersPage).toBeDefined();
      expect(usersPage!.content).toContain("ユーザー管理");
      expect(usersPage!.content).toContain('value="author"');
      expect(usersPage!.content).toContain('value="subscriber"');
    });

    it("generates database-backed user and access guards", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const guard = findFile(files, "require-active-user.ts");

      expect(guard).toBeDefined();
      expect(guard!.content).toContain("requireActiveUser");
      expect(guard!.content).toContain("requireActiveAccess");
      expect(guard!.content).toContain("requireActiveAdministrator");
      expect(guard!.content).toContain("isActive");
      expect(guard!.content).toContain("expiresAt");
      expect(guard!.content).toContain('user?.role === "administrator"');
      expect(guard!.content).toContain("canAccess(user.role as Role, path)");
      expect(guard!.content).toContain("Number.isSafeInteger");
    });

    it("generates fail-safe RBAC with default deny", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const rbac = files.find(f => f.path === "lib/rbac.ts");
      expect(rbac!.content).toContain("Default deny");
      expect(rbac!.content).toContain("PATH_PERMISSIONS");
    });

    it("fails closed for ordinary, opaque, and sensitive generated resources", () => {
      const files = generateAuthScaffold(
        ["wpfront-user-role-editor"],
        {
          routeResources: [
            "articles", "media_items", "records_x9", "users", "user", "accounts", "roles",
            "permissions", "billing", "payments", "orders", "customers", "staff", "transactions",
            "api-keys", "invalid route",
          ],
        },
      );
      const rbac = files.find((file) => file.path === "lib/rbac.ts");
      const middleware = files.find((file) => file.path === "middleware.ts");
      const activeGuard = files.find((file) => file.path === "lib/require-active-user.ts");

      expect(rbac!.content).toContain('"/articles": 100');
      expect(rbac!.content).toContain('"/media_items": 100');
      expect(rbac!.content).toContain('"/records_x9": 100');
      expect(rbac!.content).toContain('"/users": 100');
      expect(rbac!.content).toContain('"/user": 100');
      expect(rbac!.content).toContain('"/accounts": 100');
      expect(rbac!.content).toContain('"/roles": 100');
      expect(rbac!.content).toContain('"/permissions": 100');
      expect(rbac!.content).toContain('"/billing": 100');
      expect(rbac!.content).toContain('"/payments": 100');
      expect(rbac!.content).toContain('"/orders": 100');
      expect(rbac!.content).toContain('"/customers": 100');
      expect(rbac!.content).toContain('"/staff": 100');
      expect(rbac!.content).toContain('"/transactions": 100');
      expect(rbac!.content).toContain('"/api-keys": 100');
      expect(rbac!.content).toContain('"/admin-users": 100');
      expect(rbac!.content).not.toContain('"/invalid route"');
      // Both edge middleware and DB-backed server guards defer to this same
      // generated policy for resource API reads, writes, and deletes.
      expect(middleware!.content).toContain("canAccess(role, permissionPath)");
      expect(activeGuard!.content).toContain("canAccess(user.role as Role, path)");
    });

    it("generates one protected layout per valid resource and the users route", () => {
      const files = generateAuthScaffold(
        ["wpfront-user-role-editor"],
        { routeResources: ["articles", "/media_items/", "articles", "bad route"] },
      );
      const layouts = files.filter((file) => file.path.endsWith("/layout.tsx"));

      expect(layouts.map((file) => file.path)).toEqual([
        "app/(admin)/admin-users/layout.tsx",
        "app/(admin)/articles/layout.tsx",
        "app/(admin)/media_items/layout.tsx",
      ]);
      expect(layouts.every((file) => file.content.includes("requireActiveAccess"))).toBe(true);
      expect(layouts.every((file) => file.content.includes('redirect("/unauthorized")'))).toBe(true);
    });

    it("keeps a domain users resource separate from reserved authentication management", () => {
      const files = generateAuthScaffold(
        ["wpfront-user-role-editor"],
        { routeResources: ["users"] },
      );
      const paths = files.map((file) => file.path);

      expect(paths).toContain("app/(admin)/users/layout.tsx");
      expect(paths).toContain("app/(admin)/admin-users/page.tsx");
      expect(paths).toContain("app/api/admin-users/route.ts");
      expect(paths).not.toContain("app/(admin)/users/page.tsx");
      expect(paths).not.toContain("app/api/users/route.ts");
      expect(new Set(paths).size).toBe(paths.length);
    });

    it("generates middleware with API 401 for unauthenticated", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const mw = files.find(f => f.path === "middleware.ts");
      expect(mw!.content).toContain("/api/");
      expect(mw!.content).toContain("401");
      expect(mw!.content).toContain("Unauthorized");
    });

    it("enforces RBAC and normalizes API paths before checking permissions", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const mw = files.find((file) => file.path === "middleware.ts");

      expect(mw!.content).toContain('import { canAccess, type Role } from "@/lib/rbac"');
      expect(mw!.content).toContain('pathname.slice(4) || "/"');
      expect(mw!.content).toContain("canAccess(role, permissionPath)");
      expect(mw!.content).toContain('{ error: "Forbidden" }, { status: 403 }');
      expect(mw!.content).toContain('new URL("/unauthorized", req.url)');
    });

    it("generates unauthorized page", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const unauth = files.find(f => f.path === "app/unauthorized/page.tsx");
      expect(unauth).toBeDefined();
      expect(unauth!.content).toContain("403");
    });

    it("redirects to /unauthorized instead of /", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const mw = files.find(f => f.path === "middleware.ts");
      expect(mw!.content).toContain("/unauthorized");
      expect(mw!.content).not.toMatch(/redirect\(new URL\("\/",/);
    });

    it("includes /api/health in public routes", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const mw = files.find(f => f.path === "middleware.ts");
      expect(mw!.content).toContain("/api/health");
    });
  });

  describe("AdminUser Prisma model", () => {
    it("contains AdminUser model definition", () => {
      expect(ADMIN_USER_PRISMA_MODEL).toContain("model AdminUser");
      expect(ADMIN_USER_PRISMA_MODEL).toContain("username");
      expect(ADMIN_USER_PRISMA_MODEL).toContain("password");
      expect(ADMIN_USER_PRISMA_MODEL).toContain("role");
      expect(ADMIN_USER_PRISMA_MODEL).toContain("isActive");
      expect(ADMIN_USER_PRISMA_MODEL).toContain('@@map("admin_user")');
    });
  });
});
