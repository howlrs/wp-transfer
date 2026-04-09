/**
 * Multisite Scaffold Generator
 *
 * Generates a multi-tenant Next.js App Router scaffold from multisite WP network data.
 * Supports two routing strategies: subpath (/[site]/...) and subdomain (site.example.com).
 */

import type { WpSite } from "@wp-transfer/core";
import type { ScaffoldFile } from "./blog-scaffold-generator.js";
import { escapeForStringLiteral } from "./sanitize.js";

// ── Types ──

interface RemotePattern {
  protocol: string;
  hostname: string;
}

export interface MultisiteScaffoldInput {
  sites: WpSite[];
  mode: "subpath" | "subdomain";
  remotePatterns: RemotePattern[];
}

// ── Entry point ──

export function generateMultisiteScaffold(input: MultisiteScaffoldInput): ScaffoldFile[] {
  return input.mode === "subpath"
    ? generateSubpathScaffold(input)
    : generateSubdomainScaffold(input);
}

// ── Subpath mode ──

function generateSubpathScaffold(input: MultisiteScaffoldInput): ScaffoldFile[] {
  const { sites, remotePatterns } = input;
  return [
    { path: "middleware.ts", content: generateSubpathMiddleware(sites) },
    { path: "lib/prisma.ts", content: generatePrismaClient() },
    { path: "lib/tenant.ts", content: generateTenantLib(sites) },
    { path: "next.config.js", content: generateNextConfig(remotePatterns) },
    { path: "app/page.tsx", content: generateSubpathNetworkTopPage(sites) },
    { path: "app/[site]/layout.tsx", content: generateSubpathSiteLayout() },
    { path: "app/[site]/page.tsx", content: generateSubpathSitePage() },
    { path: "app/[site]/blog/page.tsx", content: generateSubpathBlogListPage() },
    { path: "app/[site]/blog/[slug]/page.tsx", content: generateSubpathBlogPostPage() },
  ];
}

// ── Subdomain mode ──

function generateSubdomainScaffold(input: MultisiteScaffoldInput): ScaffoldFile[] {
  const { sites, remotePatterns } = input;
  return [
    { path: "middleware.ts", content: generateSubdomainMiddleware(sites) },
    { path: "lib/prisma.ts", content: generatePrismaClient() },
    { path: "lib/tenant.ts", content: generateTenantLib(sites) },
    { path: "next.config.js", content: generateNextConfig(remotePatterns) },
    { path: "app/layout.tsx", content: generateSubdomainRootLayout() },
    { path: "app/page.tsx", content: generateSubdomainHomePage() },
    { path: "app/blog/page.tsx", content: generateSubdomainBlogListPage() },
    { path: "app/blog/[slug]/page.tsx", content: generateSubdomainBlogPostPage() },
  ];
}

// ── middleware.ts generators ──

function generateSubpathMiddleware(sites: WpSite[]): string {
  const slugMap = sites.map((s) => `  "${escapeForStringLiteral(s.slug)}": ${s.siteId},`).join("\n");
  return `import { NextRequest, NextResponse } from "next/server";

const slugToSiteId: Record<string, number> = {
${slugMap}
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip Next.js internals and static files
  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname.includes(".")) {
    return NextResponse.next();
  }

  const segments = pathname.split("/").filter(Boolean);
  const slug = segments[0] ?? "main";
  const siteId = slugToSiteId[slug];

  if (siteId === undefined) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.headers.set("x-site-id", String(siteId));
  response.headers.set("x-site-slug", slug);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
`;
}

function generateSubdomainMiddleware(sites: WpSite[]): string {
  const subdomainMap = sites
    .filter((s) => s.subdomain)
    .map((s) => `  "${escapeForStringLiteral(s.subdomain!)}": ${s.siteId},`)
    .join("\n");
  const slugMap = sites.map((s) => `  "${escapeForStringLiteral(s.slug)}": ${s.siteId},`).join("\n");
  return `import { NextRequest, NextResponse } from "next/server";

const subdomainToSiteId: Record<string, number> = {
${subdomainMap}
};

const slugToSiteId: Record<string, number> = {
${slugMap}
};

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const subdomain = host.split(".")[0] ?? "";
  const siteId = subdomainToSiteId[subdomain] ?? slugToSiteId[subdomain];

  if (siteId === undefined) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.headers.set("x-site-id", String(siteId));
  response.headers.set("x-site-slug", subdomain);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
`;
}

// ── lib/prisma.ts ──

function generatePrismaClient(): string {
  return `import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
`;
}

// ── lib/tenant.ts ──

function generateTenantLib(sites: WpSite[]): string {
  const siteEntries = sites
    .map((s) => `  { siteId: ${s.siteId}, slug: "${escapeForStringLiteral(s.slug)}", title: "${escapeForStringLiteral(s.title)}" },`)
    .join("\n");
  return `import { prisma } from "./prisma.js";

export const SITES = [
${siteEntries}
] as const;

export type SiteSlug = (typeof SITES)[number]["slug"];

export function getSiteBySlug(slug: string) {
  return SITES.find((s) => s.slug === slug) ?? null;
}

export function getSiteById(siteId: number) {
  return SITES.find((s) => s.siteId === siteId) ?? null;
}

/**
 * Returns a Prisma client scoped to a specific siteId using Client Extensions.
 * All queries on models that have a \`siteId\` field will be automatically filtered.
 */
export function getTenantClient(siteId: number) {
  return prisma.$extends({
    query: {
      $allModels: {
        async findMany({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
          args.where = { ...((args.where as Record<string, unknown>) ?? {}), siteId };
          return query(args);
        },
        async findFirst({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
          args.where = { ...((args.where as Record<string, unknown>) ?? {}), siteId };
          return query(args);
        },
        async create({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
          const data = args.data as Record<string, unknown>;
          args.data = { ...data, siteId };
          return query(args);
        },
      },
    },
  });
}
`;
}

// ── next.config.js ──

function generateNextConfig(remotePatterns: RemotePattern[]): string {
  const patterns = remotePatterns
    .map((p) => `    { protocol: "${escapeForStringLiteral(p.protocol)}", hostname: "${escapeForStringLiteral(p.hostname)}" },`)
    .join("\n");
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
${patterns}
    ],
  },
};

module.exports = nextConfig;
`;
}

// ── Subpath app files ──

function generateSubpathNetworkTopPage(sites: WpSite[]): string {
  const siteLinks = sites
    .map((s) => `        <li key={${s.siteId}}><a href="/${escapeForStringLiteral(s.slug)}">${escapeForStringLiteral(s.title)}</a></li>`)
    .join("\n");
  return `export default function NetworkTopPage() {
  return (
    <main>
      <h1>Network Sites</h1>
      <ul>
${siteLinks}
      </ul>
    </main>
  );
}
`;
}

function generateSubpathSiteLayout(): string {
  return `import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  params: { site: string };
}

export default function SiteLayout({ children, params }: Props) {
  return (
    <div data-site={params.site}>
      <nav>
        <a href={\`/\${params.site}\`}>Home</a>
        {" | "}
        <a href={\`/\${params.site}/blog\`}>Blog</a>
      </nav>
      {children}
    </div>
  );
}
`;
}

function generateSubpathSitePage(): string {
  return `interface Props {
  params: { site: string };
}

export default function SiteHomePage({ params }: Props) {
  return (
    <main>
      <h1>Welcome to {params.site}</h1>
      <p><a href={\`/\${params.site}/blog\`}>Read the blog</a></p>
    </main>
  );
}
`;
}

function generateSubpathBlogListPage(): string {
  return `interface Props {
  params: { site: string };
}

export default async function BlogListPage({ params }: Props) {
  // TODO: fetch posts filtered by site slug
  return (
    <main>
      <h1>Blog — {params.site}</h1>
      <p>Posts will be listed here.</p>
    </main>
  );
}
`;
}

function generateSubpathBlogPostPage(): string {
  return `interface Props {
  params: { site: string; slug: string };
}

export default async function BlogPostPage({ params }: Props) {
  // TODO: fetch post by site + slug
  return (
    <main>
      <h1>Post: {params.slug}</h1>
      <p>Site: {params.site}</p>
    </main>
  );
}
`;
}

// ── Subdomain app files ──

function generateSubdomainRootLayout(): string {
  return `import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
}

function generateSubdomainHomePage(): string {
  return `export default function HomePage() {
  return (
    <main>
      <h1>Welcome</h1>
      <p><a href="/blog">Read the blog</a></p>
    </main>
  );
}
`;
}

function generateSubdomainBlogListPage(): string {
  return `export default async function BlogListPage() {
  // TODO: resolve siteId from x-site-id header via middleware
  return (
    <main>
      <h1>Blog</h1>
      <p>Posts will be listed here.</p>
    </main>
  );
}
`;
}

function generateSubdomainBlogPostPage(): string {
  return `interface Props {
  params: { slug: string };
}

export default async function BlogPostPage({ params }: Props) {
  // TODO: fetch post by slug, scoped to current tenant
  return (
    <main>
      <h1>Post: {params.slug}</h1>
    </main>
  );
}
`;
}
