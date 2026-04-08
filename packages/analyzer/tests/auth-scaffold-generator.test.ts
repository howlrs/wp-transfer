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

    it("generates all 10 auth files when auth plugin detected", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      expect(files.length).toBe(10);
    });

    it("generates lib/auth.ts with NextAuth config", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const authFile = findFile(files, "lib/auth.ts");

      expect(authFile).toBeDefined();
      expect(authFile!.content).toContain("NextAuth");
      expect(authFile!.content).toContain("CredentialsProvider");
      expect(authFile!.content).toContain("jwt");
      expect(authFile!.content).toContain("role");
    });

    it("generates lib/rbac.ts with role definitions", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const rbacFile = findFile(files, "lib/rbac.ts");

      expect(rbacFile).toBeDefined();
      expect(rbacFile!.content).toContain("administrator");
      expect(rbacFile!.content).toContain("editor");
      expect(rbacFile!.content).toContain("contributor");
      expect(rbacFile!.content).toContain("support_admin");
      expect(rbacFile!.content).toContain("filterMenuByRole");
      expect(rbacFile!.content).toContain("canAccess");
    });

    it("generates lib/providers.tsx with SessionProvider", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const providers = findFile(files, "lib/providers.tsx");

      expect(providers).toBeDefined();
      expect(providers!.content).toContain("SessionProvider");
      expect(providers!.content).toContain("use client");
    });

    it("generates middleware.ts with RBAC enforcement", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const middleware = findFile(files, "middleware.ts");

      expect(middleware).toBeDefined();
      expect(middleware!.content).toContain("canAccess");
      expect(middleware!.content).toContain("/login");
    });

    it("generates login page", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const loginPage = findFile(files, "app/login/page.tsx");

      expect(loginPage).toBeDefined();
      expect(loginPage!.content).toContain("ログイン");
      expect(loginPage!.content).toContain("signIn");
    });

    it("generates NextAuth route handler", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const route = findFile(files, "nextauth");

      expect(route).toBeDefined();
      expect(route!.content).toContain("handlers");
    });

    it("generates accounts API routes", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const accountsRoute = findFile(files, "api/accounts/route.ts");
      const accountIdRoute = findFile(files, "api/accounts/[id]/route.ts");

      expect(accountsRoute).toBeDefined();
      expect(accountsRoute!.content).toContain("GET");
      expect(accountsRoute!.content).toContain("POST");

      expect(accountIdRoute).toBeDefined();
      expect(accountIdRoute!.content).toContain("DELETE");
    });

    it("generates accounts management page", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const accountsPage = findFile(files, "accounts/page.tsx");

      expect(accountsPage).toBeDefined();
      expect(accountsPage!.content).toContain("アカウント管理");
    });

    it("generates fail-safe RBAC with default deny", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const rbac = files.find(f => f.path === "lib/rbac.ts");
      expect(rbac!.content).toContain("Default deny");
      expect(rbac!.content).toContain("PATH_PERMISSIONS");
    });

    it("generates middleware with API route protection", () => {
      const files = generateAuthScaffold(["wpfront-user-role-editor"]);
      const mw = files.find(f => f.path === "middleware.ts");
      expect(mw!.content).toContain("/api/");
      expect(mw!.content).toContain("403");
      expect(mw!.content).toContain("Forbidden");
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
