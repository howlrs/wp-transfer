# wp-transfer 引き継ぎ資料

**バージョン:** v0.1.0-alpha
**日付:** 2026-04-09
**テスト:** 424 / 424 全パス (31ファイル)
**カバレッジ:** 91.5% lines, 80.4% branches
**リポジトリ:** https://github.com/howlrs/wp-transfer
**リリース:** https://github.com/howlrs/wp-transfer/releases/tag/v0.1.0-alpha
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
│                       # セキュリティサニタイザ
├── apps/
│   └── cli/            # CLIエントリーポイント (citty)
├── fixtures/           # WXRテストフィクスチャ (8 XML, 含500投稿544KB)
├── docs/               # 設計ドキュメント, 実装計画
├── .github/workflows/  # CI (test + typecheck + coverage + audit + build)
└── output/             # 生成物 (gitignored)
```

## CLIコマンド

```bash
# WXR/REST API解析 → 移行レポート + Gutenberg→PT変換
wp-transfer analyze <url|wxr-file> [--output path] [--format json|markdown|both]

# PHPソース解析 → 完全なNext.jsプロジェクト生成
wp-transfer analyze-php <dir> [--schema db-schema.md] [--output path]
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

### セキュリティ
- Phase 1: 18件修正 (SSRF, クレデンシャル, SAX, 型安全性)
- Issue #9: sanitize.ts (7関数), RCE/XSS/PathTraversal防止
- RBAC fail-safe default deny, API 401/403
- URL protocol検証, コード生成エスケープ, パストラバーサルガード
- DOMPurify sanitization for htmlBlocks

### テスト・品質基盤
- **424テスト, 31ファイル, 91.5%カバレッジ**
- CLI smokeテスト (--help, analyze実行, エラーケース)
- 500投稿WXR fixture (544KB) + パフォーマンステスト (150ms)
- E2E統合テスト (WXR parse → analyze → block convert → scaffold)
- スナップショットテスト (blog-scaffold, verify-scaffold)
- エラーハンドリングテスト (malformed XML, 空入力)
- wxr-parser collector テスト (media/site/taxonomy/user)
- CI: typecheck + test + coverage + security audit + build

### OSS公開
- v0.1.0-alpha GitHub Release
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
| 8 | ドッグフーディング: JRA tokyo | Closed |
| 9 | Security: コード生成サニタイズ不足 | Closed |
| 10 | Bug: Gutenbergパーサー edge case | Closed |
| 11 | Enhancement: Yoast/ACF 実運用強化 | Closed |
| 12 | Bug: 生成コード品質 (in-place sort等) | Closed |
| 13 | Bug: analyze-php コード生成ブロッカー | Closed |

## 次フェーズ: C. 機能拡充

### C-1: WooCommerce 対応 (EC サイト移行)
**優先度: 高** — WooCommerce は WordPress サイトの 30%+ で使用

対応内容:
- WooCommerce プラグイン検出 (woocommerce, wc-*)
- 商品 (product) カスタム投稿タイプの WXR パース
- 商品バリエーション, 属性, カテゴリの抽出
- Prisma スキーマ: 商品/注文/顧客モデル生成
- Next.js scaffold: 商品一覧/詳細/カート/チェックアウト
- Stripe/PayPal 連携スタブ

### C-2: WordPress マルチサイト対応
**優先度: 中** — 企業/大学などのネットワークサイト

対応内容:
- マルチサイト WXR エクスポートの分離パース
- サイト単位のスキーマ分析
- 共有テーブル (`wp_*`) とサイト固有テーブル (`wp_N_*`) の判別
- マルチサイト → Next.js マルチテナント scaffold

### C-3: i18n / WPML 対応
**優先度: 中** — 多言語サイトの移行パス

対応内容:
- WPML メタキー検出 (`wpml_*`, `icl_translations`)
- Polylang 対応 (taxonomy ベースの言語切り替え)
- Next.js i18n routing scaffold (App Router middleware)
- Portable Text locale フィールド活用

### 着手前の準備事項
1. 各機能の Issue 起票 (Gemini review 付き)
2. WooCommerce テストデータの WXR fixture 作成
3. plugin-registry.ts への WooCommerce/WPML/Polylang 追加
4. 各機能の設計 → 実装計画 → TDD サイクル

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

## ローカル開発

```bash
pnpm install
pnpm test               # 424テスト (全パッケージ + CLI)
pnpm -r typecheck       # 全パッケージ型チェック
pnpm -r build           # dist/ 生成
pnpm vitest run --config vitest.config.ts --coverage  # カバレッジ

# JRA tokyo再生成
pnpm --filter wp-transfer-cli dev analyze-php \
  /path/to/wp/tokyo \
  --schema /path/to/api/docs/database.md \
  --output output/jra-tokyo-v2

# 生成物の起動
cd output/jra-tokyo-v2
npm install && npx prisma db push && npx tsx prisma/seed.ts && npm run dev
```

## メモリ/ナレッジ

- SurrealDB (agents/agents) に全セッション記録あり
- `~/.claude/projects/-home-o9oem-workspace-mine-wp-transfer/memory/` に永続メモリ
- 設計文書: `docs/superpowers/specs/`
- 実装計画: `docs/superpowers/plans/`
