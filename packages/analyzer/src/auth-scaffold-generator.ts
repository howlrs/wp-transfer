/**
 * Auth Scaffold Generator
 *
 * Generates NextAuth v5 authentication files when auth/role plugins are detected.
 * Includes RBAC, login page, user management, and middleware.
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
        const sessionUser = session.user as { id?: string; role?: string };
        sessionUser.id = token.sub;
        sessionUser.role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 15 * 60,
  },
  jwt: { maxAge: 15 * 60 },
});
`;
}

export interface AuthScaffoldOptions {
  /** Routes generated from the application's detected resources. */
  routeResources?: readonly string[];
  /** Generate the neutral authentication baseline when source detection is inconclusive. */
  force?: boolean;
}

function normalizedResourcePaths(resources: readonly string[]): string[] {
  return [...new Set(resources
    .map((resource) => resource.trim().replace(/^\/+|\/+$/g, ""))
    .filter((resource) => /^[a-z0-9][a-z0-9_-]*$/i.test(resource))
    .map((resource) => `/${resource}`))].sort();
}

/**
 * Static analysis discovers route names, not an authoritative authorization
 * policy. Every generated resource therefore defaults to administrator-only;
 * a later reviewed configuration may deliberately lower a specific route.
 */
function resourcePermissionLevel(_path: string): 100 {
  return 100;
}

function generateRbac(routeResources: readonly string[] = []): string {
  const resourcePermissions = normalizedResourcePaths(routeResources)
    .filter((path) => path !== "/admin-users")
    .map((path) => {
      const level = resourcePermissionLevel(path);
      return `  ${JSON.stringify(path)}: ${level}, // Administrator only until explicitly reviewed`;
    })
    .join("\n");

  return `/**
 * Role-Based Access Control (RBAC)
 *
 * Roles mapped from WordPress user role plugins.
 */

export type Role = "administrator" | "editor" | "author" | "contributor" | "subscriber";

export const ROLES: Record<Role, { label: string; level: number }> = {
  administrator: { label: "管理者", level: 100 },
  editor: { label: "編集者", level: 70 },
  author: { label: "投稿者", level: 40 },
  contributor: { label: "寄稿者", level: 20 },
  subscriber: { label: "購読者", level: 10 },
};

// IMPORTANT: Default deny — unregistered paths require administrator role
const PATH_PERMISSIONS: Record<string, number> = {
  "/": 0, // Dashboard — all authenticated users
  "/admin-users": 100, // Authentication user management — administrator only
${resourcePermissions}
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
  const level = ROLES[role]?.level;
  if (level === undefined) return false;

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
  return `import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { canAccess, type Role } from "@/lib/rbac";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes — no auth required
  if (
    pathname === "/login" ||
    pathname === "/unauthorized" ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/health"
  ) {
    return NextResponse.next();
  }

  // Check JWT token (edge-compatible, no Prisma dependency)
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // API routes use the same permission path as their corresponding page.
  const permissionPath = pathname.startsWith("/api/")
    ? pathname.slice(4) || "/"
    : pathname;
  const role = token.role as Role;

  if (!canAccess(role, permissionPath)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
`;
}

function generateLoginPage(): string {
  return `"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackParam = searchParams.get("callbackUrl");
  const callbackUrl = callbackParam?.startsWith("/") &&
    !callbackParam.startsWith("//") &&
    !callbackParam.includes("\\\\")
    ? callbackParam
    : "/";
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

function generateRequireActiveUser(): string {
  return `import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAccess, type Role } from "@/lib/rbac";

/**
 * Verify sessions against the database on every request. This rejects accounts
 * that were deleted, disabled, or expired after JWT issuance.
 */
export async function requireActiveUser() {
  const sessionUser = (await auth())?.user as { id?: string } | undefined;
  const id = sessionUser?.id;
  if (!id || !/^\\d+$/.test(id)) return null;

  const userId = Number(id);
  if (!Number.isSafeInteger(userId)) return null;

  const user = await prisma.adminUser.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true, expiresAt: true },
  });

  if (
    !user ||
    !user.isActive ||
    (user.expiresAt && user.expiresAt <= new Date())
  ) {
    return null;
  }

  return user;
}

/** Verify the current user's current database role can access a route. */
export async function requireActiveAccess(path: string) {
  const user = await requireActiveUser();
  if (!user || !canAccess(user.role as Role, path)) return null;
  return user;
}

/** Verify the current user is an active administrator in the database. */
export async function requireActiveAdministrator() {
  const user = await requireActiveUser();
  return user?.role === "administrator" ? user : null;
}
`;
}

function generateProtectedResourceLayout(path: string): string {
  return `import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireActiveAccess } from "@/lib/require-active-user";

export default async function ProtectedResourceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireActiveAccess(${JSON.stringify(path)});
  if (!user) redirect("/unauthorized");
  return children;
}
`;
}

function generateUsersApiRoute(): string {
  return `import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveAdministrator } from "@/lib/require-active-user";
import bcrypt from "bcryptjs";

export async function GET() {
  const administrator = await requireActiveAdministrator();
  if (!administrator) {
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
  const administrator = await requireActiveAdministrator();
  if (!administrator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON形式が正しくありません" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "入力形式が正しくありません" }, { status: 400 });
  }

  const { username, password, name, role } = body as Record<string, unknown>;
  const allowedRoles = new Set([
    "administrator",
    "editor",
    "author",
    "contributor",
    "subscriber",
  ]);

  if (typeof username !== "string" || !/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
    return NextResponse.json(
      { error: "ユーザー名は3〜64文字の英数字、ピリオド、ハイフン、アンダースコアで指定してください" },
      { status: 400 },
    );
  }

  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    return NextResponse.json(
      { error: "パスワードは12〜128文字で指定してください" },
      { status: 400 },
    );
  }

  if (role !== undefined && (typeof role !== "string" || !allowedRoles.has(role))) {
    return NextResponse.json({ error: "無効なロールです" }, { status: 400 });
  }

  if (name !== undefined && name !== null && (typeof name !== "string" || name.length > 120)) {
    return NextResponse.json({ error: "名前は120文字以内で指定してください" }, { status: 400 });
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
      name: typeof name === "string" ? name.trim() || null : null,
      role: typeof role === "string" ? role : "editor",
    },
  });

  return NextResponse.json(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    { status: 201 },
  );
}
`;
}

function generateUserIdApiRoute(): string {
  return `import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveAdministrator } from "@/lib/require-active-user";

type DeleteResult = "deleted" | "not-found" | "last-active-administrator";

function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

async function deleteUserAtomically(userId: number): Promise<DeleteResult> {
  // Serializable transactions make the administrator-count invariant safe on
  // both MySQL and PostgreSQL. Prisma reports serialization/deadlock conflicts
  // as P2034, which must be retried before deciding whether deletion is allowed.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const target = await tx.adminUser.findUnique({
          where: { id: userId },
          select: { role: true, isActive: true },
        });
        if (!target) return "not-found";

        if (target.role === "administrator" && target.isActive) {
          const activeAdministrators = await tx.adminUser.count({
            where: { role: "administrator", isActive: true },
          });
          if (activeAdministrators <= 1) return "last-active-administrator";
        }

        await tx.adminUser.delete({ where: { id: userId } });
        return "deleted";
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const code = prismaErrorCode(error);
      if (code === "P2025") return "not-found";
      if (code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }

  throw new Error("Unreachable transaction retry state");
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const administrator = await requireActiveAdministrator();
  if (!administrator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!/^\\d+$/.test(id)) {
    return NextResponse.json({ error: "無効なユーザーIDです" }, { status: 400 });
  }

  const userId = Number(id);
  if (!Number.isSafeInteger(userId)) {
    return NextResponse.json({ error: "無効なユーザーIDです" }, { status: 400 });
  }
  if (administrator.id === userId) {
    return NextResponse.json({ error: "自分自身は削除できません" }, { status: 409 });
  }

  const result = await deleteUserAtomically(userId);
  if (result === "not-found") {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  }
  if (result === "last-active-administrator") {
    return NextResponse.json(
      { error: "最後の有効な管理者は削除できません" },
      { status: 409 },
    );
  }

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

function generateUsersPage(): string {
  return `"use client";

import { useState, useEffect } from "react";

interface AppUser {
  id: number;
  username: string;
  name: string | null;
  role: string;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", name: "", role: "editor" });
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    const res = await fetch("/api/admin-users");
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

    const res = await fetch("/api/admin-users", {
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
    if (!confirm("このユーザーを削除しますか？")) return;

    const res = await fetch(\`/api/admin-users/\${id}\`, { method: "DELETE" });
    if (res.ok) {
      loadUsers();
    }
  };

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "bold" }}>ユーザー管理</h1>
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
                <option value="author">投稿者</option>
                <option value="contributor">寄稿者</option>
                <option value="subscriber">購読者</option>
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

export function generateAuthScaffold(
  plugins: string[],
  options: AuthScaffoldOptions = {},
): AuthScaffoldFile[] {
  if (!options.force && !isAuthPluginDetected(plugins)) {
    return [];
  }

  const protectedResourcePaths = [...new Set([
    "/admin-users",
    ...normalizedResourcePaths(options.routeResources ?? []),
  ])].sort();

  return [
    { path: "lib/auth.ts", content: generateAuthConfig() },
    { path: "lib/rbac.ts", content: generateRbac(options.routeResources) },
    { path: "lib/providers.tsx", content: generateProviders() },
    { path: "middleware.ts", content: generateMiddleware() },
    { path: "app/login/page.tsx", content: generateLoginPage() },
    { path: "app/api/auth/[...nextauth]/route.ts", content: generateNextAuthRoute() },
    { path: "lib/require-active-user.ts", content: generateRequireActiveUser() },
    { path: "app/api/admin-users/route.ts", content: generateUsersApiRoute() },
    { path: "app/api/admin-users/[id]/route.ts", content: generateUserIdApiRoute() },
    { path: "app/(admin)/admin-users/page.tsx", content: generateUsersPage() },
    ...protectedResourcePaths.map((path) => ({
      path: `app/(admin)${path}/layout.tsx`,
      content: generateProtectedResourceLayout(path),
    })),
    { path: "app/unauthorized/page.tsx", content: generateUnauthorizedPage() },
  ];
}
