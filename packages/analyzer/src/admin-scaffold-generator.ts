/**
 * Admin Page Scaffold Generator
 *
 * Generates React admin pages (Next.js App Router) from PHP template analysis.
 * Maps PHP admin templates to Next.js pages with Prisma ORM integration.
 */
import type { PhpFileAnalysis, InputParam } from "./php-analyzer.js";
import type { TableDefinition } from "./schema-to-prisma.js";

// ── Types ──

export type UiFramework = "plain" | "tailwind";

export interface AdminScaffoldOptions {
  uiFramework?: UiFramework;
}

export interface AdminPage {
  path: string;
  content: string;
  type: "list" | "form" | "detail" | "dashboard";
}

// ── Route mapping from PHP templates ──

interface RouteRule {
  pattern: RegExp;
  routeBuilder: (match: RegExpMatchArray) => string;
  type: AdminPage["type"];
}

const ROUTE_RULES: RouteRule[] = [
  // page-*-search-list.php → search page (list+form)
  {
    pattern: /^page-(\w+)-search-list\.php$/,
    routeBuilder: (m) => `app/(admin)/${pluralize(m[1]!)}/search/page.tsx`,
    type: "list",
  },
  // page-*-summary.php → summary/detail page
  {
    pattern: /^page-(\w+)-summary\.php$/,
    routeBuilder: (m) => `app/(admin)/${pluralize(m[1]!)}/summary/page.tsx`,
    type: "detail",
  },
  // page-*-slot.php → slots sub-page
  {
    pattern: /^page-(\w+)-slot\.php$/,
    routeBuilder: (m) => `app/(admin)/${pluralize(m[1]!)}s/[id]/slots/page.tsx`,
    type: "list",
  },
  // page-*-copy.php → copy page
  {
    pattern: /^page-(\w+)-copy\.php$/,
    routeBuilder: (m) => `app/(admin)/${pluralize(m[1]!)}s/[id]/copy/page.tsx`,
    type: "form",
  },
  // page-*-update.php → edit page
  {
    pattern: /^page-(\w+)-update\.php$/,
    routeBuilder: (m) => `app/(admin)/${pluralize(m[1]!)}s/[id]/page.tsx`,
    type: "form",
  },
  // page-*-list.php → list page
  {
    pattern: /^page-(\w+)-list\.php$/,
    routeBuilder: (m) => `app/(admin)/${pluralize(m[1]!)}s/page.tsx`,
    type: "list",
  },
  // page-new-*.php → new creation page
  {
    pattern: /^page-new-(\w+)\.php$/,
    routeBuilder: (m) => `app/(admin)/${pluralize(m[1]!)}s/new/page.tsx`,
    type: "form",
  },
  // page-*.php → new creation page (generic)
  {
    pattern: /^page-(\w+)\.php$/,
    routeBuilder: (m) => `app/(admin)/${pluralize(m[1]!)}s/new/page.tsx`,
    type: "form",
  },
];

// ── Helpers ──

function pluralize(word: string): string {
  // Simple pluralization: just ensure the word is suitable for URL paths
  // Remove trailing 's' duplication
  if (word.endsWith("s")) return word;
  return word;
}

function toPascalCase(name: string): string {
  return name
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function findTableForResource(
  resourceName: string,
  tables: TableDefinition[],
): TableDefinition | undefined {
  // Try exact match
  const exact = tables.find((t) => t.name === resourceName);
  if (exact) return exact;

  // Try singular form
  const singular = resourceName.replace(/s$/, "");
  const singularMatch = tables.find((t) => t.name === singular);
  if (singularMatch) return singularMatch;

  // Try with underscores
  const underscored = resourceName.replace(/-/g, "_");
  return tables.find((t) => t.name === underscored);
}

function mapPhpToRoute(
  fileName: string,
): { path: string; type: AdminPage["type"]; resource: string } | null {
  for (const rule of ROUTE_RULES) {
    const match = fileName.match(rule.pattern);
    if (match) {
      return {
        path: rule.routeBuilder(match),
        type: rule.type,
        resource: match[1]!,
      };
    }
  }
  return null;
}

function fieldTypeToInputType(prismaType: string): string {
  switch (prismaType) {
    case "Int":
    case "BigInt":
    case "Float":
      return "number";
    case "Boolean":
      return "checkbox";
    case "DateTime":
      return "datetime-local";
    default:
      return "text";
  }
}

function fieldLabel(name: string): string {
  // Convert snake_case to readable Japanese-friendly label
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Page generators ──

function generateListPage(
  resource: string,
  table: TableDefinition | undefined,
  analyses: PhpFileAnalysis[],
  fw: UiFramework,
): string {
  const modelName = toPascalCase(table?.name ?? resource);
  const camelModel = toCamelCase(table?.name ?? resource);
  const columns = table?.columns ?? [];
  const displayColumns = columns.slice(0, 8); // Show first 8 columns

  if (fw === "tailwind") {
    return `import { prisma } from "@/lib/db";
import Link from "next/link";

export default async function ${modelName}ListPage() {
  const items = await prisma.${camelModel}.findMany({
    orderBy: { id: "desc" },
    take: 100,
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">${modelName} 一覧</h1>
        <Link
          href="/${pluralize(resource)}s/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          新規作成
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-100">
${displayColumns.map((c) => `              <th className="px-4 py-3 text-left border-b-2 border-gray-200 text-sm">${c.comment ?? fieldLabel(c.name)}</th>`).join("\n")}
              <th className="px-4 py-3 text-left border-b-2 border-gray-200 text-sm">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-200">
${displayColumns.map((c) => `                <td className="px-4 py-3 text-sm">{String(item.${c.name} ?? "")}</td>`).join("\n")}
                <td className="px-4 py-3">
                  <Link
                    href={\`/${pluralize(resource)}s/\${item.id}\`}
                    className="text-blue-600 underline mr-2"
                  >
                    編集
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {items.length === 0 && (
        <p className="text-center py-12 text-gray-500">
          データがありません
        </p>
      )}
    </div>
  );
}
`;
  }

  return `import { prisma } from "@/lib/db";
import Link from "next/link";

export default async function ${modelName}ListPage() {
  const items = await prisma.${camelModel}.findMany({
    orderBy: { id: "desc" },
    take: 100,
  });

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "bold" }}>${modelName} 一覧</h1>
        <Link
          href="/${pluralize(resource)}s/new"
          style={{
            padding: "8px 16px",
            backgroundColor: "#2563eb",
            color: "white",
            borderRadius: "6px",
            textDecoration: "none",
          }}
        >
          新規作成
        </Link>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#f3f4f6" }}>
${displayColumns.map((c) => `              <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "2px solid #e5e7eb", fontSize: "14px" }}>${c.comment ?? fieldLabel(c.name)}</th>`).join("\n")}
              <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "2px solid #e5e7eb", fontSize: "14px" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
${displayColumns.map((c) => `                <td style={{ padding: "12px 16px", fontSize: "14px" }}>{String(item.${c.name} ?? "")}</td>`).join("\n")}
                <td style={{ padding: "12px 16px" }}>
                  <Link
                    href={\`/${pluralize(resource)}s/\${item.id}\`}
                    style={{ color: "#2563eb", textDecoration: "underline", marginRight: "8px" }}
                  >
                    編集
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {items.length === 0 && (
        <p style={{ textAlign: "center", padding: "48px", color: "#6b7280" }}>
          データがありません
        </p>
      )}
    </div>
  );
}
`;
}

function generateFormPage(
  resource: string,
  table: TableDefinition | undefined,
  analysis: PhpFileAnalysis | undefined,
  isEdit: boolean,
  fw: UiFramework,
): string {
  const modelName = toPascalCase(table?.name ?? resource);
  const camelModel = toCamelCase(table?.name ?? resource);

  // Determine form fields from PHP analysis input params or table columns
  const formFields: Array<{ name: string; type: string; label: string }> = [];

  if (analysis && analysis.inputParams.length > 0) {
    for (const param of analysis.inputParams) {
      if (param.source === "$_FILES") continue;
      if (param.name === "id" || param.name === "update" || param.name === "delete") continue;
      const col = table?.columns.find((c) => c.name === param.name);
      formFields.push({
        name: param.name.replace(/\[\]$/, ""),
        type: col ? fieldTypeToInputType(col.type) : "text",
        label: col?.comment ?? fieldLabel(param.name),
      });
    }
  } else if (table) {
    for (const col of table.columns) {
      if (col.isPrimary && col.isAutoIncrement) continue;
      formFields.push({
        name: col.name,
        type: fieldTypeToInputType(col.type),
        label: col.comment ?? fieldLabel(col.name),
      });
    }
  }

  const pageName = isEdit ? `${modelName}EditPage` : `${modelName}NewPage`;
  const pageTitle = isEdit ? `${modelName} 編集` : `${modelName} 新規作成`;
  const apiMethod = isEdit ? "PUT" : "POST";
  const apiUrl = isEdit
    ? `\`/api/${pluralize(resource)}s/\${id}\``
    : `"/api/${pluralize(resource)}s"`;

  const editFetch = isEdit
    ? `
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(\`/api/${pluralize(resource)}s/\${id}\`)
      .then((res) => res.json())
      .then((data) => {
        setForm(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);
`
    : "";

  const paramsLine = isEdit
    ? `\n  const params = useParams();\n  const id = params.id;`
    : "";

  const extraImports = isEdit ? ', useParams' : '';

  const jsxPreamble = `"use client";

import { useState${isEdit ? ", useEffect" : ""}${extraImports} } from "react";
import { useRouter } from "next/navigation";

export default function ${pageName}() {
  const router = useRouter();${paramsLine}
  const [form, setForm] = useState<Record<string, string | number | boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);${editFetch}

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(${apiUrl}, {
        method: "${apiMethod}",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "保存に失敗しました");
      }

      router.push("/${pluralize(resource)}s");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

`;

  if (fw === "tailwind") {
    return jsxPreamble + `  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">${pageTitle}</h1>

      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-md mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid gap-4 max-w-2xl">
${formFields
  .map(
    (f) => `          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              ${f.label}
            </label>
            <input
              type="${f.type}"
              value={String(form.${f.name} ?? "")}
              onChange={(e) => setForm({ ...form, ${f.name}: ${f.type === "number" ? "Number(e.target.value)" : f.type === "checkbox" ? "e.target.checked" : "e.target.value"} })}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>`,
  )
  .join("\n")}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "保存中..." : "保存"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-200"
          >
            キャンセル
          </button>
        </div>
      </form>
    </div>
  );
}
`;
  }

  return jsxPreamble + `  return (
    <div style={{ padding: "24px", maxWidth: "800px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "24px" }}>${pageTitle}</h1>

      {error && (
        <div style={{ padding: "12px", backgroundColor: "#fef2f2", color: "#dc2626", borderRadius: "6px", marginBottom: "16px" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
${formFields
  .map(
    (f) => `        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: "500", fontSize: "14px" }}>
            ${f.label}
          </label>
          <input
            type="${f.type}"
            value={String(form.${f.name} ?? "")}
            onChange={(e) => setForm({ ...form, ${f.name}: ${f.type === "number" ? "Number(e.target.value)" : f.type === "checkbox" ? "e.target.checked" : "e.target.value"} })}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
            }}
          />
        </div>`,
  )
  .join("\n")}

        <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "10px 24px",
              backgroundColor: submitting ? "#9ca3af" : "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: submitting ? "not-allowed" : "pointer",
              fontSize: "14px",
            }}
          >
            {submitting ? "保存中..." : "保存"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              padding: "10px 24px",
              backgroundColor: "#f3f4f6",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            キャンセル
          </button>
        </div>
      </form>
    </div>
  );
}
`;
}

function generateDetailPage(
  resource: string,
  table: TableDefinition | undefined,
  fw: UiFramework,
): string {
  const modelName = toPascalCase(table?.name ?? resource);
  const camelModel = toCamelCase(table?.name ?? resource);
  const columns = table?.columns ?? [];

  if (fw === "tailwind") {
    return `import { prisma } from "@/lib/db";

export default async function ${modelName}SummaryPage() {
  const items = await prisma.${camelModel}.findMany({
    orderBy: { id: "desc" },
    take: 50,
  });

  const total = await prisma.${camelModel}.count();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">${modelName} サマリー</h1>

      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <p className="text-sm text-gray-500">総件数</p>
        <p className="text-3xl font-bold text-blue-800">{total}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-100">
${columns.slice(0, 6).map((c) => `              <th className="px-4 py-3 text-left border-b-2 border-gray-200 text-sm">${c.comment ?? fieldLabel(c.name)}</th>`).join("\n")}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-200">
${columns.slice(0, 6).map((c) => `                <td className="px-4 py-3 text-sm">{String(item.${c.name} ?? "")}</td>`).join("\n")}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
`;
  }

  return `import { prisma } from "@/lib/db";

export default async function ${modelName}SummaryPage() {
  const items = await prisma.${camelModel}.findMany({
    orderBy: { id: "desc" },
    take: 50,
  });

  const total = await prisma.${camelModel}.count();

  return (
    <div style={{ padding: "24px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "24px" }}>${modelName} サマリー</h1>

      <div style={{ marginBottom: "24px", padding: "16px", backgroundColor: "#f0f9ff", borderRadius: "8px" }}>
        <p style={{ fontSize: "14px", color: "#6b7280" }}>総件数</p>
        <p style={{ fontSize: "32px", fontWeight: "bold", color: "#1e40af" }}>{total}</p>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#f3f4f6" }}>
${columns.slice(0, 6).map((c) => `              <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "2px solid #e5e7eb", fontSize: "14px" }}>${c.comment ?? fieldLabel(c.name)}</th>`).join("\n")}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
${columns.slice(0, 6).map((c) => `                <td style={{ padding: "12px 16px", fontSize: "14px" }}>{String(item.${c.name} ?? "")}</td>`).join("\n")}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
`;
}

function generateDashboardPage(tables: TableDefinition[], fw: UiFramework): string {
  const countQueries = tables
    .map(
      (t) =>
        `    prisma.${toCamelCase(t.name)}.count(),`,
    )
    .join("\n");

  const destructuring = tables.map((t, i) => `count${i}`).join(", ");

  if (fw === "tailwind") {
    const twCards = tables
      .map(
        (t, i) => `        <div key="${t.name}" className="p-6 bg-white rounded-lg shadow-sm">
          <p className="text-sm text-gray-500">${toPascalCase(t.name)}</p>
          <p className="text-3xl font-bold text-blue-800">{count${i}}</p>
        </div>`,
      )
      .join("\n");

    return `import { prisma } from "@/lib/db";

export default async function DashboardPage() {
  const [${destructuring}] = await Promise.all([
${countQueries}
  ]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">ダッシュボード</h1>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
${twCards}
      </div>
    </div>
  );
}
`;
  }

  const cards = tables
    .map(
      (t, i) => `        <div
          key="${t.name}"
          style={{
            padding: "24px",
            backgroundColor: "white",
            borderRadius: "8px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          <p style={{ fontSize: "14px", color: "#6b7280" }}>${toPascalCase(t.name)}</p>
          <p style={{ fontSize: "32px", fontWeight: "bold", color: "#1e40af" }}>{count${i}}</p>
        </div>`,
    )
    .join("\n");

  return `import { prisma } from "@/lib/db";

export default async function DashboardPage() {
  const [${destructuring}] = await Promise.all([
${countQueries}
  ]);

  return (
    <div style={{ padding: "24px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "24px" }}>ダッシュボード</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
${cards}
      </div>
    </div>
  );
}
`;
}

function generateAdminLayout(pages: AdminPage[], fw: UiFramework): string {
  // Derive menu items from list pages
  const menuItems: Array<{ label: string; href: string }> = [];

  // Dashboard
  menuItems.push({ label: "ダッシュボード", href: "/" });

  // Collect unique resource list pages
  const seen = new Set<string>();
  for (const page of pages) {
    if (page.type !== "list") continue;
    // Extract resource path from page path: app/(admin)/events/page.tsx -> /events
    const match = page.path.match(/app\/\(admin\)\/([^/]+)\/page\.tsx$/);
    if (match && !seen.has(match[1]!)) {
      seen.add(match[1]!);
      const resource = match[1]!;
      menuItems.push({
        label: toPascalCase(resource) + " 一覧",
        href: `/${resource}`,
      });
    }
  }

  if (fw === "tailwind") {
    const twMenuItems = menuItems
      .map(
        (item) => `            <a
              href="${item.href}"
              className="block px-4 py-2.5 text-gray-300 rounded-md text-sm hover:bg-gray-700 hover:text-white"
            >
              ${item.label}
            </a>`,
      )
      .join("\n");

    return `import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <nav className="w-60 bg-gray-800 text-white py-6 shrink-0">
        <div className="px-4 mb-8">
          <h2 className="text-lg font-bold">管理画面</h2>
        </div>
        <div className="flex flex-col gap-1">
${twMenuItems}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 bg-gray-50 overflow-auto">
        {children}
      </main>
    </div>
  );
}
`;
  }

  const menuItemsJsx = menuItems
    .map(
      (item) => `            <a
              href="${item.href}"
              style={{
                display: "block",
                padding: "10px 16px",
                color: "#d1d5db",
                textDecoration: "none",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            >
              ${item.label}
            </a>`,
    )
    .join("\n");

  return `import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <nav
        style={{
          width: "240px",
          backgroundColor: "#1f2937",
          color: "white",
          padding: "24px 0",
          flexShrink: 0,
        }}
      >
        <div style={{ padding: "0 16px", marginBottom: "32px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "bold" }}>管理画面</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
${menuItemsJsx}
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, backgroundColor: "#f9fafb", overflow: "auto" }}>
        {children}
      </main>
    </div>
  );
}
`;
}

// ── Public API ──

export function generateAdminScaffold(
  analyses: PhpFileAnalysis[],
  tables: TableDefinition[],
  options?: AdminScaffoldOptions,
): AdminPage[] {
  const fw: UiFramework = options?.uiFramework ?? "plain";
  const pages: AdminPage[] = [];
  const processedPaths = new Set<string>();

  // Group analyses by resource for finding related form analysis
  const analysisByFile = new Map<string, PhpFileAnalysis>();
  for (const a of analyses) {
    analysisByFile.set(a.fileName, a);
  }

  // Process each PHP template file
  for (const analysis of analyses) {
    const mapping = mapPhpToRoute(analysis.fileName);
    if (!mapping) continue;
    if (processedPaths.has(mapping.path)) continue;

    processedPaths.add(mapping.path);
    const table = findTableForResource(mapping.resource, tables);

    let content: string;
    switch (mapping.type) {
      case "list":
        content = generateListPage(mapping.resource, table, analyses, fw);
        break;
      case "form": {
        const isEdit = mapping.path.includes("[id]") && !mapping.path.includes("copy");
        content = generateFormPage(mapping.resource, table, analysis, isEdit, fw);
        break;
      }
      case "detail":
        content = generateDetailPage(mapping.resource, table, fw);
        break;
      default:
        continue;
    }

    pages.push({ path: mapping.path, content, type: mapping.type });
  }

  // Generate admin layout
  pages.push({
    path: "app/(admin)/layout.tsx",
    content: generateAdminLayout(pages, fw),
    type: "dashboard",
  });

  // Generate dashboard page
  pages.push({
    path: "app/(admin)/page.tsx",
    content: generateDashboardPage(tables, fw),
    type: "dashboard",
  });

  return pages;
}
