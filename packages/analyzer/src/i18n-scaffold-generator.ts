/**
 * i18n Scaffold Generator
 *
 * Generates Next.js App Router i18n files for [locale] dynamic routing,
 * including middleware for locale detection, config, layout, and page stubs.
 */

import type { ScaffoldFile } from "./blog-scaffold-generator.js";

// ── Types ──

export interface I18nScaffoldInput {
  locales: string[];
  defaultLocale: string;
}

// ── File generators ──

function generateMiddleware(locales: string[]): string {
  const localesArray = locales.map((l) => `"${l}"`).join(", ");
  return `import { NextRequest, NextResponse } from "next/server";

const locales = [${localesArray}] as const;
const defaultLocale = "${locales[0]}";

function getLocaleFromAcceptLanguage(acceptLanguage: string | null): string {
  if (!acceptLanguage) return defaultLocale;
  const preferred = acceptLanguage.split(",").map((s) => s.split(";")[0]!.trim());
  for (const lang of preferred) {
    const match = locales.find((l) => lang.startsWith(l));
    if (match) return match;
  }
  return defaultLocale;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip Next.js internals and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check if pathname already has a locale prefix
  const hasLocale = locales.some(
    (locale) => pathname === \`/\${locale}\` || pathname.startsWith(\`/\${locale}/\`),
  );

  if (hasLocale) {
    return NextResponse.next();
  }

  // Detect locale from cookie, then Accept-Language header
  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  const detectedLocale =
    (cookieLocale && locales.includes(cookieLocale as (typeof locales)[number])
      ? cookieLocale
      : null) ??
    getLocaleFromAcceptLanguage(request.headers.get("accept-language"));

  // Redirect to locale-prefixed path
  const url = request.nextUrl.clone();
  url.pathname = \`/\${detectedLocale}\${pathname}\`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
`;
}

function generateConfig(locales: string[], defaultLocale: string): string {
  const localesArray = locales.map((l) => `"${l}"`).join(", ");
  return `export const locales = [${localesArray}] as const;
export const defaultLocale = "${defaultLocale}" as const;

export type Locale = (typeof locales)[number];

export function isValidLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}
`;
}

function generateLayout(): string {
  return `import type { ReactNode } from "react";
import type { Metadata } from "next";
import { isValidLocale, defaultLocale } from "@/i18n/config";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export const metadata: Metadata = {
  title: "My Site",
};

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  const resolvedLocale = isValidLocale(locale) ? locale : defaultLocale;

  return (
    <html lang={resolvedLocale}>
      <body>{children}</body>
    </html>
  );
}
`;
}

function generatePage(locales: string[]): string {
  const localeLinks = locales
    .map((l) => `        <li key="${l}"><a href="/${l}">${l}</a></li>`)
    .join("\n");
  return `interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function LocalePage({ params }: PageProps) {
  const { locale } = await params;

  return (
    <main>
      <h1>Current locale: {locale}</h1>
      <nav>
        <ul>
${localeLinks}
        </ul>
      </nav>
    </main>
  );
}
`;
}

// ── Public API ──

export function generateI18nScaffold(input: I18nScaffoldInput): ScaffoldFile[] {
  const { locales, defaultLocale } = input;

  return [
    { path: "middleware.ts", content: generateMiddleware(locales) },
    { path: "i18n/config.ts", content: generateConfig(locales, defaultLocale) },
    { path: "app/[locale]/layout.tsx", content: generateLayout() },
    { path: "app/[locale]/page.tsx", content: generatePage(locales) },
  ];
}
