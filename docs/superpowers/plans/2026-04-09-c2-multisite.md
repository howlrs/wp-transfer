# C-2: WordPress Multisite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 複数の WXR ファイルから WordPress Multisite ネットワーク構造を自動検出し、ユーザー重複解決・メディアパス正規化・サイト間リンク書き換えを経てマルチテナント Next.js scaffold を生成する。

**Architecture:** wxr-parser の SiteCollector を拡張して `<wp:base_blog_url>` を抽出。analyzer に MultisiteDetector（ネットワーク検出）→ UserMerger（ユーザー dedupe）→ MediaNormalizer（メディアパス正規化）→ CrossSiteUrlRewriter（リンク書き換え）→ MultisitePrismaGenerator（Prisma スキーマ）→ MultisiteScaffoldGenerator（Next.js scaffold）の6モジュールを追加。core に Multisite 型定義を追加。

**Tech Stack:** TypeScript 6.0.2, vitest 4.1.3, zod 4.3.6, sax 1.6.0, pnpm monorepo

**Spec:** `docs/superpowers/specs/2026-04-09-c2-multisite-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/core/src/types/multisite.ts` | Multisite 型定義 (WpSite, MultisiteNetwork, MergedUser, UserConflict, CrossSiteLink, MultisiteConfig) |
| `fixtures/wxr/multisite-main.xml` | メインサイト WXR fixture (サブサイトへのリンク含む) |
| `fixtures/wxr/multisite-sub.xml` | サブサイト WXR fixture (レガシーメディアパス、メインへのリンク含む) |
| `packages/analyzer/src/multisite-detector.ts` | WXR 群からネットワーク構造を自動検出 |
| `packages/analyzer/tests/multisite-detector.test.ts` | Detector テスト |
| `packages/analyzer/src/user-merger.ts` | 複数 WXR 間のユーザー dedupe |
| `packages/analyzer/tests/user-merger.test.ts` | UserMerger テスト |
| `packages/analyzer/src/media-normalizer.ts` | メディア URL パス正規化 |
| `packages/analyzer/tests/media-normalizer.test.ts` | MediaNormalizer テスト |
| `packages/analyzer/src/cross-site-url-rewriter.ts` | サイト間リンク検出 + 書き換え |
| `packages/analyzer/tests/cross-site-url-rewriter.test.ts` | Rewriter テスト |
| `packages/analyzer/src/multisite-prisma-generator.ts` | 共有 DB + siteId の Prisma スキーマ生成 |
| `packages/analyzer/tests/multisite-prisma-generator.test.ts` | Prisma generator テスト |
| `packages/analyzer/src/multisite-scaffold-generator.ts` | マルチテナント Next.js scaffold 生成 |
| `packages/analyzer/tests/multisite-scaffold-generator.test.ts` | Scaffold generator テスト |
| `packages/analyzer/tests/multisite-e2e.test.ts` | 統合テスト |

### Modified Files

| File | Change |
|------|--------|
| `packages/wxr-parser/src/site-collector.ts` | `<wp:base_blog_url>` の抽出を追加 (`blogUrl` フィールド) |
| `packages/wxr-parser/src/index.ts` | `WxrParseResult` に `blogUrl` フィールドを追加 |
| `packages/core/src/index.ts` | Multisite 型のエクスポート追加 |
| `packages/analyzer/src/index.ts` | 新モジュールのエクスポート追加 |
| `apps/cli/src/commands/analyze.ts` | `--multisite` / `--multisite-mode` オプション追加、ディレクトリ入力対応 |

---

### Task 1: WxrParseResult に blogUrl を追加

SiteCollector が `<wp:base_blog_url>` を抽出できるようにし、MultisiteDetector がネットワーク構造を判定する基盤を作る。

**Files:**
- Modify: `packages/wxr-parser/src/site-collector.ts:11-14,65-81`
- Modify: `packages/wxr-parser/src/index.ts:16-25,59-68`
- Test: `packages/wxr-parser/tests/site-collector.test.ts` (既存テストが壊れないことを確認)

- [ ] **Step 1: SiteCollector に blogUrl フィールドと抽出ロジックを追加**

`packages/wxr-parser/src/site-collector.ts` — `blogUrl` プロパティを追加し、`onCloseTag` の switch に `wp:base_blog_url` ケースを追加:

```typescript
export class SiteCollector implements WxrCollector {
  siteTitle = "";
  siteUrl = "";
  blogUrl = "";  // ← 追加
  wpVersion = "";

  // ... existing fields ...

  onCloseTag(name: string): void {
    // ... existing channel/item guards ...

    switch (name) {
      case "title":
        if (!this.siteTitle) {
          this.siteTitle = text;
        }
        break;
      case "wp:base_site_url":
        this.siteUrl = text;
        break;
      case "wp:base_blog_url":   // ← 追加
        this.blogUrl = text;
        break;
      case "generator": {
        const match = text.match(/\?v=([\d.]+)/);
        if (match) {
          this.wpVersion = match[1] ?? "";
        }
        break;
      }
    }

    this.textBuffer = "";
  }
}
```

- [ ] **Step 2: WxrParseResult に blogUrl を追加**

`packages/wxr-parser/src/index.ts` — `WxrParseResult` インターフェースと `parseWxr` の return に追加:

```typescript
export interface WxrParseResult {
  siteTitle: string;
  siteUrl: string;
  blogUrl: string;  // ← 追加
  wpVersion: string;
  posts: WpPost[];
  users: WpUser[];
  taxonomies: WpTaxonomyTerm[];
  media: WpMedia[];
  errors: WxrParseError[];
}

// parseWxr return:
return {
  siteTitle: siteCollector.siteTitle,
  siteUrl: siteCollector.siteUrl,
  blogUrl: siteCollector.blogUrl,  // ← 追加
  wpVersion: siteCollector.wpVersion,
  // ... rest
};
```

- [ ] **Step 3: 既存テストが壊れないことを確認**

Run: `npx vitest run packages/wxr-parser/`
Expected: 全テストパス (blogUrl はオプショナルに追加しただけなので既存テストは影響なし)

- [ ] **Step 4: コミット**

```bash
git add packages/wxr-parser/src/site-collector.ts packages/wxr-parser/src/index.ts
git commit -m "feat(wxr-parser): extract base_blog_url for multisite detection"
```

---

### Task 2: Multisite 型定義を core に追加

MultisiteNetwork, WpSite, MergedUser, UserConflict, CrossSiteLink, MultisiteConfig の型を定義する。

**Files:**
- Create: `packages/core/src/types/multisite.ts`
- Modify: `packages/core/src/index.ts:68-83`

- [ ] **Step 1: Multisite 型定義ファイルを作成**

`packages/core/src/types/multisite.ts`:

```typescript
import { z } from "zod";

export const MultisiteModeSchema = z.enum(["subdomain", "subdirectory", "unknown"]);
export type MultisiteMode = z.infer<typeof MultisiteModeSchema>;

export const WpSiteSchema = z.object({
  siteId: z.number(),
  slug: z.string(),
  title: z.string(),
  baseUrl: z.string(),
  networkUrl: z.string(),
  path: z.string(),
  subdomain: z.string().optional(),
});

export type WpSite = z.infer<typeof WpSiteSchema>;

export const MergedUserSchema = z.object({
  id: z.number(),
  email: z.string(),
  name: z.string(),
  login: z.string(),
  siteRoles: z.array(z.object({
    siteId: z.number(),
    role: z.string(),
  })),
});

export type MergedUser = z.infer<typeof MergedUserSchema>;

export const UserConflictSchema = z.object({
  email: z.string(),
  field: z.string(),
  values: z.array(z.object({
    siteId: z.number(),
    value: z.string(),
  })),
  resolved: z.string(),
});

export type UserConflict = z.infer<typeof UserConflictSchema>;

export const CrossSiteLinkSchema = z.object({
  sourceSiteId: z.number(),
  targetSiteId: z.number(),
  sourcePostId: z.number(),
  originalUrl: z.string(),
  rewrittenPath: z.string(),
});

export type CrossSiteLink = z.infer<typeof CrossSiteLinkSchema>;

export const MultisiteNetworkSchema = z.object({
  mode: MultisiteModeSchema,
  networkUrl: z.string(),
  sites: z.array(WpSiteSchema),
  sharedUsers: z.array(MergedUserSchema),
  userConflicts: z.array(UserConflictSchema),
  crossSiteLinks: z.array(CrossSiteLinkSchema),
});

export type MultisiteNetwork = z.infer<typeof MultisiteNetworkSchema>;

export const MultisiteConfigSchema = z.object({
  scaffoldMode: z.enum(["subpath", "subdomain"]),
});

export type MultisiteConfig = z.infer<typeof MultisiteConfigSchema>;
```

- [ ] **Step 2: core/index.ts にエクスポート追加**

`packages/core/src/index.ts` — ファイル末尾に追加:

```typescript
// Multisite types
export {
  MultisiteModeSchema,
  WpSiteSchema,
  MergedUserSchema,
  UserConflictSchema,
  CrossSiteLinkSchema,
  MultisiteNetworkSchema,
  MultisiteConfigSchema,
} from "./types/multisite.js";
export type {
  MultisiteMode,
  WpSite,
  MergedUser,
  UserConflict,
  CrossSiteLink,
  MultisiteNetwork,
  MultisiteConfig,
} from "./types/multisite.js";
```

- [ ] **Step 3: 型チェック確認**

Run: `pnpm -r typecheck`
Expected: 全パッケージ typecheck パス

- [ ] **Step 4: コミット**

```bash
git add packages/core/src/types/multisite.ts packages/core/src/index.ts
git commit -m "feat(core): add Multisite type definitions (WpSite, MultisiteNetwork, MergedUser, etc.)"
```

---

### Task 3: Multisite WXR Fixture 作成

テスト用の WXR fixture を2ファイル作成する。メインサイト + サブサイト (subdirectory 型)。

**Files:**
- Create: `fixtures/wxr/multisite-main.xml`
- Create: `fixtures/wxr/multisite-sub.xml`

- [ ] **Step 1: メインサイト fixture を作成**

`fixtures/wxr/multisite-main.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">

  <channel>
    <title>Main Site</title>
    <link>https://example.com</link>
    <description>Main site of the multisite network</description>
    <language>en-US</language>
    <wp:wxr_version>1.2</wp:wxr_version>
    <wp:base_site_url>https://example.com</wp:base_site_url>
    <wp:base_blog_url>https://example.com</wp:base_blog_url>
    <generator>https://wordpress.org/?v=6.5</generator>

    <wp:author>
      <wp:author_id>1</wp:author_id>
      <wp:author_login>admin</wp:author_login>
      <wp:author_email>admin@example.com</wp:author_email>
      <wp:author_display_name><![CDATA[Admin]]></wp:author_display_name>
    </wp:author>
    <wp:author>
      <wp:author_id>2</wp:author_id>
      <wp:author_login>editor</wp:author_login>
      <wp:author_email>editor@example.com</wp:author_email>
      <wp:author_display_name><![CDATA[Editor]]></wp:author_display_name>
    </wp:author>

    <wp:category>
      <wp:term_id>1</wp:term_id>
      <wp:category_nicename>news</wp:category_nicename>
      <wp:category_parent></wp:category_parent>
      <wp:cat_name><![CDATA[News]]></wp:cat_name>
    </wp:category>

    <item>
      <title>Welcome to Main</title>
      <link>https://example.com/welcome-to-main/</link>
      <dc:creator>admin</dc:creator>
      <content:encoded><![CDATA[<p>Welcome to the main site. Check out our <a href="https://example.com/site2/hello-from-sub/">sub site post</a>.</p>]]></content:encoded>
      <excerpt:encoded><![CDATA[Welcome to main]]></excerpt:encoded>
      <wp:post_id>10</wp:post_id>
      <wp:post_date>2024-01-15 10:00:00</wp:post_date>
      <wp:post_date_gmt>2024-01-15 10:00:00</wp:post_date_gmt>
      <wp:post_modified>2024-01-15 10:00:00</wp:post_modified>
      <wp:post_modified_gmt>2024-01-15 10:00:00</wp:post_modified_gmt>
      <wp:comment_status>open</wp:comment_status>
      <wp:ping_status>open</wp:ping_status>
      <wp:post_name>welcome-to-main</wp:post_name>
      <wp:status>publish</wp:status>
      <wp:post_parent>0</wp:post_parent>
      <wp:menu_order>0</wp:menu_order>
      <wp:post_type>post</wp:post_type>
      <category domain="category" nicename="news">News</category>
    </item>

    <item>
      <title>Main Site Update</title>
      <link>https://example.com/main-site-update/</link>
      <dc:creator>editor</dc:creator>
      <content:encoded><![CDATA[<p>Latest updates from the main site.</p>]]></content:encoded>
      <excerpt:encoded><![CDATA[Latest updates]]></excerpt:encoded>
      <wp:post_id>11</wp:post_id>
      <wp:post_date>2024-02-01 12:00:00</wp:post_date>
      <wp:post_date_gmt>2024-02-01 12:00:00</wp:post_date_gmt>
      <wp:post_modified>2024-02-01 12:00:00</wp:post_modified>
      <wp:post_modified_gmt>2024-02-01 12:00:00</wp:post_modified_gmt>
      <wp:comment_status>open</wp:comment_status>
      <wp:ping_status>open</wp:ping_status>
      <wp:post_name>main-site-update</wp:post_name>
      <wp:status>publish</wp:status>
      <wp:post_parent>0</wp:post_parent>
      <wp:menu_order>0</wp:menu_order>
      <wp:post_type>post</wp:post_type>
      <category domain="category" nicename="news">News</category>
    </item>

    <item>
      <title>Main Image</title>
      <link>https://example.com/main-image/</link>
      <dc:creator>admin</dc:creator>
      <content:encoded><![CDATA[]]></content:encoded>
      <excerpt:encoded><![CDATA[]]></excerpt:encoded>
      <wp:post_id>12</wp:post_id>
      <wp:post_date>2024-01-10 08:00:00</wp:post_date>
      <wp:post_date_gmt>2024-01-10 08:00:00</wp:post_date_gmt>
      <wp:post_modified>2024-01-10 08:00:00</wp:post_modified>
      <wp:post_modified_gmt>2024-01-10 08:00:00</wp:post_modified_gmt>
      <wp:comment_status>open</wp:comment_status>
      <wp:ping_status>closed</wp:ping_status>
      <wp:post_name>main-image</wp:post_name>
      <wp:status>inherit</wp:status>
      <wp:post_parent>10</wp:post_parent>
      <wp:menu_order>0</wp:menu_order>
      <wp:post_type>attachment</wp:post_type>
      <wp:attachment_url>https://example.com/wp-content/uploads/2024/01/main-image.jpg</wp:attachment_url>
      <wp:postmeta>
        <wp:meta_key>_wp_attached_file</wp:meta_key>
        <wp:meta_value>2024/01/main-image.jpg</wp:meta_value>
      </wp:postmeta>
    </item>

  </channel>
</rss>
```

- [ ] **Step 2: サブサイト fixture を作成**

`fixtures/wxr/multisite-sub.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">

  <channel>
    <title>Sub Site</title>
    <link>https://example.com/site2</link>
    <description>Sub site of the multisite network</description>
    <language>en-US</language>
    <wp:wxr_version>1.2</wp:wxr_version>
    <wp:base_site_url>https://example.com</wp:base_site_url>
    <wp:base_blog_url>https://example.com/site2</wp:base_blog_url>
    <generator>https://wordpress.org/?v=6.5</generator>

    <wp:author>
      <wp:author_id>1</wp:author_id>
      <wp:author_login>admin</wp:author_login>
      <wp:author_email>admin@example.com</wp:author_email>
      <wp:author_display_name><![CDATA[Administrator]]></wp:author_display_name>
    </wp:author>
    <wp:author>
      <wp:author_id>3</wp:author_id>
      <wp:author_login>writer</wp:author_login>
      <wp:author_email>writer@example.com</wp:author_email>
      <wp:author_display_name><![CDATA[Writer]]></wp:author_display_name>
    </wp:author>

    <wp:category>
      <wp:term_id>2</wp:term_id>
      <wp:category_nicename>updates</wp:category_nicename>
      <wp:category_parent></wp:category_parent>
      <wp:cat_name><![CDATA[Updates]]></wp:cat_name>
    </wp:category>

    <item>
      <title>Hello from Sub</title>
      <link>https://example.com/site2/hello-from-sub/</link>
      <dc:creator>admin</dc:creator>
      <content:encoded><![CDATA[<p>Hello from sub site! Read the <a href="https://example.com/welcome-to-main/">main site welcome post</a>.</p>]]></content:encoded>
      <excerpt:encoded><![CDATA[Hello from sub]]></excerpt:encoded>
      <wp:post_id>20</wp:post_id>
      <wp:post_date>2024-01-20 14:00:00</wp:post_date>
      <wp:post_date_gmt>2024-01-20 14:00:00</wp:post_date_gmt>
      <wp:post_modified>2024-01-20 14:00:00</wp:post_modified>
      <wp:post_modified_gmt>2024-01-20 14:00:00</wp:post_modified_gmt>
      <wp:comment_status>open</wp:comment_status>
      <wp:ping_status>open</wp:ping_status>
      <wp:post_name>hello-from-sub</wp:post_name>
      <wp:status>publish</wp:status>
      <wp:post_parent>0</wp:post_parent>
      <wp:menu_order>0</wp:menu_order>
      <wp:post_type>post</wp:post_type>
      <category domain="category" nicename="updates">Updates</category>
    </item>

    <item>
      <title>Sub Site News</title>
      <link>https://example.com/site2/sub-site-news/</link>
      <dc:creator>writer</dc:creator>
      <content:encoded><![CDATA[<p>News from the sub site.</p>]]></content:encoded>
      <excerpt:encoded><![CDATA[Sub site news]]></excerpt:encoded>
      <wp:post_id>21</wp:post_id>
      <wp:post_date>2024-02-10 09:00:00</wp:post_date>
      <wp:post_date_gmt>2024-02-10 09:00:00</wp:post_date_gmt>
      <wp:post_modified>2024-02-10 09:00:00</wp:post_modified>
      <wp:post_modified_gmt>2024-02-10 09:00:00</wp:post_modified_gmt>
      <wp:comment_status>open</wp:comment_status>
      <wp:ping_status>open</wp:ping_status>
      <wp:post_name>sub-site-news</wp:post_name>
      <wp:status>publish</wp:status>
      <wp:post_parent>0</wp:post_parent>
      <wp:menu_order>0</wp:menu_order>
      <wp:post_type>post</wp:post_type>
      <category domain="category" nicename="updates">Updates</category>
    </item>

    <item>
      <title>Sub Image</title>
      <link>https://example.com/site2/sub-image/</link>
      <dc:creator>admin</dc:creator>
      <content:encoded><![CDATA[]]></content:encoded>
      <excerpt:encoded><![CDATA[]]></excerpt:encoded>
      <wp:post_id>22</wp:post_id>
      <wp:post_date>2024-01-18 07:00:00</wp:post_date>
      <wp:post_date_gmt>2024-01-18 07:00:00</wp:post_date_gmt>
      <wp:post_modified>2024-01-18 07:00:00</wp:post_modified>
      <wp:post_modified_gmt>2024-01-18 07:00:00</wp:post_modified_gmt>
      <wp:comment_status>open</wp:comment_status>
      <wp:ping_status>closed</wp:ping_status>
      <wp:post_name>sub-image</wp:post_name>
      <wp:status>inherit</wp:status>
      <wp:post_parent>20</wp:post_parent>
      <wp:menu_order>0</wp:menu_order>
      <wp:post_type>attachment</wp:post_type>
      <wp:attachment_url>https://example.com/wp-content/blogs.dir/2/files/2024/01/sub-image.jpg</wp:attachment_url>
      <wp:postmeta>
        <wp:meta_key>_wp_attached_file</wp:meta_key>
        <wp:meta_value>2024/01/sub-image.jpg</wp:meta_value>
      </wp:postmeta>
    </item>

  </channel>
</rss>
```

- [ ] **Step 3: fixture が正しくパースされることを確認**

```bash
node -e "
const { createReadStream } = require('node:fs');
const { resolve } = require('node:path');
// Quick sanity check that XML is well-formed
const fs = require('node:fs');
const main = fs.readFileSync('fixtures/wxr/multisite-main.xml', 'utf-8');
const sub = fs.readFileSync('fixtures/wxr/multisite-sub.xml', 'utf-8');
console.log('main has base_site_url:', main.includes('base_site_url'));
console.log('main has base_blog_url:', main.includes('base_blog_url'));
console.log('sub has blogs.dir:', sub.includes('blogs.dir'));
console.log('sub has cross-site link:', sub.includes('welcome-to-main'));
"
```

Expected: all `true`

- [ ] **Step 4: コミット**

```bash
git add fixtures/wxr/multisite-main.xml fixtures/wxr/multisite-sub.xml
git commit -m "test: add Multisite WXR fixtures (main + sub site, subdirectory type)"
```

---

### Task 4: MultisiteDetector — ネットワーク構造自動検出

WXR パース結果群から `base_site_url` / `base_blog_url` を比較し、subdomain/subdirectory を判定。WpSite[] を構築する。

**Files:**
- Create: `packages/analyzer/src/multisite-detector.ts`
- Create: `packages/analyzer/tests/multisite-detector.test.ts`

- [ ] **Step 1: テストを書く**

`packages/analyzer/tests/multisite-detector.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "@wp-transfer/wxr-parser";
import { detectMultisite } from "../src/multisite-detector.js";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/wxr");

describe("detectMultisite", () => {
  it("detects subdirectory network from main + sub WXR", async () => {
    const mainStream = createReadStream(resolve(fixturesDir, "multisite-main.xml"), "utf-8");
    const subStream = createReadStream(resolve(fixturesDir, "multisite-sub.xml"), "utf-8");
    const mainWxr = await parseWxr(mainStream);
    const subWxr = await parseWxr(subStream);

    const result = detectMultisite([mainWxr, subWxr]);

    expect(result.mode).toBe("subdirectory");
    expect(result.networkUrl).toBe("https://example.com");
    expect(result.sites).toHaveLength(2);

    const main = result.sites.find((s) => s.siteId === 1);
    expect(main).toBeDefined();
    expect(main!.slug).toBe("main");
    expect(main!.path).toBe("/");
    expect(main!.title).toBe("Main Site");

    const sub = result.sites.find((s) => s.siteId === 2);
    expect(sub).toBeDefined();
    expect(sub!.slug).toBe("site2");
    expect(sub!.path).toBe("/site2");
  });

  it("detects subdomain network", () => {
    const fakeMain = {
      siteTitle: "Main", siteUrl: "https://example.com", blogUrl: "https://example.com",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };
    const fakeSub = {
      siteTitle: "Blog", siteUrl: "https://example.com", blogUrl: "https://blog.example.com",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };

    const result = detectMultisite([fakeMain, fakeSub]);

    expect(result.mode).toBe("subdomain");
    expect(result.sites[1]!.subdomain).toBe("blog");
    expect(result.sites[1]!.slug).toBe("blog");
  });

  it("returns unknown mode when URLs don't match patterns", () => {
    const fakeA = {
      siteTitle: "Site A", siteUrl: "https://example.com", blogUrl: "https://other-domain.com",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };
    const fakeB = {
      siteTitle: "Site B", siteUrl: "https://example.com", blogUrl: "https://another-domain.com",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };

    const result = detectMultisite([fakeA, fakeB]);
    expect(result.mode).toBe("unknown");
  });

  it("assigns siteId=1 to main site and sorts subs alphabetically", () => {
    const fakeMain = {
      siteTitle: "Main", siteUrl: "https://example.com", blogUrl: "https://example.com",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };
    const fakeZ = {
      siteTitle: "Z Site", siteUrl: "https://example.com", blogUrl: "https://example.com/z-site",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };
    const fakeA = {
      siteTitle: "A Site", siteUrl: "https://example.com", blogUrl: "https://example.com/a-site",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };

    const result = detectMultisite([fakeZ, fakeMain, fakeA]);

    expect(result.sites[0]!.siteId).toBe(1);
    expect(result.sites[0]!.slug).toBe("main");
    expect(result.sites[1]!.siteId).toBe(2);
    expect(result.sites[1]!.slug).toBe("a-site");
    expect(result.sites[2]!.siteId).toBe(3);
    expect(result.sites[2]!.slug).toBe("z-site");
  });

  it("falls back to siteId=1 for first WXR when no main found", () => {
    const fakeA = {
      siteTitle: "A", siteUrl: "https://example.com", blogUrl: "https://example.com/a",
      wpVersion: "6.5", posts: [], users: [], taxonomies: [], media: [], errors: [],
    };

    const result = detectMultisite([fakeA]);
    expect(result.sites[0]!.siteId).toBe(1);
  });

  it("returns empty network for empty input", () => {
    const result = detectMultisite([]);
    expect(result.sites).toHaveLength(0);
    expect(result.mode).toBe("unknown");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run packages/analyzer/tests/multisite-detector.test.ts`
Expected: FAIL — `detectMultisite` が存在しない

- [ ] **Step 3: MultisiteDetector を実装**

`packages/analyzer/src/multisite-detector.ts`:

```typescript
import type { WxrParseResult } from "@wp-transfer/wxr-parser";
import type { WpSite, MultisiteNetwork } from "@wp-transfer/core";
import { sanitizeSlug } from "./sanitize.js";

interface DetectedSite {
  wxr: WxrParseResult;
  isMain: boolean;
  path: string;
  subdomain?: string;
}

export function detectMultisite(wxrResults: WxrParseResult[]): MultisiteNetwork {
  const empty: MultisiteNetwork = {
    mode: "unknown",
    networkUrl: "",
    sites: [],
    sharedUsers: [],
    userConflicts: [],
    crossSiteLinks: [],
  };

  if (wxrResults.length === 0) return empty;

  // Determine network URL (most common base_site_url)
  const siteUrls = wxrResults.map((w) => w.siteUrl).filter(Boolean);
  const networkUrl = mostCommon(siteUrls) || wxrResults[0]!.siteUrl;

  // Classify each WXR
  const detected: DetectedSite[] = wxrResults.map((wxr) => {
    const isMain = wxr.blogUrl === wxr.siteUrl || wxr.blogUrl === networkUrl;
    const path = extractPath(wxr.blogUrl, networkUrl);
    const subdomain = extractSubdomain(wxr.blogUrl, networkUrl);
    return { wxr, isMain, path, subdomain };
  });

  // Determine mode
  const mode = determineMode(detected);

  // Build sites: main first, then subs sorted alphabetically
  const mainSites = detected.filter((d) => d.isMain);
  const subSites = detected.filter((d) => !d.isMain);

  // Sort subs by path or subdomain
  subSites.sort((a, b) => {
    const keyA = a.subdomain || a.path;
    const keyB = b.subdomain || b.path;
    return keyA.localeCompare(keyB);
  });

  // If no main found, treat first as main
  const ordered = mainSites.length > 0
    ? [...mainSites, ...subSites]
    : detected;

  const sites: WpSite[] = ordered.map((d, i) => {
    const siteId = i + 1;
    const isMainSite = i === 0 && (d.isMain || mainSites.length === 0);
    const rawSlug = isMainSite
      ? "main"
      : d.subdomain || d.path.replace(/^\/|\/$/g, "") || `site-${siteId}`;
    const slug = sanitizeSlug(rawSlug) || `site-${siteId}`;

    return {
      siteId,
      slug,
      title: d.wxr.siteTitle,
      baseUrl: d.wxr.blogUrl || d.wxr.siteUrl,
      networkUrl,
      path: isMainSite ? "/" : d.path || "/",
      subdomain: d.subdomain,
    };
  });

  return {
    mode,
    networkUrl,
    sites,
    sharedUsers: [],
    userConflicts: [],
    crossSiteLinks: [],
  };
}

function determineMode(detected: DetectedSite[]): "subdomain" | "subdirectory" | "unknown" {
  const subs = detected.filter((d) => !d.isMain);
  if (subs.length === 0) return "unknown";

  const hasSubdomain = subs.some((d) => d.subdomain);
  const hasSubpath = subs.some((d) => d.path && d.path !== "/");

  if (hasSubdomain && !hasSubpath) return "subdomain";
  if (hasSubpath && !hasSubdomain) return "subdirectory";
  return "unknown";
}

function extractPath(blogUrl: string, networkUrl: string): string {
  if (!blogUrl || !networkUrl) return "/";
  try {
    const blog = new URL(blogUrl);
    const network = new URL(networkUrl);
    if (blog.hostname !== network.hostname) return "/";
    const relative = blog.pathname.replace(network.pathname.replace(/\/$/, ""), "");
    return relative || "/";
  } catch {
    return "/";
  }
}

function extractSubdomain(blogUrl: string, networkUrl: string): string | undefined {
  if (!blogUrl || !networkUrl) return undefined;
  try {
    const blog = new URL(blogUrl);
    const network = new URL(networkUrl);
    if (blog.hostname === network.hostname) return undefined;
    if (blog.hostname.endsWith(`.${network.hostname}`)) {
      return blog.hostname.replace(`.${network.hostname}`, "");
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function mostCommon(arr: string[]): string {
  const counts = new Map<string, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  let max = 0;
  let result = "";
  for (const [item, count] of counts) {
    if (count > max) {
      max = count;
      result = item;
    }
  }
  return result;
}
```

- [ ] **Step 4: テスト実行**

Run: `npx vitest run packages/analyzer/tests/multisite-detector.test.ts`
Expected: 全テストパス

- [ ] **Step 5: コミット**

```bash
git add packages/analyzer/src/multisite-detector.ts packages/analyzer/tests/multisite-detector.test.ts
git commit -m "feat(analyzer): add MultisiteDetector — network structure detection from WXR"
```

---

### Task 5: UserMerger — ユーザー重複解決

複数 WXR のユーザーを email 基準で dedupe し、サイト別ロールを分離する。

**Files:**
- Create: `packages/analyzer/src/user-merger.ts`
- Create: `packages/analyzer/tests/user-merger.test.ts`

- [ ] **Step 1: テストを書く**

`packages/analyzer/tests/user-merger.test.ts`:

```typescript
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
    // Main site (siteId=1) takes priority
    expect(result.sharedUsers[0]!.name).toBe("Admin");
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run packages/analyzer/tests/user-merger.test.ts`
Expected: FAIL

- [ ] **Step 3: UserMerger を実装**

`packages/analyzer/src/user-merger.ts`:

```typescript
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

  // Build post authorship map: siteId -> Set<authorId>
  const authorMap = new Map<number, Set<number>>();
  for (const site of sites) {
    const authors = new Set<number>();
    for (const post of site.posts) {
      authors.add(post.author);
    }
    authorMap.set(site.siteId, authors);
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
```

- [ ] **Step 4: テスト実行**

Run: `npx vitest run packages/analyzer/tests/user-merger.test.ts`
Expected: 全テストパス

- [ ] **Step 5: コミット**

```bash
git add packages/analyzer/src/user-merger.ts packages/analyzer/tests/user-merger.test.ts
git commit -m "feat(analyzer): add UserMerger — cross-site user deduplication by email"
```

---

### Task 6: MediaNormalizer — メディアパス正規化

`blogs.dir/{id}/files/` → `uploads/sites/{id}/` の変換と remotePatterns 生成。

**Files:**
- Create: `packages/analyzer/src/media-normalizer.ts`
- Create: `packages/analyzer/tests/media-normalizer.test.ts`

- [ ] **Step 1: テストを書く**

`packages/analyzer/tests/media-normalizer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { normalizeMedia } from "../src/media-normalizer.js";
import type { WpMedia } from "@wp-transfer/core";

function makeMedia(url: string): WpMedia {
  return { id: 1, title: "img", url, mimeType: "image/jpeg" };
}

describe("normalizeMedia", () => {
  it("converts blogs.dir path to uploads/sites", () => {
    const media = [makeMedia("https://example.com/wp-content/blogs.dir/2/files/2024/01/img.jpg")];
    const result = normalizeMedia(media, 2);

    expect(result.media[0]!.url).toBe("https://example.com/wp-content/uploads/sites/2/2024/01/img.jpg");
  });

  it("preserves standard uploads path", () => {
    const media = [makeMedia("https://example.com/wp-content/uploads/2024/01/img.jpg")];
    const result = normalizeMedia(media, 1);

    expect(result.media[0]!.url).toBe("https://example.com/wp-content/uploads/2024/01/img.jpg");
  });

  it("generates remotePatterns from media domains", () => {
    const media = [
      makeMedia("https://example.com/wp-content/uploads/img.jpg"),
      makeMedia("https://cdn.example.com/wp-content/uploads/img2.jpg"),
    ];
    const result = normalizeMedia(media, 1);

    expect(result.remotePatterns).toContainEqual({ protocol: "https", hostname: "example.com" });
    expect(result.remotePatterns).toContainEqual({ protocol: "https", hostname: "cdn.example.com" });
  });

  it("deduplicates remotePatterns", () => {
    const media = [
      makeMedia("https://example.com/a.jpg"),
      makeMedia("https://example.com/b.jpg"),
    ];
    const result = normalizeMedia(media, 1);
    expect(result.remotePatterns).toHaveLength(1);
  });

  it("handles empty media array", () => {
    const result = normalizeMedia([], 1);
    expect(result.media).toHaveLength(0);
    expect(result.remotePatterns).toHaveLength(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run packages/analyzer/tests/media-normalizer.test.ts`
Expected: FAIL

- [ ] **Step 3: MediaNormalizer を実装**

`packages/analyzer/src/media-normalizer.ts`:

```typescript
import type { WpMedia } from "@wp-transfer/core";

export interface RemotePattern {
  protocol: string;
  hostname: string;
}

export interface MediaNormalizeResult {
  media: WpMedia[];
  remotePatterns: RemotePattern[];
}

const BLOGS_DIR_RE = /\/wp-content\/blogs\.dir\/(\d+)\/files\//;

export function normalizeMedia(media: WpMedia[], siteId: number): MediaNormalizeResult {
  const normalized = media.map((m) => ({
    ...m,
    url: normalizePath(m.url, siteId),
  }));

  const seen = new Set<string>();
  const remotePatterns: RemotePattern[] = [];
  for (const m of normalized) {
    try {
      const url = new URL(m.url);
      const key = `${url.protocol}//${url.hostname}`;
      if (!seen.has(key)) {
        seen.add(key);
        remotePatterns.push({ protocol: url.protocol.replace(":", ""), hostname: url.hostname });
      }
    } catch {
      // skip invalid URLs
    }
  }

  return { media: normalized, remotePatterns };
}

function normalizePath(url: string, siteId: number): string {
  return url.replace(BLOGS_DIR_RE, `/wp-content/uploads/sites/${siteId}/`);
}
```

- [ ] **Step 4: テスト実行**

Run: `npx vitest run packages/analyzer/tests/media-normalizer.test.ts`
Expected: 全テストパス

- [ ] **Step 5: コミット**

```bash
git add packages/analyzer/src/media-normalizer.ts packages/analyzer/tests/media-normalizer.test.ts
git commit -m "feat(analyzer): add MediaNormalizer — blogs.dir path normalization"
```

---

### Task 7: CrossSiteUrlRewriter — サイト間リンク書き換え

コンテンツ内のサイト間 URL を検出し、Next.js ルートに書き換える。

**Files:**
- Create: `packages/analyzer/src/cross-site-url-rewriter.ts`
- Create: `packages/analyzer/tests/cross-site-url-rewriter.test.ts`

- [ ] **Step 1: テストを書く**

`packages/analyzer/tests/cross-site-url-rewriter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { rewriteCrossSiteUrls } from "../src/cross-site-url-rewriter.js";
import type { WpSite } from "@wp-transfer/core";

const sites: WpSite[] = [
  { siteId: 1, slug: "main", title: "Main", baseUrl: "https://example.com", networkUrl: "https://example.com", path: "/" },
  { siteId: 2, slug: "site2", title: "Sub", baseUrl: "https://example.com/site2", networkUrl: "https://example.com", path: "/site2" },
];

describe("rewriteCrossSiteUrls", () => {
  it("rewrites cross-site link in subpath mode", () => {
    const content = '<p>See <a href="https://example.com/site2/hello-from-sub/">this post</a>.</p>';
    const result = rewriteCrossSiteUrls(content, 1, 10, sites, "subpath");

    expect(result.rewritten).toContain('href="/site2/blog/hello-from-sub"');
    expect(result.links).toHaveLength(1);
    expect(result.links[0]!.targetSiteId).toBe(2);
    expect(result.links[0]!.rewrittenPath).toBe("/site2/blog/hello-from-sub");
  });

  it("rewrites cross-site link in subdomain mode", () => {
    const content = '<p>See <a href="https://example.com/site2/hello-from-sub/">this post</a>.</p>';
    const result = rewriteCrossSiteUrls(content, 1, 10, sites, "subdomain");

    expect(result.rewritten).toContain('href="/blog/hello-from-sub"');
  });

  it("rewrites link from sub to main site", () => {
    const content = '<p>Read <a href="https://example.com/welcome-to-main/">main post</a>.</p>';
    const result = rewriteCrossSiteUrls(content, 2, 20, sites, "subpath");

    expect(result.rewritten).toContain('href="/main/blog/welcome-to-main"');
    expect(result.links[0]!.targetSiteId).toBe(1);
  });

  it("skips external URLs", () => {
    const content = '<p>See <a href="https://external.com/page">external</a>.</p>';
    const result = rewriteCrossSiteUrls(content, 1, 10, sites, "subpath");

    expect(result.rewritten).toBe(content);
    expect(result.links).toHaveLength(0);
  });

  it("skips same-site URLs", () => {
    const content = '<p>See <a href="https://example.com/other-post/">local</a>.</p>';
    const result = rewriteCrossSiteUrls(content, 1, 10, sites, "subpath");

    expect(result.links).toHaveLength(0);
  });

  it("handles content with no links", () => {
    const content = "<p>No links here.</p>";
    const result = rewriteCrossSiteUrls(content, 1, 10, sites, "subpath");

    expect(result.rewritten).toBe(content);
    expect(result.links).toHaveLength(0);
  });

  it("extracts slug from date-based permalink", () => {
    const content = '<a href="https://example.com/site2/2024/01/15/hello-from-sub/">link</a>';
    const result = rewriteCrossSiteUrls(content, 1, 10, sites, "subpath");

    expect(result.links[0]!.rewrittenPath).toBe("/site2/blog/hello-from-sub");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run packages/analyzer/tests/cross-site-url-rewriter.test.ts`
Expected: FAIL

- [ ] **Step 3: CrossSiteUrlRewriter を実装**

`packages/analyzer/src/cross-site-url-rewriter.ts`:

```typescript
import type { WpSite, CrossSiteLink } from "@wp-transfer/core";

export interface RewriteResult {
  rewritten: string;
  links: CrossSiteLink[];
}

const HREF_RE = /href="([^"]+)"/g;
const DATE_PERMALINK_RE = /\/\d{4}\/\d{2}\/\d{2}\/([\w-]+)\/?$/;

export function rewriteCrossSiteUrls(
  content: string,
  sourceSiteId: number,
  sourcePostId: number,
  sites: WpSite[],
  mode: "subpath" | "subdomain",
): RewriteResult {
  const links: CrossSiteLink[] = [];

  // Build baseUrl → site map (sorted by path length desc to match longest first)
  const siteMap = [...sites]
    .sort((a, b) => b.baseUrl.length - a.baseUrl.length);

  const rewritten = content.replace(HREF_RE, (match, url: string) => {
    for (const site of siteMap) {
      if (site.siteId === sourceSiteId) continue;

      const baseNormalized = site.baseUrl.replace(/\/$/, "");
      if (!url.startsWith(baseNormalized + "/") && url !== baseNormalized) continue;

      const relativePath = url.slice(baseNormalized.length);
      const slug = extractSlug(relativePath);
      if (!slug) continue;

      const rewrittenPath = mode === "subpath"
        ? `/${site.slug}/blog/${slug}`
        : `/blog/${slug}`;

      links.push({
        sourceSiteId,
        targetSiteId: site.siteId,
        sourcePostId,
        originalUrl: url,
        rewrittenPath,
      });

      return `href="${rewrittenPath}"`;
    }

    return match;
  });

  return { rewritten, links };
}

function extractSlug(path: string): string | null {
  const cleaned = path.replace(/\/$/, "").replace(/^\//, "");
  if (!cleaned) return null;

  // Date-based: /2024/01/15/slug/
  const dateMatch = path.match(DATE_PERMALINK_RE);
  if (dateMatch) return dateMatch[1] ?? null;

  // Default: last segment
  const segments = cleaned.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? null;
}
```

- [ ] **Step 4: テスト実行**

Run: `npx vitest run packages/analyzer/tests/cross-site-url-rewriter.test.ts`
Expected: 全テストパス

- [ ] **Step 5: コミット**

```bash
git add packages/analyzer/src/cross-site-url-rewriter.ts packages/analyzer/tests/cross-site-url-rewriter.test.ts
git commit -m "feat(analyzer): add CrossSiteUrlRewriter — inter-site link detection and rewriting"
```

---

### Task 8: MultisitePrismaGenerator — Prisma スキーマ生成

共有 DB + siteId カラムの Prisma スキーマを生成する。

**Files:**
- Create: `packages/analyzer/src/multisite-prisma-generator.ts`
- Create: `packages/analyzer/tests/multisite-prisma-generator.test.ts`

- [ ] **Step 1: テストを書く**

`packages/analyzer/tests/multisite-prisma-generator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateMultisitePrismaSchema } from "../src/multisite-prisma-generator.js";
import type { WpSite } from "@wp-transfer/core";

const sites: WpSite[] = [
  { siteId: 1, slug: "main", title: "Main", baseUrl: "https://example.com", networkUrl: "https://example.com", path: "/" },
  { siteId: 2, slug: "site2", title: "Sub", baseUrl: "https://example.com/site2", networkUrl: "https://example.com", path: "/site2" },
];

describe("generateMultisitePrismaSchema", () => {
  it("generates schema with Site, Post, User, UserSiteRole, Media models", () => {
    const schema = generateMultisitePrismaSchema(sites);

    expect(schema).toContain("model Site {");
    expect(schema).toContain("model Post {");
    expect(schema).toContain("model User {");
    expect(schema).toContain("model UserSiteRole {");
    expect(schema).toContain("model Media {");
  });

  it("includes siteId index on Post", () => {
    const schema = generateMultisitePrismaSchema(sites);
    expect(schema).toContain("@@index([siteId, slug])");
    expect(schema).toContain("@@index([siteId, type])");
  });

  it("includes unique constraint on UserSiteRole", () => {
    const schema = generateMultisitePrismaSchema(sites);
    expect(schema).toContain("@@unique([userId, siteId])");
  });

  it("includes Prisma datasource and generator blocks", () => {
    const schema = generateMultisitePrismaSchema(sites);
    expect(schema).toContain("datasource db {");
    expect(schema).toContain("generator client {");
  });

  it("includes Site slug as unique", () => {
    const schema = generateMultisitePrismaSchema(sites);
    expect(schema).toContain("slug        String   @unique");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run packages/analyzer/tests/multisite-prisma-generator.test.ts`
Expected: FAIL

- [ ] **Step 3: MultisitePrismaGenerator を実装**

`packages/analyzer/src/multisite-prisma-generator.ts`:

```typescript
import type { WpSite } from "@wp-transfer/core";

export function generateMultisitePrismaSchema(_sites: WpSite[]): string {
  return `// Multisite Prisma Schema — auto-generated by wp-transfer
// Shared DB with siteId column for tenant isolation

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Site {
  id          Int             @id @default(autoincrement())
  slug        String          @unique
  title       String
  domain      String?
  path        String          @default("/")
  posts       Post[]
  media       Media[]
  userRoles   UserSiteRole[]
}

model Post {
  id          Int      @id @default(autoincrement())
  siteId      Int
  site        Site     @relation(fields: [siteId], references: [id])
  title       String
  slug        String
  content     String   @db.Text
  excerpt     String   @db.Text
  status      String   @default("publish")
  type        String   @default("post")
  authorId    Int?
  author      User?    @relation(fields: [authorId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([siteId, slug])
  @@index([siteId, type])
}

model User {
  id          Int             @id @default(autoincrement())
  email       String          @unique
  name        String
  login       String?
  posts       Post[]
  siteRoles   UserSiteRole[]
}

model UserSiteRole {
  id          Int      @id @default(autoincrement())
  userId      Int
  user        User     @relation(fields: [userId], references: [id])
  siteId      Int
  site        Site     @relation(fields: [siteId], references: [id])
  role        String   @default("contributor")
  @@unique([userId, siteId])
}

model Media {
  id          Int      @id @default(autoincrement())
  siteId      Int
  site        Site     @relation(fields: [siteId], references: [id])
  url         String
  title       String?
  alt         String?
  mimeType    String?
  @@index([siteId])
}
`;
}
```

- [ ] **Step 4: テスト実行**

Run: `npx vitest run packages/analyzer/tests/multisite-prisma-generator.test.ts`
Expected: 全テストパス

- [ ] **Step 5: コミット**

```bash
git add packages/analyzer/src/multisite-prisma-generator.ts packages/analyzer/tests/multisite-prisma-generator.test.ts
git commit -m "feat(analyzer): add MultisitePrismaGenerator — shared DB with siteId schema"
```

---

### Task 9: MultisiteScaffoldGenerator — Next.js マルチテナント scaffold

subpath/subdomain モード別の Next.js scaffold を生成する。

**Files:**
- Create: `packages/analyzer/src/multisite-scaffold-generator.ts`
- Create: `packages/analyzer/tests/multisite-scaffold-generator.test.ts`

- [ ] **Step 1: テストを書く**

`packages/analyzer/tests/multisite-scaffold-generator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateMultisiteScaffold } from "../src/multisite-scaffold-generator.js";
import type { WpSite } from "@wp-transfer/core";

const sites: WpSite[] = [
  { siteId: 1, slug: "main", title: "Main Site", baseUrl: "https://example.com", networkUrl: "https://example.com", path: "/" },
  { siteId: 2, slug: "site2", title: "Sub Site", baseUrl: "https://example.com/site2", networkUrl: "https://example.com", path: "/site2" },
];

const remotePatterns = [{ protocol: "https", hostname: "example.com" }];

describe("generateMultisiteScaffold", () => {
  it("generates subpath scaffold with [site] dynamic route", () => {
    const files = generateMultisiteScaffold({ sites, mode: "subpath", remotePatterns });

    const paths = files.map((f) => f.path);
    expect(paths).toContain("middleware.ts");
    expect(paths).toContain("lib/tenant.ts");
    expect(paths).toContain("lib/prisma.ts");
    expect(paths).toContain("app/[site]/layout.tsx");
    expect(paths).toContain("app/[site]/page.tsx");
    expect(paths).toContain("app/[site]/blog/page.tsx");
    expect(paths).toContain("app/[site]/blog/[slug]/page.tsx");
    expect(paths).toContain("app/page.tsx");
    expect(paths).toContain("next.config.js");
  });

  it("generates subdomain scaffold without [site] route", () => {
    const files = generateMultisiteScaffold({ sites, mode: "subdomain", remotePatterns });

    const paths = files.map((f) => f.path);
    expect(paths).toContain("middleware.ts");
    expect(paths).toContain("lib/tenant.ts");
    expect(paths).toContain("app/layout.tsx");
    expect(paths).toContain("app/page.tsx");
    expect(paths).toContain("app/blog/page.tsx");
    expect(paths).toContain("app/blog/[slug]/page.tsx");
    expect(paths).not.toContain("app/[site]/layout.tsx");
  });

  it("subpath middleware resolves from path segment", () => {
    const files = generateMultisiteScaffold({ sites, mode: "subpath", remotePatterns });
    const mw = files.find((f) => f.path === "middleware.ts");
    expect(mw!.content).toContain("pathname");
    expect(mw!.content).toContain("slug");
  });

  it("subdomain middleware resolves from Host header", () => {
    const files = generateMultisiteScaffold({ sites, mode: "subdomain", remotePatterns });
    const mw = files.find((f) => f.path === "middleware.ts");
    expect(mw!.content).toContain("host");
  });

  it("tenant.ts uses Prisma Client Extensions for siteId scoping", () => {
    const files = generateMultisiteScaffold({ sites, mode: "subpath", remotePatterns });
    const tenant = files.find((f) => f.path === "lib/tenant.ts");
    expect(tenant!.content).toContain("$extends");
    expect(tenant!.content).toContain("siteId");
  });

  it("next.config.js includes remotePatterns", () => {
    const files = generateMultisiteScaffold({ sites, mode: "subpath", remotePatterns });
    const config = files.find((f) => f.path === "next.config.js");
    expect(config!.content).toContain("example.com");
  });

  it("subpath network top page lists all sites", () => {
    const files = generateMultisiteScaffold({ sites, mode: "subpath", remotePatterns });
    const top = files.find((f) => f.path === "app/page.tsx");
    expect(top!.content).toContain("Main Site");
    expect(top!.content).toContain("Sub Site");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run packages/analyzer/tests/multisite-scaffold-generator.test.ts`
Expected: FAIL

- [ ] **Step 3: MultisiteScaffoldGenerator を実装**

`packages/analyzer/src/multisite-scaffold-generator.ts`:

```typescript
import type { WpSite } from "@wp-transfer/core";
import type { ScaffoldFile } from "./blog-scaffold-generator.js";
import { escapeForStringLiteral } from "./sanitize.js";

interface RemotePattern {
  protocol: string;
  hostname: string;
}

export interface MultisiteScaffoldInput {
  sites: WpSite[];
  mode: "subpath" | "subdomain";
  remotePatterns: RemotePattern[];
}

export function generateMultisiteScaffold(input: MultisiteScaffoldInput): ScaffoldFile[] {
  return input.mode === "subpath"
    ? generateSubpathScaffold(input)
    : generateSubdomainScaffold(input);
}

function generateSubpathScaffold(input: MultisiteScaffoldInput): ScaffoldFile[] {
  const { sites, remotePatterns } = input;
  return [
    { path: "middleware.ts", content: subpathMiddleware() },
    { path: "lib/prisma.ts", content: prismaClient() },
    { path: "lib/tenant.ts", content: tenantLib() },
    { path: "next.config.js", content: nextConfig(remotePatterns) },
    { path: "app/page.tsx", content: networkTopPage(sites) },
    { path: "app/[site]/layout.tsx", content: siteLayout() },
    { path: "app/[site]/page.tsx", content: siteTopPage() },
    { path: "app/[site]/blog/page.tsx", content: blogListPage() },
    { path: "app/[site]/blog/[slug]/page.tsx", content: blogDetailPage() },
  ];
}

function generateSubdomainScaffold(input: MultisiteScaffoldInput): ScaffoldFile[] {
  const { remotePatterns } = input;
  return [
    { path: "middleware.ts", content: subdomainMiddleware() },
    { path: "lib/prisma.ts", content: prismaClient() },
    { path: "lib/tenant.ts", content: tenantLib() },
    { path: "next.config.js", content: nextConfig(remotePatterns) },
    { path: "app/layout.tsx", content: siteLayout() },
    { path: "app/page.tsx", content: siteTopPage() },
    { path: "app/blog/page.tsx", content: blogListPage() },
    { path: "app/blog/[slug]/page.tsx", content: blogDetailPage() },
  ];
}

function subpathMiddleware(): string {
  return `import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const KNOWN_SLUGS = new Set(["main"]); // TODO: populate from DB or config

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean);
  const slug = segments[0] || "main";

  // Pass tenant slug via header for downstream use
  const response = NextResponse.next();
  response.headers.set("x-tenant-slug", slug);
  return response;
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico).*)"],
};
`;
}

function subdomainMiddleware(): string {
  return `import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const slug = host.split(".")[0] || "main";

  const response = NextResponse.next();
  response.headers.set("x-tenant-slug", slug);
  return response;
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico).*)"],
};
`;
}

function prismaClient(): string {
  return `import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
`;
}

function tenantLib(): string {
  return `import { prisma } from "./prisma";

export async function getTenant(slug: string) {
  const site = await prisma.site.findUnique({ where: { slug } });
  if (!site) throw new Error(\`Site not found: \${slug}\`);
  return site;
}

/**
 * Returns a Prisma client scoped to a specific site.
 * All queries on Post and Media are automatically filtered by siteId.
 * This prevents cross-tenant data leaks.
 */
export function getTenantPrisma(siteId: number) {
  return prisma.$extends({
    query: {
      post: {
        async findMany({ args, query }) {
          args.where = { ...args.where, siteId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, siteId };
          return query(args);
        },
        async count({ args, query }) {
          args.where = { ...args.where, siteId };
          return query(args);
        },
      },
      media: {
        async findMany({ args, query }) {
          args.where = { ...args.where, siteId };
          return query(args);
        },
      },
    },
  });
}
`;
}

function nextConfig(remotePatterns: RemotePattern[]): string {
  const patterns = remotePatterns
    .map((p) => `    { protocol: "${escapeForStringLiteral(p.protocol)}", hostname: "${escapeForStringLiteral(p.hostname)}" }`)
    .join(",\n");

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

function networkTopPage(sites: WpSite[]): string {
  const siteLinks = sites
    .map((s) => `        <li key="${escapeForStringLiteral(s.slug)}"><a href="/${escapeForStringLiteral(s.slug)}">${escapeForStringLiteral(s.title)}</a></li>`)
    .join("\n");

  return `export default function NetworkHome() {
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

function siteLayout(): string {
  return `export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
}

function siteTopPage(): string {
  return `import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export default async function SitePage() {
  const slug = (await headers()).get("x-tenant-slug") || "main";
  const site = await prisma.site.findUnique({ where: { slug } });

  return (
    <main>
      <h1>{site?.title || "Site"}</h1>
      <p>Welcome to {site?.title}.</p>
      <a href={\`/\${slug}/blog\`}>Blog</a>
    </main>
  );
}
`;
}

function blogListPage(): string {
  return `import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant";
import { headers } from "next/headers";

export default async function BlogPage() {
  const slug = (await headers()).get("x-tenant-slug") || "main";
  const site = await prisma.site.findUnique({ where: { slug } });
  if (!site) return <div>Site not found</div>;

  const db = getTenantPrisma(site.id);
  const posts = await db.post.findMany({
    where: { status: "publish", type: "post" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main>
      <h1>Blog — {site.title}</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>
            <a href={\`/\${slug}/blog/\${post.slug}\`}>{post.title}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
`;
}

function blogDetailPage(): string {
  return `import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenantSlug = (await headers()).get("x-tenant-slug") || "main";
  const site = await prisma.site.findUnique({ where: { slug: tenantSlug } });
  if (!site) notFound();

  const db = getTenantPrisma(site.id);
  const post = await db.post.findFirst({ where: { slug, status: "publish" } });
  if (!post) notFound();

  return (
    <article>
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.content }} />
    </article>
  );
}
`;
}
```

- [ ] **Step 4: テスト実行**

Run: `npx vitest run packages/analyzer/tests/multisite-scaffold-generator.test.ts`
Expected: 全テストパス

- [ ] **Step 5: コミット**

```bash
git add packages/analyzer/src/multisite-scaffold-generator.ts packages/analyzer/tests/multisite-scaffold-generator.test.ts
git commit -m "feat(analyzer): add MultisiteScaffoldGenerator — multi-tenant Next.js scaffold"
```

---

### Task 10: Analyzer エクスポート追加

新モジュールを analyzer パッケージの index.ts からエクスポートする。

**Files:**
- Modify: `packages/analyzer/src/index.ts:148-152`

- [ ] **Step 1: エクスポートを追加**

`packages/analyzer/src/index.ts` — ファイル末尾に追加:

```typescript
export {
  detectMultisite,
} from "./multisite-detector.js";

export {
  mergeUsers,
  type UserMergeResult,
} from "./user-merger.js";

export {
  normalizeMedia,
  type MediaNormalizeResult,
  type RemotePattern,
} from "./media-normalizer.js";

export {
  rewriteCrossSiteUrls,
  type RewriteResult,
} from "./cross-site-url-rewriter.js";

export {
  generateMultisitePrismaSchema,
} from "./multisite-prisma-generator.js";

export {
  generateMultisiteScaffold,
  type MultisiteScaffoldInput,
} from "./multisite-scaffold-generator.js";
```

- [ ] **Step 2: 型チェック確認**

Run: `pnpm -r typecheck`
Expected: 全パッケージ typecheck パス

- [ ] **Step 3: 全テスト確認**

Run: `npx vitest run`
Expected: 全テストパス (既存 479 + 新規)

- [ ] **Step 4: コミット**

```bash
git add packages/analyzer/src/index.ts
git commit -m "feat(analyzer): export Multisite modules (detector, merger, normalizer, rewriter, generators)"
```

---

### Task 11: CLI 統合 — --multisite オプション追加

`analyze` コマンドにディレクトリ入力 + `--multisite` / `--multisite-mode` オプションを追加する。

**Files:**
- Modify: `apps/cli/src/commands/analyze.ts:1-79`

- [ ] **Step 1: CLI args に multisite オプションを追加**

`apps/cli/src/commands/analyze.ts` — args オブジェクトに追加:

```typescript
args: {
  source: {
    type: "positional",
    required: true,
    description: "WP site URL, WXR file path, or directory (with --multisite)",
  },
  output: { type: "string", default: "./migration-report", description: "Output file path (without extension)" },
  format: { type: "string", default: "both", description: "Output format: json, markdown, or both" },
  username: { type: "string", description: "WP admin username for REST API" },
  password: { type: "string", description: "WP application password for REST API" },
  multisite: { type: "boolean", default: false, description: "Enable multisite analysis (source must be a directory)" },
  "multisite-mode": { type: "string", default: "", description: "Scaffold mode: subpath or subdomain (auto-detected if omitted)" },
},
```

- [ ] **Step 2: run() にディレクトリ判定ロジックを追加**

`apps/cli/src/commands/analyze.ts` — run() 関数内、既存の分岐の前に追加:

```typescript
async run({ args }) {
  const source = args.source as string;
  const output = args.output as string;
  const format = args.format as string;
  const multisite = args.multisite as boolean;
  const multisiteMode = args["multisite-mode"] as string;

  const validFormats = ["json", "markdown", "both"];
  if (!validFormats.includes(format)) {
    consola.error(`Invalid format "${format}". Must be one of: ${validFormats.join(", ")}`);
    return;
  }

  const resolvedSource = resolve(process.cwd(), source);

  // Multisite: directory input
  if (multisite) {
    const { statSync, readdirSync } = await import("node:fs");
    if (!statSync(resolvedSource).isDirectory()) {
      consola.error("--multisite requires a directory path containing WXR files.");
      return;
    }
    // Path traversal check
    const resolvedDir = resolve(resolvedSource);
    const xmlFiles = readdirSync(resolvedDir)
      .filter((f) => f.endsWith(".xml"))
      .map((f) => resolve(resolvedDir, f))
      .filter((f) => f.startsWith(resolvedDir)); // path safety

    if (xmlFiles.length === 0) {
      consola.error("No XML files found in the directory.");
      return;
    }

    await analyzeMultisite(xmlFiles, output, format, multisiteMode);
    return;
  }

  // Existing single-file / URL logic
  if (source.endsWith(".xml") && existsSync(resolvedSource)) {
    await analyzeFromWxr(resolvedSource, output, format);
  } else {
    await analyzeFromUrl(source, output, format, args.username as string | undefined, args.password as string | undefined);
  }
},
```

- [ ] **Step 3: analyzeMultisite 関数を追加**

`apps/cli/src/commands/analyze.ts` — `analyzeFromWxr` の前に追加。import にも multisite モジュールを追加:

```typescript
import {
  // ... existing imports ...
  detectMultisite,
  mergeUsers,
  normalizeMedia,
  rewriteCrossSiteUrls,
  generateMultisitePrismaSchema,
  generateMultisiteScaffold,
} from "@wp-transfer/analyzer";

async function analyzeMultisite(
  xmlFiles: string[],
  output: string,
  format: string,
  multisiteMode: string,
): Promise<void> {
  consola.start(`Parsing ${xmlFiles.length} WXR files...`);

  // Parse all WXR files
  const wxrResults = [];
  for (const file of xmlFiles) {
    const stream = createReadStream(file);
    const wxr = await parseWxr(stream);
    wxrResults.push(wxr);
    consola.success(`  ${file}: ${wxr.posts.length} posts, ${wxr.users.length} users`);
  }

  // Detect multisite structure
  const network = detectMultisite(wxrResults);
  consola.success(`Network: ${network.mode} mode, ${network.sites.length} sites`);

  // Determine scaffold mode
  const scaffoldMode = multisiteMode === "subdomain" ? "subdomain" as const
    : multisiteMode === "subpath" ? "subpath" as const
    : network.mode === "subdomain" ? "subdomain" as const
    : "subpath" as const;

  // Merge users
  const siteUserData = network.sites.map((site, i) => ({
    siteId: site.siteId,
    users: wxrResults[i]!.users,
    posts: wxrResults[i]!.posts,
  }));
  const { sharedUsers, userConflicts } = mergeUsers(siteUserData);
  network.sharedUsers = sharedUsers;
  network.userConflicts = userConflicts;
  consola.success(`Users: ${sharedUsers.length} unique (${userConflicts.length} conflicts)`);

  // Normalize media + collect remotePatterns
  const allRemotePatterns: { protocol: string; hostname: string }[] = [];
  for (const site of network.sites) {
    const siteWxr = wxrResults.find((w) => (w.blogUrl || w.siteUrl) === site.baseUrl);
    if (!siteWxr) continue;
    const { media, remotePatterns } = normalizeMedia(siteWxr.media, site.siteId);
    // Update media in place for reporting
    allRemotePatterns.push(...remotePatterns);
  }

  // Rewrite cross-site URLs
  const allLinks = [];
  for (const site of network.sites) {
    const siteWxr = wxrResults.find((w) => (w.blogUrl || w.siteUrl) === site.baseUrl);
    if (!siteWxr) continue;
    for (const post of siteWxr.posts) {
      const { links } = rewriteCrossSiteUrls(post.content, site.siteId, post.id, network.sites, scaffoldMode);
      allLinks.push(...links);
    }
  }
  network.crossSiteLinks = allLinks;
  consola.success(`Cross-site links: ${allLinks.length} rewritten`);

  // Generate output
  const outputDir = resolve(output);

  // Prisma schema
  const prismaSchema = generateMultisitePrismaSchema(network.sites);
  const prismaPath = resolve(outputDir, "prisma/schema.prisma");
  await mkdir(dirname(prismaPath), { recursive: true });
  await writeFile(prismaPath, prismaSchema, "utf-8");
  consola.success(`Written: ${prismaPath}`);

  // Scaffold files
  const deduped = [...new Map(allRemotePatterns.map((p) => [`${p.protocol}://${p.hostname}`, p])).values()];
  const scaffoldFiles = generateMultisiteScaffold({ sites: network.sites, mode: scaffoldMode, remotePatterns: deduped });
  for (const file of scaffoldFiles) {
    const filePath = resolve(outputDir, file.path);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content, "utf-8");
  }
  consola.success(`Written: ${scaffoldFiles.length} scaffold files`);

  // Summary
  const sitesTable = network.sites
    .map((s) => `  ${s.siteId}. ${s.title} (${s.path})`)
    .join("\n");

  consola.box(
    [
      `Multisite Network: ${network.mode}`,
      `Network URL: ${network.networkUrl}`,
      `Scaffold Mode: ${scaffoldMode}`,
      `Sites:\n${sitesTable}`,
      `Users: ${sharedUsers.length} unique, ${userConflicts.length} conflicts`,
      `Cross-site links: ${allLinks.length} rewritten`,
    ].join("\n"),
  );
}
```

- [ ] **Step 4: 型チェック + 全テスト確認**

Run: `pnpm -r typecheck && npx vitest run`
Expected: 全パス

- [ ] **Step 5: コミット**

```bash
git add apps/cli/src/commands/analyze.ts
git commit -m "feat(cli): integrate Multisite analysis with --multisite and --multisite-mode options"
```

---

### Task 12: E2E 統合テスト

ディレクトリ入力から全パイプライン (detect → merge → normalize → rewrite → scaffold) を通す統合テスト。

**Files:**
- Create: `packages/analyzer/tests/multisite-e2e.test.ts`

- [ ] **Step 1: E2E テストを書く**

`packages/analyzer/tests/multisite-e2e.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "@wp-transfer/wxr-parser";
import {
  detectMultisite,
  mergeUsers,
  normalizeMedia,
  rewriteCrossSiteUrls,
  generateMultisitePrismaSchema,
  generateMultisiteScaffold,
} from "../src/index.js";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/wxr");

describe("Multisite E2E", () => {
  it("full pipeline: WXR directory → detect → merge → normalize → rewrite → scaffold", async () => {
    // Parse WXR files
    const mainStream = createReadStream(resolve(fixturesDir, "multisite-main.xml"), "utf-8");
    const subStream = createReadStream(resolve(fixturesDir, "multisite-sub.xml"), "utf-8");
    const mainWxr = await parseWxr(mainStream);
    const subWxr = await parseWxr(subStream);

    // Step 1: Detect multisite
    const network = detectMultisite([mainWxr, subWxr]);
    expect(network.mode).toBe("subdirectory");
    expect(network.sites).toHaveLength(2);

    // Step 2: Merge users
    const siteUserData = [
      { siteId: 1, users: mainWxr.users, posts: mainWxr.posts },
      { siteId: 2, users: subWxr.users, posts: subWxr.posts },
    ];
    const { sharedUsers, userConflicts } = mergeUsers(siteUserData);
    expect(sharedUsers.length).toBeGreaterThan(0);

    // admin@example.com appears in both: "Admin" vs "Administrator"
    const adminConflict = userConflicts.find((c) => c.email === "admin@example.com");
    expect(adminConflict).toBeDefined();
    expect(adminConflict!.resolved).toBe("Admin"); // main site priority

    // Step 3: Normalize media
    const subMedia = normalizeMedia(subWxr.media, 2);
    const legacyMedia = subMedia.media.find((m) => m.url.includes("blogs.dir"));
    expect(legacyMedia).toBeUndefined(); // should be normalized
    const normalizedMedia = subMedia.media.find((m) => m.url.includes("uploads/sites/2"));
    expect(normalizedMedia).toBeDefined();

    // Step 4: Rewrite cross-site URLs
    const mainPost = mainWxr.posts.find((p) => p.content.includes("site2"));
    expect(mainPost).toBeDefined();
    const { links } = rewriteCrossSiteUrls(mainPost!.content, 1, mainPost!.id, network.sites, "subpath");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]!.targetSiteId).toBe(2);

    // Step 5: Generate Prisma schema
    const prisma = generateMultisitePrismaSchema(network.sites);
    expect(prisma).toContain("model Site");
    expect(prisma).toContain("model Post");
    expect(prisma).toContain("@@index([siteId, slug])");

    // Step 6: Generate scaffold
    const remotePatterns = subMedia.remotePatterns;
    const scaffold = generateMultisiteScaffold({ sites: network.sites, mode: "subpath", remotePatterns });
    expect(scaffold.length).toBeGreaterThan(5);
    expect(scaffold.find((f) => f.path === "middleware.ts")).toBeDefined();
    expect(scaffold.find((f) => f.path === "lib/tenant.ts")).toBeDefined();
  });
});
```

- [ ] **Step 2: テスト実行**

Run: `npx vitest run packages/analyzer/tests/multisite-e2e.test.ts`
Expected: 全テストパス

- [ ] **Step 3: 全テストスイート確認**

Run: `npx vitest run`
Expected: 全テストパス (既存 479 + 新規 multisite テスト)

- [ ] **Step 4: 型チェック確認**

Run: `pnpm -r typecheck`
Expected: 全パス

- [ ] **Step 5: コミット**

```bash
git add packages/analyzer/tests/multisite-e2e.test.ts
git commit -m "test(analyzer): add Multisite E2E integration test (detect → merge → normalize → rewrite → scaffold)"
```

---

## Summary

| Task | Module | Tests |
|------|--------|-------|
| 1 | WxrParseResult blogUrl 追加 | 既存テスト確認 |
| 2 | Core Multisite 型定義 | typecheck |
| 3 | WXR Fixture (main + sub) | — |
| 4 | MultisiteDetector | 6 tests |
| 5 | UserMerger | 6 tests |
| 6 | MediaNormalizer | 5 tests |
| 7 | CrossSiteUrlRewriter | 7 tests |
| 8 | MultisitePrismaGenerator | 5 tests |
| 9 | MultisiteScaffoldGenerator | 7 tests |
| 10 | Analyzer エクスポート | typecheck + 全テスト |
| 11 | CLI 統合 | typecheck + 全テスト |
| 12 | E2E 統合テスト | 1 test (full pipeline) |
