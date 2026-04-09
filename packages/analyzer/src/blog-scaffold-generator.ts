/**
 * WXR Blog Scaffold Generator
 *
 * Generates a complete Next.js App Router blog scaffold from WXR analysis output.
 * Each ScaffoldFile contains a relative path and content string to be written to disk.
 */

// ── Types ──

export interface ScaffoldFile {
  path: string;
  content: string;
}

export interface BlogPostInfo {
  slug: string;
  title: string;
  date: string;
  categories: string[];
}

export interface CategoryInfo {
  slug: string;
  name: string;
  count: number;
}

export interface BlogScaffoldInput {
  siteTitle: string;
  siteUrl: string;
  posts: BlogPostInfo[];
  categories: CategoryInfo[];
  hasYoastSeo: boolean;
  hasAcfFields: boolean;
  mediaDomains: string[];
  wpPermalinkStructure: string | null;
}

// ── Sanitization imports ──

import { escapeForStringLiteral, isValidHostname } from "./sanitize.js";

// ── File generators ──

function generateRootLayout(input: BlogScaffoldInput): string {
  const safeTitle = escapeForStringLiteral(input.siteTitle);
  return `import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "${safeTitle}",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <nav>
            <a href="/">Home</a>
            <a href="/blog">Blog</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>&copy; ${safeTitle}</p>
        </footer>
      </body>
    </html>
  );
}
`;
}

function generateGlobalsCss(): string {
  return `*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  color: #1a1a1a;
}

main {
  max-width: 48rem;
  margin: 0 auto;
  padding: 2rem 1rem;
}

header nav {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

header nav a {
  text-decoration: none;
  color: #2563eb;
}

footer {
  text-align: center;
  padding: 2rem 1rem;
  border-top: 1px solid #e5e7eb;
  color: #6b7280;
}

/* Portable Text styles */
.pt-block { margin-bottom: 1rem; }
.pt-h1 { font-size: 2rem; font-weight: bold; margin-bottom: 0.5rem; }
.pt-h2 { font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem; }
.pt-h3 { font-size: 1.25rem; font-weight: bold; margin-bottom: 0.5rem; }
.pt-h4 { font-size: 1.1rem; font-weight: bold; margin-bottom: 0.5rem; }
.pt-h5 { font-size: 1rem; font-weight: bold; margin-bottom: 0.5rem; }
.pt-h6 { font-size: 0.875rem; font-weight: bold; margin-bottom: 0.5rem; }
.pt-blockquote { border-left: 3px solid #d1d5db; padding-left: 1rem; color: #4b5563; }
.pt-separator { border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0; }
.pt-code { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
.pt-code pre { margin: 0; }
.pt-image { margin: 1.5rem 0; }
.pt-image img { max-width: 100%; height: auto; border-radius: 0.5rem; }
.pt-image figcaption { font-size: 0.875rem; color: #6b7280; margin-top: 0.5rem; }
.pt-embed { margin: 1.5rem 0; }
`;
}

function generateBlogArchivePage(): string {
  return `import Link from "next/link";
import { getAllPosts } from "@/lib/content";

export default function BlogArchivePage() {
  const posts = getAllPosts();

  return (
    <div>
      <h1>Blog</h1>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {posts.map((post) => (
          <li key={post.slug} style={{ marginBottom: "1.5rem" }}>
            <Link href={\`/blog/\${post.slug}\`}>
              <h2>{post.title}</h2>
            </Link>
            <time dateTime={post.date}>{post.date}</time>
          </li>
        ))}
      </ul>
    </div>
  );
}
`;
}

function generateBlogPostPage(input: BlogScaffoldInput): string {
  const imports: string[] = [];
  imports.push('import { notFound } from "next/navigation";');
  imports.push('import { getPostBySlug, getAllPosts } from "@/lib/content";');
  imports.push('import { PortableTextRenderer } from "@/lib/portable-text";');

  if (input.hasYoastSeo) {
    imports.push('import { generateYoastMetadata } from "@/lib/yoast-metadata";');
  }
  if (input.hasAcfFields) {
    imports.push('import { getAcfFields } from "@/lib/acf-fields";');
  }

  const metadataFn = `
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Not Found" };
  return { title: post.title };
}`;

  const staticParams = `
export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}`;

  return `${imports.join("\n")}
${metadataFn}
${staticParams}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <article>
      <h1>{post.title}</h1>
      <time dateTime={post.date}>{post.date}</time>
      <PortableTextRenderer blocks={post.blocks} />
    </article>
  );
}
`;
}

function generateCategoryArchivePage(): string {
  return `import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostsByCategory, getAllCategories } from "@/lib/content";

export function generateStaticParams() {
  return getAllCategories().map((cat) => ({ slug: cat.slug }));
}

export default async function CategoryArchivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = getAllCategories().find((c) => c.slug === slug);
  if (!category) notFound();

  const posts = getPostsByCategory(slug);

  return (
    <div>
      <h1>Category: {category.name}</h1>
      {posts.length === 0 ? (
        <p>No posts in this category yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {posts.map((post) => (
            <li key={post.slug} style={{ marginBottom: "1.5rem" }}>
              <Link href={\`/blog/\${post.slug}\`}>
                <h2>{post.title}</h2>
              </Link>
              <time dateTime={post.date}>{post.date}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
`;
}

function generateNotFoundPage(input: BlogScaffoldInput): string {
  const safeTitle = escapeForStringLiteral(input.siteTitle);
  return `export default function NotFound() {
  return (
    <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
      <h1>404</h1>
      <p>Page not found</p>
      <a href="/">Back to ${safeTitle}</a>
    </div>
  );
}
`;
}

function generateContentDataLayer(): string {
  return `import type { WptContentBlock } from "wp-transfer-core";

export interface Post {
  slug: string;
  title: string;
  date: string;
  categories: string[];
  blocks: WptContentBlock[];
}

export interface Category {
  slug: string;
  name: string;
  count: number;
}

// TODO: Replace with actual data source (JSON files, CMS, or database)
const posts: Post[] = [];
const categories: Category[] = [];

export function getAllPosts(): Post[] {
  return [...posts].sort((a, b) => (a.date > b.date ? -1 : 1));
}

export function getPostBySlug(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getPostsByCategory(categorySlug: string): Post[] {
  // filter() returns a new array, so sort() here is safe (no mutation of source)
  return posts
    .filter((p) => p.categories.includes(categorySlug))
    .sort((a, b) => (a.date > b.date ? -1 : 1));
}

export function getAllCategories(): Category[] {
  return categories;
}
`;
}

function generatePortableTextRenderer(): string {
  return `"use client";

import DOMPurify from "isomorphic-dompurify";
import type { ReactNode } from "react";
import type { WptContentBlock } from "wp-transfer-core";

interface Props {
  blocks: WptContentBlock[];
}

function safeUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("/") || url.startsWith("./")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
    return "";
  } catch { return ""; }
}

function renderSpan(span: { text?: string; marks?: string[]; _key?: string }, markDefs?: any[]): JSX.Element {
  let content: ReactNode = span.text ?? "";

  for (const mark of span.marks ?? []) {
    if (mark === "strong") {
      content = <strong>{content}</strong>;
    } else if (mark === "em") {
      content = <em>{content}</em>;
    } else if (mark === "code") {
      content = <code>{content}</code>;
    } else {
      const def = markDefs?.find((d: any) => d._key === mark);
      if (def?._type === "link" && def.href) {
        content = <a href={safeUrl(def.href)}>{content}</a>;
      }
    }
  }

  return <span key={span._key}>{content}</span>;
}

function renderBlock(block: WptContentBlock & { _type: "block"; style?: string; children?: Array<{ text?: string; marks?: string[]; _key?: string }>; markDefs?: any[]; listItem?: string }): JSX.Element {
  const children = (block.children ?? []).map((s) => renderSpan(s, block.markDefs));
  const style = block.style ?? "normal";

  switch (style) {
    case "h1": return <h1 className="pt-h1">{children}</h1>;
    case "h2": return <h2 className="pt-h2">{children}</h2>;
    case "h3": return <h3 className="pt-h3">{children}</h3>;
    case "h4": return <h4 className="pt-h4">{children}</h4>;
    case "h5": return <h5 className="pt-h5">{children}</h5>;
    case "h6": return <h6 className="pt-h6">{children}</h6>;
    case "blockquote": return <blockquote className="pt-blockquote">{children}</blockquote>;
    case "separator": return <hr className="pt-separator" />;
    default: return <p className="pt-block">{children}</p>;
  }
}

export function PortableTextRenderer({ blocks }: Props) {
  const elements: JSX.Element[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i]!;

    if (block._type === "image") {
      elements.push(
        <figure key={block._key} className="pt-image">
          <img src={safeUrl((block as any).src)} alt={(block as any).alt ?? ""} />
          {(block as any).caption && <figcaption>{(block as any).caption}</figcaption>}
        </figure>
      );
      i++;
      continue;
    }

    if (block._type === "code") {
      elements.push(
        <div key={block._key} className="pt-code">
          <pre><code>{(block as any).code}</code></pre>
        </div>
      );
      i++;
      continue;
    }

    if (block._type === "embed") {
      elements.push(
        <div key={block._key} className="pt-embed">
          <iframe src={safeUrl((block as any).url)} title="Embedded content" />
        </div>
      );
      i++;
      continue;
    }

    if (block._type === "htmlBlock") {
      elements.push(
        <div key={block._key} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize((block as any).html) }} />
      );
      i++;
      continue;
    }

    // Handle block type with list grouping
    if (block._type === "block") {
      const b = block as any;
      if (b.listItem) {
        const tag = b.listItem === "number" ? "ol" : "ul";
        const items: JSX.Element[] = [];
        while (i < blocks.length) {
          const cur = blocks[i] as any;
          if (cur._type !== "block" || cur.listItem !== b.listItem) break;
          const children = (cur.children ?? []).map((s: any) => renderSpan(s, cur.markDefs));
          items.push(<li key={cur._key}>{children}</li>);
          i++;
        }
        if (tag === "ol") {
          elements.push(<ol key={b._key}>{items}</ol>);
        } else {
          elements.push(<ul key={b._key}>{items}</ul>);
        }
        continue;
      }

      elements.push(<div key={b._key}>{renderBlock(b)}</div>);
      i++;
      continue;
    }

    i++;
  }

  return <>{elements}</>;
}
`;
}

function generateNextConfig(input: BlogScaffoldInput): string {
  const safeDomains = input.mediaDomains.filter(isValidHostname);
  const isHttp = input.siteUrl.startsWith("http://");
  const protocol = isHttp ? "http" : "https";
  const protocolComment = isHttp ? " // WARNING: HTTP — consider migrating to HTTPS" : "";

  const lines: string[] = [];
  lines.push("import type { NextConfig } from \"next\";");
  lines.push("");
  lines.push("const nextConfig: NextConfig = {");

  // Image remote patterns
  if (safeDomains.length > 0) {
    lines.push("  images: {");
    lines.push("    remotePatterns: [");
    for (const domain of safeDomains) {
      lines.push(`      { protocol: "${protocol}", hostname: "${domain}" },${protocolComment}`);
    }
    lines.push("    ],");
    lines.push("  },");
  }

  lines.push("};");
  lines.push("");

  // Redirects
  const redirects = buildRedirects(input.wpPermalinkStructure);
  if (redirects) {
    // Rewrite config to include redirects as an async method
    lines.length = 0;
    lines.push("import type { NextConfig } from \"next\";");
    lines.push("");
    lines.push("const nextConfig: NextConfig = {");

    if (safeDomains.length > 0) {
      lines.push("  images: {");
      lines.push("    remotePatterns: [");
      for (const domain of safeDomains) {
        lines.push(`      { protocol: "${protocol}", hostname: "${domain}" },${protocolComment}`);
      }
      lines.push("    ],");
      lines.push("  },");
    }

    lines.push("  async redirects() {");
    lines.push("    return [");
    for (const r of redirects) {
      lines.push("      {");
      lines.push(`        source: "${r.source}",`);
      lines.push(`        destination: "${r.destination}",`);
      lines.push("        permanent: true,");
      lines.push("      },");
    }
    lines.push("    ];");
    lines.push("  },");
    lines.push("};");
    lines.push("");
  }

  lines.push("export default nextConfig;");
  lines.push("");

  return lines.join("\n");
}

// ── Redirect helpers ──

interface RedirectRule {
  source: string;
  destination: string;
}

function buildRedirects(structure: string | null): RedirectRule[] | null {
  if (!structure) return null;

  const rules: RedirectRule[] = [];

  if (structure === "/%year%/%monthnum%/%postname%/") {
    rules.push({
      source: "/:year(\\d{4})/:month(\\d{2})/:slug",
      destination: "/blog/:slug",
    });
  } else if (structure === "/%year%/%monthnum%/%day%/%postname%/") {
    rules.push({
      source: "/:year(\\d{4})/:month(\\d{2})/:day(\\d{2})/:slug",
      destination: "/blog/:slug",
    });
  } else if (structure === "/%post_id%") {
    rules.push({
      source: "/archives/:id(\\d+)",
      destination: "/blog",
    });
  }

  return rules.length > 0 ? rules : null;
}

// ── Public API ──

export function generateBlogScaffold(input: BlogScaffoldInput): ScaffoldFile[] {
  const files: ScaffoldFile[] = [];

  files.push({ path: "app/layout.tsx", content: generateRootLayout(input) });
  files.push({ path: "app/globals.css", content: generateGlobalsCss() });
  files.push({ path: "app/blog/page.tsx", content: generateBlogArchivePage() });
  files.push({ path: "app/blog/[slug]/page.tsx", content: generateBlogPostPage(input) });
  files.push({ path: "app/blog/category/[slug]/page.tsx", content: generateCategoryArchivePage() });
  files.push({ path: "app/not-found.tsx", content: generateNotFoundPage(input) });
  files.push({ path: "lib/content.ts", content: generateContentDataLayer() });
  files.push({ path: "lib/portable-text.tsx", content: generatePortableTextRenderer() });
  files.push({ path: "next.config.ts", content: generateNextConfig(input) });

  return files;
}
