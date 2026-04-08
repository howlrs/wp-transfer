# wp-transfer

WordPress サイト（Plugin含む）を TypeScript (Next.js) ベースのアーキテクチャに完全移行する汎用CLIツール。

## 概要

エージェンシー/制作会社が顧客のWPサイトを、コンテンツ・プラグイン・認証・権限・データの損失なく移行するためのツールチェーン。

### 移行対象

- コンテンツ（投稿、固定ページ、カスタム投稿型、タクソノミー、メディア）
- テーマ → Next.js コンポーネント
- プラグイン → TypeScript 等価実装
- ユーザー・認証・権限
- 管理画面

### アーキテクチャ

```
WP Site → [wp-transfer CLI] → TypeScript Project (Next.js)
                │
                ├── emdash (コア変換エンジン)
                │     ├── WXR / REST API Import
                │     ├── Gutenberg → Portable Text
                │     └── Schema Analysis
                │
                ├── Plugin Migration (ハイブリッド方式)
                │     ├── カテゴリ別変換テンプレート (WooCommerce, CF7, Yoast等)
                │     └── LLM支援セミオート変換 (カスタム/マイナープラグイン)
                │
                └── Output Adapters
                      ├── Next.js (primary)
                      └── emdash/Astro (alternative)
```

## Status

設計フェーズ — [Issues](https://github.com/howlrs/wp-transfer/issues) を参照。
