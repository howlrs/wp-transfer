# wp-transfer 引き継ぎ資料

**バージョン:** v0.4.0-alpha
**日付:** 2026-04-10
**テスト:** 901 / 901 全パス (66ファイル)
**カバレッジ:** 92.1% lines, 81.3% branches
**リポジトリ:** https://github.com/howlrs/wp-transfer
**リリース:** https://github.com/howlrs/wp-transfer/releases/tag/v0.3.1-alpha
**ライセンス:** MIT

## プロジェクト概要

WordPress サイト（Plugin含む）を TypeScript/Next.js に移行する「移行アクセラレータ」CLIツール。
エージェンシー/制作会社が顧客サイトを移行するためのツールチェーン。

## アーキテクチャ

```
wp-transfer (pnpm monorepo)
├── packages/
│   ├── core/           # 型定義 (Zod), Portable Text型, シークレットスキャナ
│   ├── wxr-parser/     # SAXストリーミングWXRパーサー
│   └── analyzer/       # REST client, Plugin検出, スキーマ分析,
│                       # Gutenberg→PT変換, Yoast/ACF テンプレート,
│                       # Blog/Admin/Auth/Docker scaffold, Verify生成,
│                       # WooCommerce商品変換, i18n検出, Multisite検出,
│                       # セキュリティサニタイザ
├── apps/
│   └── cli/            # CLIエントリーポイント (citty)
├── fixtures/           # WXRテストフィクスチャ (12 XML, 含500投稿544KB)
├── docs/               # 設計ドキュメント, 実装計画
├── .github/workflows/  # CI (test + typecheck + coverage + audit + build)
└── output/             # 生成物 (gitignored)
```

## CLIコマンド

```bash
# WXR/REST API解析 → 移行レポート + Gutenberg→PT変換
wp-transfer analyze <url|wxr-file> [--output path] [--format json|markdown|both]

# マルチサイト解析 → マルチテナント scaffold
wp-transfer analyze <directory> --multisite [--multisite-mode subpath|subdomain]

# PHPソース解析 → 完全なNext.jsプロジェクト生成
wp-transfer analyze-php <dir> [--schema db-schema.md] [--output path]

# AI補助付きPHP解析 → 高品質APIルート生成 (Claude Code CLI plan auth, 追加コスト$0)
wp-transfer analyze-php <dir> --schema db-schema.md --ai-assist [--ai-model model]

# 対話式モード
wp-transfer analyze --interactive

# テンプレートカスタマイズ
wp-transfer analyze <file.xml> --templates ./my-templates/

# ワンコマンド移行検証 (生成済みプロジェクト)
wp-transfer run output/client-a                  # 全自動: install → Docker → migrate → seed → test
wp-transfer run output/client-a --no-docker      # Docker スキップ
wp-transfer run output/client-a --open           # テスト後にレポートを開く
```

## 技術スタック

| 技術 | バージョン | 用途 |
|------|-----------|------|
| TypeScript | 6.0.2 | 言語 |
| Node.js | 20+ LTS | ランタイム |
| pnpm | 10.33.0 | パッケージ管理 |
| citty | 0.2.2 | CLI |
| consola | 3.4.2 | ログ |
| sax | 1.6.0 | WXRパース (XXE-safe) |
| node-html-parser | 7.x | ネストリスト解析 (ReDoS防止) |
| ofetch | 1.5.1 | REST API (SSRF防御, 30sタイムアウト) |
| zod | 4.3.6 | スキーマバリデーション |
| vitest | 4.1.3 | テスト + カバレッジ (@vitest/coverage-v8) |
| @portabletext/types | 4.0.2 | Portable Text型 |

## 完了済み機能

### コア機能
- WXRストリーミングパーサー (post, taxonomy, user, media collectors)
- WP REST APIクライアント (SSRF防御, クレデンシャル漏洩防止)
- プラグイン検出 + レジストリ (17+ known plugins)
- スキーマ分析 (ACFフィールド検出, Yoast/RankMath検出)
- コスト見積 + リスク分析
- 移行レポート生成 (JSON/Markdown)
- シークレットスキャナ (AWS, GitHub, Stripe, Google, WP salts等)

### analyze-php (PHPソース直接解析)
- PHPファイル解析 (DB操作, 入力パラメータ, セキュリティ問題)
- DBスキーマMarkdown → Prismaスキーマ (リレーション自動検出, PK自動判定フォールバック)
- Next.js API Routeスタブ生成 (Zod精度, PUT/DELETE Zodスキーマ, トランザクション検出, ファイルアップロード)
- 管理画面scaffold自動生成 (一覧, フォーム, ダッシュボード, Tailwind対応, テーブルカラムフォールバック)
- 認証scaffold自動生成 (NextAuth v5 + RBAC fail-safe)
- Docker scaffold自動生成 (Compose + Dockerfile, npm統一)

### Gutenberg → Portable Text 変換
- ブロックコメントパーサー (ネストJSON, brace-balanced, Global Styles対応)
- ブロック→PT変換 (paragraph/heading/list/image/code/embed/quote/separator)
- **ネストリスト対応** (node-html-parser DOM再帰パーサー, level追跡)
- **`<br>`タグ → 改行スパン変換**
- **HTMLエンティティ完全デコード** (25名前付き + 数値参照 + フォールバック)
- **Groupブロック再帰展開**, **Reusable Block参照** (WptReferenceBlock)
- インラインHTML→PTマーク/スパン (bold, italic, link with markDef)
- 未知ブロック→htmlBlock (DOMPurifyサニタイズ付き)

### テンプレート生成
- Yoast SEOメタデータ抽出 (%%var%%プレースホルダー解決, 9変数対応, Next.js Metadata API)
- **Rank Math SEO統合** (extractSeoMeta() で Yoast/Rank Math 統一処理)
- ACFテンプレート生成 (Zodスキーマ + 型付きアクセサ, **Repeater/Gallery推論**)
- WXRブログscaffold (投稿/アーカイブ/カテゴリ/404/PT renderer/next.config)
- **大規模サイト対応** (100件超は1投稿=1JSONファイルのファイル分割方式)
- **生成コード品質**: 非破壊ソート, 空カテゴリメッセージ, protocol-aware remotePatterns
- Playwright Verify scaffold (スモークテスト + ビルド検証)

### C-1: WooCommerce 商品カタログ移行
- WXR から商品 (simple/variable/grouped/external) 抽出・正規化
- PHP serialize パーサー (インデックス走査, ReDoS-safe)
- ProductTransformer: 商品ツリー構築 (親子紐付け, 属性マージ)
- WooPrismaGenerator: 正規化 Prisma スキーマ (Product, Variation, Attribute, Category)
- WooScaffoldGenerator: Next.js EC scaffold (商品一覧/詳細/カテゴリ/カート/チェックアウトスタブ)
- CLI analyze コマンド統合 (WooCommerce 自動検出)

### C-2: WordPress Multisite 対応
- ディレクトリ入力による複数 WXR 一括パース
- MultisiteDetector: base_site_url/base_blog_url 比較で subdomain/subdirectory 自動判定
- UserMerger: email 基準 dedupe (case-insensitive) + サイト別ロール分離 + 衝突レポート
- MediaNormalizer: blogs.dir → uploads/sites パス正規化
- CrossSiteUrlRewriter: サイト間リンク検出・自動書き換え (subpath/subdomain 両モード)
- MultisitePrismaGenerator: 共有 DB + siteId カラム方式
- MultisiteScaffoldGenerator: マルチテナント Next.js scaffold (Prisma Client Extensions)
- CLI --multisite / --multisite-mode オプション

### C-3: i18n / WPML・Polylang 対応
- WPML 検出 (wpml_language メタキー)
- Polylang 検出 (language タクソノミー)
- 投稿への locale 付与 + locale リスト抽出
- Next.js App Router [locale] i18n routing scaffold (middleware + config)
- CLI analyze コマンド統合 (i18n 自動検出)

### E-Phase: カスタムフィールド拡充
- ACF Pro: WXR からフィールド定義抽出 (Flexible Content, Group, Clone, Nested Repeater)
- ACF Pro: 定義ベース Zod スキーマ生成 (discriminatedUnion, ネスト object)
- Meta Box: post_meta カスタムフィールド検出 + 型推論
- Pods: _pods_* メタキー検出 + Table Storage 警告

### E-Phase: ページビルダー・WooCommerce拡張・クロス機能
- Elementor/Divi/WPBakery 検出 + Widget使用頻度分析 + 移行ガイドMarkdown生成
- WooCommerce REST API クライアント (注文/顧客データ取得, HTTPS必須, ページネーション)
- Order/Customer/OrderItem Prisma スキーマ生成
- クロス機能: WooCommerce×Multisite (siteId), WooCommerce×i18n ([locale]), i18n×Multisite

### G-Phase: DX改善
- --interactive フラグ (対話式ウィザード)
- --templates フラグ (テンプレートオーバーライド, パストラバーサル防止)

### AI Assist (--ai-assist)
- **Primary**: Claude Code CLI subprocess (plan auth, 追加コストなし)
- **Fallback**: Claude API direct call (ANTHROPIC_API_KEY)
- 機密情報マスキング + マークダウン除去 + 出力検証
- 指数バックオフリトライ + 並列制御 + 巨大ファイルガード
- Client A: 24/25ルート AI生成, CRITICAL 6件全解消, $0追加コスト

### セキュリティ
- Phase 1: 18件修正 (SSRF, クレデンシャル, SAX, 型安全性)
- Issue #9: sanitize.ts (7関数), RCE/XSS/PathTraversal防止
- RBAC fail-safe default deny, API 401/403
- URL protocol検証, コード生成エスケープ, パストラバーサルガード
- DOMPurify sanitization for htmlBlocks

### テスト・品質基盤
- **901テスト, 66ファイル, 89.7%カバレッジ (analyzerパッケージ)**
- Client A 規模の全パイプライン統合テスト (69ケース: preflight→解析→Prisma→API→CRUD→verify→dashboard→Docker→整合性)
- CLI smokeテスト (--help, analyze実行, エラーケース)
- 500投稿WXR fixture (544KB) + パフォーマンステスト (150ms)
- E2E統合テスト (WXR parse → analyze → block convert → scaffold)
- スナップショットテスト (blog-scaffold, verify-scaffold)
- エラーハンドリングテスト (malformed XML, 空入力)
- wxr-parser collector テスト (media/site/taxonomy/user)
- CI: typecheck + test + coverage + security audit + build

### OSS公開
- v0.1.0-alpha → v0.2.0-alpha → v0.3.0-alpha → v0.3.1-alpha GitHub Release
- README (英語, Quick Start, コマンドリファレンス)
- MIT LICENSE + 全package.json整備
- GitHub Actions CI

## Issue一覧

| # | タイトル | 状態 |
|---|---------|------|
| 1 | RFC: 全体アーキテクチャ方針 | Closed |
| 2 | Phase 1-1: WPサイト解析 (Analyze) | Closed |
| 3 | Phase 1-2: コンテンツ Extract + Transform | Closed |
| 4 | Phase 1-3: 変換テンプレート (ACF, Yoast) | Closed |
| 5 | Phase 1-4: Next.js scaffold生成 | Closed |
| 6 | 12名専門家パネル統合方針 | Closed |
| 7 | Karpathy原則レビュー: 18件修正 | Closed |
| 8 | ドッグフーディング: Client A | Closed |
| 9 | Security: コード生成サニタイズ不足 | Closed |
| 10 | Bug: Gutenbergパーサー edge case | Closed |
| 11 | Enhancement: Yoast/ACF 実運用強化 | Closed |
| 12 | Bug: 生成コード品質 (in-place sort等) | Closed |
| 13 | Bug: analyze-php コード生成ブロッカー | Closed |
| 14 | C-1: WooCommerce 商品カタログ移行 | Closed |
| 15 | C-3: i18n / WPML・Polylang 対応 | Closed |
| 16 | E-Phase: カスタムフィールド拡充 (ACF Pro/Meta Box/Pods) | Closed |
| 17 | E-Phase: ページビルダー/WooCommerce注文/クロス機能/DX | Closed |
| 18 | Fix: analyze-php品質改善 + AI Assist | Closed |
| 19 | Fix: AI Assist CLI auth + CRITICAL #6 解消 | Closed |
| 20 | APIルート CRUD完全性 — GET自動生成 | Closed |
| 21 | Zodスキーマ自動生成改善 — UPDATE .partial() | Closed |
| 22 | DELETE soft-delete/hard-delete検出 | Closed |
| 23 | ループ/バッチ処理検出 — foreach→createMany | Closed |
| 24 | 生成物セキュリティ強化 — .env廃止, .gitignore | Closed |
| 25 | Docker/DX改善 — .dockerignore, /api/health | Closed |
| 26 | pluralize修正 + Yoastプレースホルダー | Closed |
| 27 | Elementor JSON → React部分変換 | Closed |
| 28 | analyze-php E2E統合テスト | Closed |
| 29 | Pre-flight Check + Migration Config | Closed |
| 30 | ジェネレーター共通基盤リファクタ | Closed |
| 31 | ACF Options + 大規模サイトストリーミング | Closed |
| 32 | Playwright テストスイート強化 (API/Auth/Admin) | Closed |
| 33 | ワンコマンド移行体験 — `run` コマンド | Closed |
| 34 | package.json 強化 — Playwright/tsx/scripts | Closed |
| 35 | 移行品質 HTML ダッシュボード | Closed |

### PDCA改善サイクル (v0.3.1 → v0.4.0)

5サイクルのPDCAで Issues #20-#35 を実装:
- **Cycle 1**: セキュリティ, pluralize修正, 共通基盤 (#24,#26,#30)
- **Cycle 2**: DELETE検出, ループ検出, Docker/DX (#22,#23,#25)
- **Cycle 3**: GET生成, Zod .optional(), E2Eテスト (#20,#21,#28)
- **Cycle 4**: Elementor, Pre-flight, ACF Options (#27,#29,#31)
- **Cycle 5**: Playwright強化, ワンコマンドrun, ダッシュボード (#32,#33,#34,#35)

## 次フェーズ: 候補

### CLI統合 (未統合の生成済みモジュール)
- migration-dashboard HTML を analyze-php/analyze コマンドに統合
- pre-flight checks を analyze-php/analyze 起動時に自動実行
- migration-config ファイル読み込み (--config フラグ)
- verify scaffold に API/Auth/Admin テストスペック統合
- ACF Options extractor を analyze コマンドに統合

### 実運用強化
- Pods Table Storage 対応 (独自テーブルからのデータ抽出)
- WooCommerce REST API OAuth 1.0a 認証 (HTTP環境対応)
- 差分移行 (初回移行後の増分更新)

### エコシステム
- VS Code 拡張 (移行レポートのプレビュー)
- GitHub Action (CI/CDパイプラインへの組み込み)

## 重要な設計判断

1. **移行アクセラレータ**: 完全自動移行ではなく、scaffoldと分析で開発者を支援
2. **WXR Zero Trust**: 入力データは全て悪意ある可能性を前提にサニタイズ
3. **sax primary**: OOM防止のためストリーミングパーサーを優先
4. **fail-safe RBAC**: 未登録パスはadministratorのみアクセス可能
5. **UiFramework option**: plain/tailwind 選択可能なscaffold出力
6. **Gemini CLIレビュー**: 毎タスク完了時にGemini Proでレビュー (計8回実施)
7. **node-html-parser**: ネストリスト解析にDOMパーサーを採用 (ReDoS防止)
8. **Rank Math統合**: Yoast/Rank Mathを統一 `extractSeoMeta()` で処理
9. **大規模サイト対応**: 100件超は1投稿=1JSONファイルのファイル分割方式
10. **Prisma PK fallback**: id → table_id → @@id(複合) → 最初のカラム
11. **Multisite共有DB**: siteIdカラム方式 + Prisma Client Extensions で自動スコーピング
12. **Multisiteテナント両対応**: subpath/subdomain をCLIフラグで選択、自動検出も対応
13. **ユーザーdedupe**: email基準(case-insensitive) + loginフォールバック、メインサイト優先
14. **AI Assist**: Claude Code CLI plan auth 第一、API Key フォールバック。追加コスト$0
15. **テンプレート修正 + AI 二段構え**: 静的解析の限界(ループ検出等)をLLMで補完する仕組み化

## ローカル開発

```bash
pnpm install
pnpm test               # 631テスト (全パッケージ + CLI)
pnpm -r typecheck       # 全パッケージ型チェック
pnpm -r build           # dist/ 生成
pnpm vitest run --config vitest.config.ts --coverage  # カバレッジ

# Client A再生成 (静的解析のみ)
pnpm --filter wp-transfer-cli dev analyze-php \
  /path/to/wp/site \
  --schema /path/to/api/docs/database.md \
  --output output/client-a

# Client A再生成 (AI Assist付き — 高品質APIルート, 追加コスト$0)
pnpm --filter wp-transfer-cli dev analyze-php \
  /path/to/wp/site \
  --schema /path/to/api/docs/database.md \
  --output output/client-a --ai-assist

# 生成物の起動
cd output/client-a
npm install && npx prisma db push && npx tsx prisma/seed.ts && npm run dev
```

## メモリ/ナレッジ

- SurrealDB (agents/agents) に全セッション記録あり
- `~/.claude/projects/-home-o9oem-workspace-mine-wp-transfer/memory/` に永続メモリ
- 設計文書: `docs/superpowers/specs/`
- 実装計画: `docs/superpowers/plans/`
