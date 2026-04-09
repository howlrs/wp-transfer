# C-2: WordPress マルチサイト対応 設計仕様

**日付:** 2026-04-09
**ステータス:** Draft
**関連:** HANDOFF.md C-phase ロードマップ, C-1 WooCommerce (完了), C-3 i18n (完了)

## スコープ

複数のサイト別 WXR ファイルをディレクトリ入力として受け取り、WordPress Multisite ネットワーク構造を自動検出。ユーザー重複解決・メディアパス正規化・サイト間リンク書き換えを行い、マルチテナント Next.js scaffold を生成する。

**スコープ内:**
- ディレクトリ入力による複数 WXR の一括パース
- `<wp:base_site_url>` / `<wp:base_blog_url>` 比較によるネットワーク構造自動検出 (subdomain/subdirectory)
- 複数 WXR 間のユーザー重複解決 (email 基準 dedupe + サイト別ロール分離)
- メディア URL パス正規化 (`blogs.dir/` → `uploads/sites/` フォールバック)
- サイト間内部リンクの検出・自動書き換え (Next.js ルート形式)
- 共有 DB + siteId カラム方式の Prisma スキーマ生成
- マルチテナント Next.js scaffold 生成 (subpath/subdomain 選択可能)
- CLI `analyze` コマンドへの `--multisite` / `--multisite-mode` オプション統合
- マルチサイト分析レポート (サイト一覧、ユーザーマージ結果、クロスサイトリンク)

**スコープ外:**
- ドメインマッピングの DNS/Vercel 設定生成
- ネットワーク有効化プラグインの検出 (WXR に情報なし)
- メディアファイルの物理移行 (URL 検出と remotePatterns 生成のみ)
- WooCommerce/i18n とのクロス機能 (将来拡張)
- WordPress REST API からのネットワーク情報取得

## 設計判断の根拠

1. **WXR ファーストの一貫性:** C-1/C-3 と同じく WXR 入力のみに依存。REST API やプラグイン前提を排除し、全 WordPress Multisite サイトで利用可能。ネットワーク設定は WXR ヘッダの `base_site_url` / `base_blog_url` 比較で推測する。
2. **ディレクトリ入力:** WP 標準にネットワーク一括エクスポート機能は存在しない。各サブサイトから個別にエクスポートした WXR 群をディレクトリにまとめて渡す運用が自然。
3. **共有 DB + siteId:** テナント分離戦略としてスキーマ分離や DB 分離は運用が複雑。siteId カラム方式は WordPress Multisite の `wp_N_*` テーブル構造からの移行として最もシンプルで、Prisma の `@@index` で性能も確保できる。
4. **subpath/subdomain 両対応:** WordPress Multisite 自体が両方式をサポートしており、移行先の Next.js scaffold も対応する必要がある。`--multisite-mode` フラグで選択し、scaffold 生成内容を切り替える。
5. **ユーザー重複解決の積極実施:** WordPress Multisite はユーザーをネットワーク共通で管理するが、サイト別 WXR には各サイトに属するユーザーとして出力される。マージしなければ移行先で同一人物が複数レコードになる。
6. **クロスサイトリンク自動書き換え:** WXR 上のサイト間リンクは絶対 URL。Next.js の `Link` コンポーネントに正しくマッピングするために自動書き換えが必要。検出のみでは移行後に大量のリンク切れが発生する。

## アーキテクチャ

```
入力: ディレクトリ (*.xml glob)
  │
  ▼
analyzer/multisite-detector.ts  ← NEW
  │  各 WXR の base_site_url / base_blog_url を比較
  │  - 一致 → メインサイト
  │  - base_blog_url がサブパス → subdirectory 型
  │  - base_blog_url がサブドメイン → subdomain 型
  │  - siteId 自動付与 (メイン=1, 以降連番)
  ▼
analyzer/user-merger.ts  ← NEW
  │  全 WXR のユーザーを email 基準で dedupe
  │  - 同一 email → マージ (最新情報優先)
  │  - サイト別ロール → UserSiteRole に分離
  │  - 衝突レポート生成 (名前不一致等)
  ▼
analyzer/media-normalizer.ts  ← NEW
  │  メディア URL パスを正規化
  │  - blogs.dir/{id}/files/ → uploads/sites/{id}/
  │  - siteId をメディアレコードに付与
  │  - next.config.js remotePatterns 生成
  ▼
analyzer/cross-site-url-rewriter.ts  ← NEW
  │  コンテンツ内のサイト間リンクを Next.js ルートに書き換え
  │  - 全サイトの baseUrl をマップ化
  │  - コンテンツ内 URL を走査
  │  - マッチ → subpath or subdomain 形式に変換
  │  - CrossSiteLink レコード生成
  ▼
analyzer/multisite-prisma-generator.ts  ← NEW
  │  共有 DB + siteId の Prisma スキーマ生成
  │  - Site, Post, User, UserSiteRole, Media モデル
  │  - siteId インデックス
  ▼
analyzer/multisite-scaffold-generator.ts  ← NEW
  │  マルチテナント Next.js scaffold 生成
  │  - subpath: app/[site]/... + middleware (パスからテナント解決)
  │  - subdomain: app/... + middleware (Host ヘッダーからテナント解決)
  │  - lib/tenant.ts (テナントコンテキスト)
  ▼
CLI (既存 analyze コマンドに --multisite オプション統合)
```

## 新規ファイル

### core パッケージ (型定義追加)

| ファイル | 責務 |
|---------|------|
| `types/multisite.ts` | WpSite, MultisiteNetwork, MultisiteConfig, CrossSiteLink 型定義 |

### analyzer パッケージ

| ファイル | 責務 |
|---------|------|
| `multisite-detector.ts` | WXR 群からネットワーク構造を自動検出、WpSite[] 生成 |
| `user-merger.ts` | 複数 WXR 間のユーザー dedupe + サイト別ロール分離 |
| `media-normalizer.ts` | メディア URL パス正規化 (blogs.dir → uploads/sites) |
| `cross-site-url-rewriter.ts` | サイト間リンク検出 + Next.js ルート書き換え |
| `multisite-prisma-generator.ts` | 共有 DB + siteId の Prisma スキーマ生成 |
| `multisite-scaffold-generator.ts` | マルチテナント Next.js scaffold 生成 |

### fixtures

| ファイル | 責務 |
|---------|------|
| `fixtures/wxr/multisite-main.xml` | メインサイト WXR (サブサイトへのリンク含む) |
| `fixtures/wxr/multisite-sub.xml` | サブサイト WXR (レガシーメディアパス、メインへのリンク含む) |

## 型定義

```typescript
/** マルチサイトネットワーク内の1サイト */
interface WpSite {
  siteId: number;        // 自動付与 (メイン=1, サブ=2,3...)
  slug: string;          // テナント識別子 (path or subdomain から生成, メイン="main")
  title: string;         // <title> from WXR channel
  baseUrl: string;       // <wp:base_blog_url>
  networkUrl: string;    // <wp:base_site_url>
  path: string;          // "/" (メイン), "/site2/" (subdirectory)
  subdomain?: string;    // "site2" (subdomain型の場合)
  posts: WpPost[];
  users: WpUser[];
  media: WpMedia[];
  taxonomies: WpTaxonomy[];
}

/** ネットワーク全体の検出結果 */
interface MultisiteNetwork {
  mode: "subdomain" | "subdirectory" | "unknown";
  networkUrl: string;    // 共通の base_site_url
  sites: WpSite[];
  sharedUsers: MergedUser[];
  userConflicts: UserConflict[];
  crossSiteLinks: CrossSiteLink[];
}

/** dedupe 済みユーザー */
interface MergedUser {
  id: number;            // 新規採番
  email: string;         // dedupe キー
  name: string;          // 最新を優先
  siteRoles: { siteId: number; role: string }[];
}

/** ユーザーマージ時の衝突情報 */
interface UserConflict {
  email: string;
  field: string;         // "name", "login" 等
  values: { siteId: number; value: string }[];
  resolved: string;      // 採用した値
}

/** サイト間リンクの書き換え記録 */
interface CrossSiteLink {
  sourceSiteId: number;
  targetSiteId: number;
  sourcePostId: number;
  originalUrl: string;
  rewrittenPath: string;
}

/** CLI 設定 */
interface MultisiteConfig {
  scaffoldMode: "subpath" | "subdomain";
}
```

## ネットワーク構造検出ロジック

### base_site_url / base_blog_url 比較

各 WXR の `<channel>` セクションから以下を抽出:
- `<wp:base_site_url>`: ネットワークのルート URL
- `<wp:base_blog_url>`: そのサイトの URL

比較ロジック:
1. `base_site_url === base_blog_url` → メインサイト (siteId=1)
2. `base_blog_url` が `base_site_url` のサブパス → subdirectory 型
   - 例: site_url=`https://example.com`, blog_url=`https://example.com/site2/` → path="/site2/"
3. `base_blog_url` のドメインが `base_site_url` のサブドメイン → subdomain 型
   - 例: site_url=`https://example.com`, blog_url=`https://site2.example.com` → subdomain="site2"
4. いずれにも該当しない → mode="unknown" (独立ドメインマッピング等)

### siteId 付与

- メインサイト (base_site_url === base_blog_url) → siteId=1
- サブサイト → パスまたはサブドメインのアルファベット順で 2, 3, ... を付与
- メインサイトが見つからない場合 → 最初の WXR を siteId=1 とする

### slug 生成

- メインサイト → slug="main"
- subdirectory 型 → path の最後のセグメントを slug に使用 (例: "/site2/" → "site2")
- subdomain 型 → サブドメインを slug に使用 (例: "site2.example.com" → "site2")
- slug が空・重複する場合 → "site-{siteId}" にフォールバック
- slug は `[a-z0-9-]+` パターンに正規化 (sanitizeSlug 既存関数を活用)

### URL バリデーション

WXR から取得した `base_site_url` / `base_blog_url` およびメディア URL のホスト名は FQDN バリデーションを実施:
- 有効なホスト名パターンに一致するか検証
- プライベート IP / localhost / 非 HTTP(S) プロトコルを拒否 (既存の SSRF 防御パターン踏襲)
- バリデーション失敗時は警告ログを出力し、該当 WXR をスキップ

### ディレクトリ入力のパス安全性

CLI から受け取ったディレクトリパスは `path.resolve()` で絶対パスに変換後、パストラバーサルチェックを実施:
- `../../` による意図しないディレクトリへのアクセスを防止
- glob 結果の各ファイルパスが指定ディレクトリ配下であることを検証

## ユーザーマージロジック

1. 全 WXR からユーザーを収集 (`WpUser[]` × サイト数)
2. dedupe キー: email を優先。email が空の場合は login (ユーザー名) にフォールバック
3. 同一キーのユーザー群からマージ:
   - `name`: メインサイト (siteId=1) の値をマスターとして優先
   - `login`: 同上
   - メインサイトに該当ユーザーがいない場合 → siteId が最小のサイトの値を採用
   - 衝突がある場合 → `UserConflict` レコード生成
4. サイト別ロール:
   - WXR の `<wp:author>` にはロール情報がないため、各サイトの投稿から推定
   - 投稿が存在するサイトに対して "contributor" をデフォルト付与
   - ロール精度の限界はレポートに注記
5. 出力: `MergedUser[]` + `UserConflict[]`

## メディアパス正規化ロジック

WordPress Multisite のメディアパスは歴史的に2形式が存在:
- **WP 3.5 以降:** `wp-content/uploads/sites/{site_id}/YYYY/MM/filename`
- **WP 3.5 以前:** `wp-content/blogs.dir/{site_id}/files/YYYY/MM/filename`

正規化処理:
1. メディア URL を走査
2. `blogs.dir/{id}/files/` パターンにマッチ → `uploads/sites/{id}/` に変換
3. siteId をメディアレコードに付与
4. `next.config.js` の `remotePatterns` に全サイトのドメインを追加
5. 変換しなかった URL はそのまま保持 (fail-safe)

## クロスサイト URL 書き換えロジック

1. MultisiteDetector の結果から全サイトの baseUrl → siteId マップを構築
2. 各サイトの全投稿の content を走査
3. `href="..."` 内の URL を抽出
4. URL が他サイトの baseUrl にマッチ → Next.js ルートに書き換え:
   - **subpath モード:** `/site2/blog/post-slug` (テナントパス + 相対パス)
   - **subdomain モード:** `/blog/post-slug` (同一ドメイン内相対パス。テナント解決は middleware)
5. 外部 URL (ネットワーク外) はスキップ
6. 書き換え結果を `CrossSiteLink[]` として記録 (メモリ上の一時データ、レポート出力用。Prisma には永続化しない)
7. URL パスからスラッグを抽出する際、WordPress のパーマリンク構造を考慮:
   - `/YYYY/MM/DD/slug/` (日付ベース) → 末尾セグメントを slug として抽出
   - `/archives/id` (ID ベース) → 変換不可、元 URL を保持し警告
   - `/slug/` (ポスト名) → そのまま slug として使用
   - `/category/slug/post-slug/` (カテゴリ付き) → 末尾セグメントを slug として抽出

## Prisma スキーマ

```prisma
model Site {
  id          Int      @id @default(autoincrement())
  slug        String   @unique
  title       String
  domain      String?
  path        String   @default("/")
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
```

## テナントデータ分離

共有 DB + siteId 方式では、クエリ時に `where: { siteId }` の付け忘れが他サイトのデータ漏洩につながる。scaffold の `lib/tenant.ts` で Prisma Client Extensions を使用し、自動的に siteId スコープが適用される安全なクライアントを提供する:

```typescript
// lib/tenant.ts (生成コード概要)
export function getTenantPrisma(siteId: number) {
  return prisma.$extends({
    query: {
      post: { async findMany({ args, query }) {
        args.where = { ...args.where, siteId };
        return query(args);
      }},
      // media, userSiteRole にも同様に適用
    },
  });
}
```

scaffold 内の全データアクセスはこの拡張クライアント経由とし、素の `prisma` を直接使用しない設計にする。

## Scaffold 生成ファイル

### subpath モード (`--multisite-mode subpath`)

| パス | 内容 |
|------|------|
| `middleware.ts` | パスの第1セグメントからテナント slug を解決、不明 slug は 404 |
| `lib/tenant.ts` | `getTenant(slug)` — Prisma で Site 取得、コンテキスト提供 |
| `lib/prisma.ts` | Prisma client (既存パターン踏襲) |
| `app/[site]/layout.tsx` | テナント解決 + サイトタイトル表示 |
| `app/[site]/page.tsx` | サイトトップ (最新投稿一覧) |
| `app/[site]/blog/page.tsx` | 投稿一覧 (siteId フィルタ) |
| `app/[site]/blog/[slug]/page.tsx` | 投稿詳細 |
| `app/page.tsx` | ネットワークトップ (サイト一覧) |
| `next.config.js` | remotePatterns (全サイトドメイン) |
| `prisma/schema.prisma` | 上記 Prisma スキーマ |

### subdomain モード (`--multisite-mode subdomain`)

| パス | 内容 |
|------|------|
| `middleware.ts` | Host ヘッダーからテナント slug を解決、不明ドメインは 404 |
| `lib/tenant.ts` | `getTenant(hostname)` — ドメインから Site 取得 |
| `lib/prisma.ts` | Prisma client |
| `app/layout.tsx` | テナント解決 + サイトタイトル表示 |
| `app/page.tsx` | サイトトップ (最新投稿一覧) |
| `app/blog/page.tsx` | 投稿一覧 (siteId フィルタ) |
| `app/blog/[slug]/page.tsx` | 投稿詳細 |
| `next.config.js` | remotePatterns (全サイトドメイン) |
| `prisma/schema.prisma` | 上記 Prisma スキーマ |

## Fixture 要件

### `fixtures/wxr/multisite-main.xml` — メインサイト

- `<wp:base_site_url>`: `https://example.com`
- `<wp:base_blog_url>`: `https://example.com`
- `<title>`: "Main Site"
- 投稿 2 件 (post_type="post", status="publish")
  - 1 件目の content に `https://example.com/site2/hello-from-sub/` へのリンク
- ユーザー 2 名:
  - admin@example.com (display_name="Admin")
  - editor@example.com (display_name="Editor")
- メディア 1 件: URL に `wp-content/uploads/2024/01/main-image.jpg` (通常パス)
- カテゴリ 1 件

### `fixtures/wxr/multisite-sub.xml` — サブサイト (subdirectory 型)

- `<wp:base_site_url>`: `https://example.com`
- `<wp:base_blog_url>`: `https://example.com/site2`
- `<title>`: "Sub Site"
- 投稿 2 件 (post_type="post", status="publish")
  - 1 件目の content に `https://example.com/welcome-to-main/` へのリンク
- ユーザー 2 名:
  - admin@example.com (display_name="Administrator" ← メインと名前不一致)
  - writer@example.com (display_name="Writer")
- メディア 1 件: URL に `wp-content/blogs.dir/2/files/2024/01/sub-image.jpg` (レガシーパス)
- カテゴリ 1 件

## テスト戦略

| テストファイル | 内容 |
|---------------|------|
| `multisite-detector.test.ts` | subdirectory 検出、subdomain 検出、unknown fallback、メインサイト判定、siteId 付与順序 |
| `user-merger.test.ts` | email dedupe、名前衝突レポート、サイト別ロール付与、空ユーザー処理 |
| `media-normalizer.test.ts` | blogs.dir→uploads/sites 正規化、通常パス保持、siteId 付与、remotePatterns 生成 |
| `cross-site-url-rewriter.test.ts` | サイト間リンク検出、subpath/subdomain 両モード書き換え、外部 URL スキップ、パーマリンク構造対応 |
| `multisite-prisma-generator.test.ts` | Site/Post/User/UserSiteRole/Media モデル生成、siteId インデックス |
| `multisite-scaffold-generator.test.ts` | subpath/subdomain モード別 scaffold、middleware、tenant.ts、ネットワークトップ |
| `multisite-e2e.test.ts` | ディレクトリ入力 → detect → merge → normalize → rewrite → scaffold の統合テスト |

## CLI 統合

```bash
# ディレクトリ指定 + --multisite フラグ
wp-transfer analyze ./wxr-exports/ --multisite [--multisite-mode subpath|subdomain]
```

### 判定ロジック

1. 引数がディレクトリ → `*.xml` を glob で収集
2. `--multisite` フラグあり → MultisiteDetector 起動
3. `--multisite-mode` 未指定 → 検出結果から自動推測、unknown なら subpath fallback
4. 引数がディレクトリだが `--multisite` なし → エラーメッセージ (明示的に要求)
5. 引数がファイル/URL → 従来の単一サイト解析 (既存動作)

### レポート出力

マルチサイト検出時、既存レポートに以下セクションを追加:

```
## Multisite Network
- Mode: subdirectory
- Network URL: https://example.com
- Sites: 2

### Sites
| # | Title | Path | Posts | Media |
|---|-------|------|-------|-------|
| 1 | Main Site | / | 2 | 1 |
| 2 | Sub Site | /site2/ | 2 | 1 |

### User Merge Report
- Total unique users: 3 (from 4 entries across 2 sites)
- Conflicts: 1 (admin@example.com — name: "Admin" vs "Administrator" → "Administrator")

### Cross-Site Links
- 2 internal links detected and rewritten
- 1 link from Site 1 → Site 2
- 1 link from Site 2 → Site 1
```

## 拡張ポイント (将来)

- **C-1 WooCommerce × Multisite:** サイト別商品カタログ (Product.siteId)
- **C-3 i18n × Multisite:** サイト単位のロケール設定 (`[locale]/[site]/...`)
- **ドメインマッピング設定ファイル:** Vercel domains.json / nginx conf 生成
- **ネットワーク管理画面 scaffold:** サイト管理 CRUD
