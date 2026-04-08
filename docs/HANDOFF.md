# wp-transfer 引き継ぎ資料

**バージョン:** v0.1.0-alpha
**日付:** 2026-04-08
**テスト:** 329 / 329 全パス
**リポジトリ:** https://github.com/howlrs/wp-transfer

## プロジェクト概要

WordPress サイト（Plugin含む）を TypeScript/Next.js に移行する「移行アクセラレータ」CLIツール。
エージェンシー/制作会社が顧客サイトを完全移行するためのツールチェーン。

## アーキテクチャ

```
wp-transfer (pnpm monorepo)
├── packages/
│   ├── core/           # 型定義 (Zod), シークレットスキャナ
│   ├── wxr-parser/     # SAXストリーミングWXRパーサー
│   └── analyzer/       # REST client, Plugin検出, スキーマ分析,
│                       # レポート生成, PHP解析, スタブ生成,
│                       # Admin/Auth/Docker scaffold
├── apps/
│   └── cli/            # CLIエントリーポイント (citty)
├── fixtures/           # WXRテストフィクスチャ
├── docs/               # 設計ドキュメント, WPバージョン対応表
└── output/             # 生成物 (gitignored)
```

## CLIコマンド

```bash
# WXR/REST API解析 → 移行レポート
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
| ofetch | 1.5.1 | REST API (SSRF防御, 30sタイムアウト) |
| zod | 4.3.6 | スキーマバリデーション |
| vitest | 4.1.3 | テスト |
| @portabletext/types | 4.0.2 | Portable Text型 |

## 完了済み (Phase 1)

### コア機能
- [x] WXRストリーミングパーサー (post, taxonomy, user, media collectors)
- [x] WP REST APIクライアント (SSRF防御, クレデンシャル漏洩防止)
- [x] プラグイン検出 + レジストリ (17+ known plugins)
- [x] スキーマ分析 (ACFフィールド検出, Yoast/RankMath検出)
- [x] コスト見積 + リスク分析
- [x] 移行レポート生成 (JSON/Markdown)
- [x] シークレットスキャナ (AWS, GitHub, Stripe, Google, WP salts等)

### analyze-php (PHPソース直接解析)
- [x] PHPファイル解析 (DB操作, 入力パラメータ, セキュリティ問題)
- [x] DBスキーマMarkdown → Prismaスキーマ (リレーション自動検出)
- [x] Next.js API Routeスタブ生成 (Zod精度, トランザクション検出, ファイルアップロード)
- [x] 管理画面scaffold自動生成 (一覧, フォーム, ダッシュボード)
- [x] 認証scaffold自動生成 (NextAuth v5 + RBAC)
- [x] Docker scaffold自動生成 (Compose + Dockerfile)
- [x] PHPバージョン検出 (10パターン)

### セキュリティ (Karpathy原則レビュー)
- [x] 18件修正 (Critical 1, High 4, Medium 6, Low 7)
- [x] SSRF防御, クレデンシャル保護, SAXエラー処理, 型安全性

### ドッグフーディング (JRA tokyo)
- [x] 39 PHPファイル → 17 API Routes + 16管理画面ページ
- [x] 21テーブル Prismaスキーマ (リレーション付き)
- [x] NextAuth + RBAC (3プラグイン統合移行)
- [x] Docker環境 (MySQL 8.0 + Next.js)
- [x] E2E APIテスト 15件

### C-Phase: Phase 1 MVP (WXRブログサイト対応)
- [x] Gutenbergブロックパーサー (ネスト対応, Global Styles JSON, 16テスト)
- [x] ブロック→Portable Text変換 (paragraph/heading/list/image/code/embed/quote/separator, 20テスト)
- [x] Yoast SEOメタデータ抽出 (%%var%%プレースホルダー解決, Next.js Metadata API生成, 10テスト)
- [x] ACFテンプレート生成 (Zodスキーマ + 型付きアクセサ, 7テスト)
- [x] WXRブログscaffold生成 (投稿/アーカイブ/カテゴリ/404/PT renderer/next.config, 12テスト)
- [x] Playwright Verify scaffold生成 (スモークテスト + ビルド検証, 6テスト)
- [x] 統合テスト (WXR→scaffold全パイプライン, 2テスト)

### セキュリティ修正 (Issue #9)
- [x] sanitize.ts ユーティリティ (7関数, 29テスト)
- [x] ACFフィールド名RCE防止 (toSafeIdentifier)
- [x] XSS防止 (PT Renderer React要素化, dangerouslySetInnerHTML排除)
- [x] URLプロトコル検証 (javascript:/data:/protocol-relative拒否)
- [x] コード生成インジェクション防止 (siteTitle/mediaDomains エスケープ)
- [x] パストラバーサル防止 (path.relative ガード)
- [x] Gemini Proレビュー3回, 指摘3件反映

### D-Phase: OSS公開準備
- [x] README全面改訂 (英語, Quick Start, コマンドリファレンス, アーキテクチャ)
- [x] MIT LICENSE + package.json整備 (全パッケージ)
- [x] GitHub Actions CI (test + typecheck, pnpm cache)

## 未完了 (次のフェーズ)

### B. JRA tokyo移行の仕上げ
- [ ] B1: RBAC微調整 (ページ遷移改善)
- [ ] B2: UI/デザイン改善 (Tailwind/shadcn)
- [ ] B3: 残りWPテーマページ変換

### C. Phase 1 MVP残タスク
- [x] C1: Gutenberg → Portable Text → React変換 (WXRブログサイト向け)
- [x] C2: Yoast SEOメタデータ移行テンプレート
- [x] C3: ACFスキーマ移行テンプレート
- [x] C4: Next.js scaffold生成 (WXR版)
- [x] C5: Verify最小版 (Playwright)

### D. OSS公開準備
- [x] D1: README改善 (英語、フル書き直し)
- [x] D2: npm publish準備 (MIT LICENSE, package.json整備)
- [x] D3: CI/CD (GitHub Actions — test + typecheck)

## Issue一覧

| # | タイトル | 状態 |
|---|---------|------|
| 1 | RFC: 全体アーキテクチャ方針 | Closed |
| 2 | Phase 1-1: WPサイト解析 (Analyze) | Open |
| 3 | Phase 1-2: コンテンツ Extract + Transform | Open |
| 4 | Phase 1-3: 変換テンプレート (ACF, Yoast) | Open |
| 5 | Phase 1-4: Next.js scaffold生成 | Open |
| 6 | 12名専門家パネル統合方針 | Closed |
| 7 | Karpathy原則レビュー: 18件修正 | Closed |
| 8 | ドッグフーディング: JRA tokyo | Closed |

## 重要な設計判断

1. **emdash非依存**: ACLパターンで設計知識のみ参照。`@portabletext/toolkit`のみ直接依存
2. **リブランド**: 「完全移行ツール」→「移行アクセラレータ」
3. **LLMの役割**: レビューアシスタント (提案型、自動適用なし)
4. **sax primary**: OOM防止のためストリーミングパーサーを優先
5. **XXE防御**: XMLパーサーのEntity Expansion無効化必須
6. **セキュリティゲートP1**: シークレットスキャン、SSRF防御をPhase 1に昇格

## ローカル開発

```bash
pnpm install
npx vitest run          # 217テスト
pnpm -r typecheck       # 全パッケージ型チェック

# JRA tokyo再生成
pnpm --filter wp-transfer-cli dev analyze-php \
  /path/to/wp/tokyo \
  --schema /path/to/api/docs/database.md \
  --output output/jra-tokyo-v2

# 生成物の起動
cd output/jra-tokyo
docker compose up -d db
pnpm install && pnpm db:push && pnpm db:seed && pnpm dev
```

## メモリ/ナレッジ

- SurrealDB (agents/agents) に全セッション記録あり
- `~/.claude/projects/-home-o9oem-workspace-mine-wp-transfer/memory/` に永続メモリ
