/**
 * Auth Scaffold Generator
 *
 * Generates NextAuth v5 authentication files when auth/role plugins are detected.
 * Includes RBAC, login page, account management, and middleware.
 */

// ── Types ──

export interface AuthScaffoldFile {
  path: string;
  content: string;
}

// ── Auth plugin detection ──

const AUTH_PLUGIN_SLUGS = new Set([
  "wpfront-user-role-editor",
  "adminimize",
  "support-me",
  "user-role-editor",
  "members",
  "wp-user-avatar",
  "user-switching",
  "capability-manager-enhanced",
  "restrict-user-access",
  "advanced-access-manager",
]);

export function isAuthPluginDetected(plugins: string[]): boolean {
  return plugins.some(
    (slug) =>
      AUTH_PLUGIN_SLUGS.has(slug) ||
      slug.includes("auth") ||
      slug.includes("role") ||
      slug.includes("user") ||
      slug.includes("login") ||
      slug.includes("access"),
  );
}

// ── File generators ──

function generateAuthConfig(): string {
  return `import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "ユーザー名", type: "text" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const user = await prisma.adminUser.findUnique({
          where: {
            username: credentials.username as string,
          },
        });

        if (!user || !user.isActive) return null;

        // Check expiry
        if (user.expiresAt && user.expiresAt < new Date()) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password,
        );
        if (!valid) return null;

        return {
          id: String(user.id),
          name: user.name ?? user.username,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role: string }).role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});
`;
}

function generateRbac(): string {
  return `/**
 * Role-Based Access Control (RBAC)
 *
 * Roles mapped from WordPress user role plugins.
 */

export type Role = "administrator" | "editor" | "contributor" | "support_admin";

export const ROLES: Record<Role, { label: string; level: number }> = {
  administrator: { label: "管理者", level: 100 },
  editor: { label: "編集者", level: 50 },
  contributor: { label: "投稿者", level: 20 },
  support_admin: { label: "サポート管理者", level: 30 },
};

// IMPORTANT: Default deny — unregistered paths require administrator role
const PATH_PERMISSIONS: Record<string, number> = {
  "/": 0,                    // Dashboard — all roles
  "/events": 50,             // Event management — editor+
  "/information": 50,        // Information management — editor+
  "/lottery": 50,            // Lottery — editor+
  "/users": 100,             // User management — admin only
  "/accounts": 100,          // Account management — admin only
};

export interface MenuItem {
  label: string;
  href: string;
  minLevel: number;
}

/**
 * Filter menu items based on user role.
 */
export function filterMenuByRole(
  items: MenuItem[],
  role: Role,
): MenuItem[] {
  const level = ROLES[role]?.level ?? 0;
  return items.filter((item) => level >= item.minLevel);
}

/**
 * Check if a role can access a given path.
 */
export function canAccess(role: Role, path: string): boolean {
  const level = ROLES[role]?.level ?? 0;

  // Find the most specific matching path prefix
  let requiredLevel = 100; // Default: admin only (fail-safe)
  for (const [prefix, minLevel] of Object.entries(PATH_PERMISSIONS)) {
    if (path === prefix || path.startsWith(prefix + "/")) {
      requiredLevel = minLevel;
      break;
    }
  }

  return level >= requiredLevel;
}
`;
}

function generateProviders(): string {
  return `"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
`;
}

function generateMiddleware(): string {
  return `import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { canAccess } from "@/lib/rbac";
import type { Role } from "@/lib/rbac";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Public routes
  if (pathname === "/login" || pathname === "/unauthorized" || pathname.startsWith("/api/auth") || pathname === "/api/health") {
    return NextResponse.next();
  }

  // Check authentication
  if (!req.auth?.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // API routes also need RBAC
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth")) {
    const role = (req.auth.user as { role?: string }).role as Role | undefined;
    if (!role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Map API paths to their page equivalent for permission check
    // e.g., /api/events/123 -> /events
    const resourcePath = "/" + pathname.split("/").slice(2, 3).join("/");
    if (!canAccess(role, resourcePath)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // RBAC enforcement for page routes
  const role = (req.auth.user as { role?: string }).role as Role | undefined;
  if (role && !canAccess(role, pathname)) {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
`;
}

function generateLoginPage(): string {
  return `"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("ユーザー名またはパスワードが正しくありません");
      setLoading(false);
    } else {
      router.push(callbackUrl);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        backgroundColor: "#f3f4f6",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          padding: "32px",
          backgroundColor: "white",
          borderRadius: "8px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
        }}
      >
        <h1 style={{ fontSize: "24px", fontWeight: "bold", textAlign: "center", marginBottom: "24px" }}>
          ログイン
        </h1>

        {error && (
          <div
            style={{
              padding: "12px",
              backgroundColor: "#fef2f2",
              color: "#dc2626",
              borderRadius: "6px",
              marginBottom: "16px",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: "500", fontSize: "14px" }}>
              ユーザー名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: "500", fontSize: "14px" }}>
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: loading ? "#9ca3af" : "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "16px",
              fontWeight: "500",
            }}
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
`;
}

function generateNextAuthRoute(): string {
  return `import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
`;
}

function generateAccountsApiRoute(): string {
  return `import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "administrator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.adminUser.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "administrator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { username, password, name, role } = body;

  if (!username || !password) {
    return NextResponse.json(
      { error: "ユーザー名とパスワードは必須です" },
      { status: 400 },
    );
  }

  const existing = await prisma.adminUser.findUnique({
    where: { username },
  });
  if (existing) {
    return NextResponse.json(
      { error: "このユーザー名は既に使用されています" },
      { status: 409 },
    );
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.adminUser.create({
    data: {
      username,
      password: hashed,
      name: name ?? null,
      role: role ?? "editor",
    },
  });

  return NextResponse.json(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    { status: 201 },
  );
}
`;
}

function generateAccountIdApiRoute(): string {
  return `import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "administrator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id, 10);

  await prisma.adminUser.delete({
    where: { id: userId },
  });

  return NextResponse.json({ success: true });
}
`;
}

function generateUnauthorizedPage(): string {
  return `export default function UnauthorizedPage() {
  return (
    <div style={{ textAlign: "center", padding: "4rem" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>403 - アクセス権限がありません</h1>
      <p style={{ color: "#6b7280" }}>このページにアクセスする権限がありません。</p>
      <a href="/" style={{ color: "#2563eb" }}>ダッシュボードに戻る</a>
    </div>
  );
}
`;
}

function generateAccountsPage(): string {
  return `"use client";

import { useState, useEffect } from "react";

interface AdminUser {
  id: number;
  username: string;
  name: string | null;
  role: string;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export default function AccountsPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", name: "", role: "editor" });
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    const res = await fetch("/api/accounts");
    if (res.ok) {
      setUsers(await res.json());
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      setShowForm(false);
      setForm({ username: "", password: "", name: "", role: "editor" });
      loadUsers();
    } else {
      const data = await res.json();
      setError(data.error ?? "作成に失敗しました");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("このアカウントを削除しますか？")) return;

    const res = await fetch(\`/api/accounts/\${id}\`, { method: "DELETE" });
    if (res.ok) {
      loadUsers();
    }
  };

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "bold" }}>アカウント管理</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: "8px 16px",
            backgroundColor: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          {showForm ? "閉じる" : "新規作成"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "12px", backgroundColor: "#fef2f2", color: "#dc2626", borderRadius: "6px", marginBottom: "16px" }}>
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} style={{ marginBottom: "24px", padding: "16px", backgroundColor: "#f9fafb", borderRadius: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>ユーザー名</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>パスワード</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>名前</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>ロール</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}
              >
                <option value="administrator">管理者</option>
                <option value="editor">編集者</option>
                <option value="contributor">投稿者</option>
                <option value="support_admin">サポート管理者</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            style={{
              marginTop: "12px",
              padding: "8px 16px",
              backgroundColor: "#16a34a",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            作成
          </button>
        </form>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: "#f3f4f6" }}>
            <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>ID</th>
            <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>ユーザー名</th>
            <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>名前</th>
            <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>ロール</th>
            <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>状態</th>
            <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
              <td style={{ padding: "12px 16px" }}>{user.id}</td>
              <td style={{ padding: "12px 16px" }}>{user.username}</td>
              <td style={{ padding: "12px 16px" }}>{user.name ?? "-"}</td>
              <td style={{ padding: "12px 16px" }}>{user.role}</td>
              <td style={{ padding: "12px 16px" }}>
                <span style={{ color: user.isActive ? "#16a34a" : "#dc2626" }}>
                  {user.isActive ? "有効" : "無効"}
                </span>
              </td>
              <td style={{ padding: "12px 16px" }}>
                <button
                  onClick={() => handleDelete(user.id)}
                  style={{
                    padding: "4px 12px",
                    backgroundColor: "#dc2626",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
`;
}

// ── AdminUser Prisma model ──

export const ADMIN_USER_PRISMA_MODEL = `
model AdminUser {
  id        Int       @id @default(autoincrement())
  username  String    @unique
  password  String
  name      String?
  role      String    @default("editor")
  isActive  Boolean   @default(true)
  expiresAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@map("admin_user")
}`;

// ── Public API ──

export function generateAuthScaffold(plugins: string[]): AuthScaffoldFile[] {
  if (!isAuthPluginDetected(plugins)) {
    return [];
  }

  return [
    { path: "lib/auth.ts", content: generateAuthConfig() },
    { path: "lib/rbac.ts", content: generateRbac() },
    { path: "lib/providers.tsx", content: generateProviders() },
    { path: "middleware.ts", content: generateMiddleware() },
    { path: "app/login/page.tsx", content: generateLoginPage() },
    { path: "app/api/auth/[...nextauth]/route.ts", content: generateNextAuthRoute() },
    { path: "app/api/accounts/route.ts", content: generateAccountsApiRoute() },
    { path: "app/api/accounts/[id]/route.ts", content: generateAccountIdApiRoute() },
    { path: "app/(admin)/accounts/page.tsx", content: generateAccountsPage() },
    { path: "app/unauthorized/page.tsx", content: generateUnauthorizedPage() },
  ];
}
