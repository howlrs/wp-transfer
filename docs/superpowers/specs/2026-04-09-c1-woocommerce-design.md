# C-1: WooCommerce 商品カタログ移行 設計仕様

**日付:** 2026-04-09
**ステータス:** Approved
**関連:** HANDOFF.md C-phase ロードマップ

## スコープ

WXR エクスポートから WooCommerce 商品データを抽出し、Next.js EC scaffold（商品表示 + カートスタブ）を生成する。

**スコープ内:**
- WXR からの商品 (product/product_variation) 抽出・正規化
- 商品属性 (pa_* タクソノミー) の解析
- 正規化 Prisma スキーマ生成 (Product, ProductVariation, ProductAttribute, ProductCategory)
- Next.js EC scaffold 生成 (商品一覧/詳細/カテゴリ/カート/チェックアウトスタブ)
- CLI analyze コマンドへの統合

**スコープ外:**
- 注文 (shop_order) / 顧客データの移行 (WXR に含まれない)
- 決済連携 (Stripe/PayPal 等) の実装コード
- WooCommerce REST API クライアント
- 顧客パスワード (phpass) の移行

## 設計判断の根拠

1. **スコープ限定 (カタログ特化):** WXR に注文/顧客データが含まれないため。wp-transfer の設計思想「移行アクセラレータ」と整合。
2. **Analyzer に ProductTransformer 層:** wxr-parser は汎用パーサーとして生データ抽出に限定。WooCommerce ドメイン知識は analyzer の責務。
3. **正規化 Prisma モデル:** 移行先は Next.js/Prisma であり、WordPress テーブル構造を引きずる理由がない。型安全なリレーションが使える。
4. **カートスタブまで生成:** 表示だけではカタログサイトと変わらず WooCommerce 対応の意味が薄い。決済は選択肢が多くスタブの汎用性が低い。
5. **C-phase 順序変更 (C-1→C-3→C-2):** i18n は EC と親和性が高く単一テナント延長で実装可能。マルチサイトはアーキテクチャ影響大のため最後。

## アーキテクチャ

```
WXR (XML)
  │
  ▼
wxr-parser (既存: PostCollector)
  │  product/product_variation を type フィールドで保持
  │  postmeta に _price, _sku, _stock_status 等を保持
  │  TaxonomyCollector が pa_* タクソノミーも収集
  ▼
analyzer/product-transformer.ts  ← NEW
  │  PostCollector の生データから商品ツリーを構築
  │  - 親商品 + 子バリエーション (post_parent で紐付け)
  │  - メタデータ正規化 (_price→price, _sku→sku 等)
  │  - 属性解析 (pa_* タクソノミー → 属性マッピング)
  │  - 商品タイプ判定 (simple/variable/grouped/external)
  ▼
analyzer/woo-prisma-generator.ts  ← NEW
  │  正規化 Prisma スキーマ生成
  │  - Product, ProductVariation, ProductAttribute, ProductCategory
  │  - リレーション定義
  ▼
analyzer/woo-scaffold-generator.ts  ← NEW
  │  Next.js EC scaffold 生成
  │  - 商品一覧/詳細/カテゴリ/カート/チェックアウトスタブ
  ▼
CLI (既存 analyze コマンドに統合)
```

## 新規ファイル

### analyzer パッケージ

| ファイル | 責務 |
|---------|------|
| `product-transformer.ts` | WXR 生データ → 正規化商品ツリー (`WooProduct[]`) |
| `woo-prisma-generator.ts` | 商品ツリー → Prisma スキーマ文字列 |
| `woo-scaffold-generator.ts` | 商品ツリー → Next.js EC scaffold (`ScaffoldFile[]`) |

### core パッケージ (型定義追加)

WooCommerce 関連型を既存の型定義に追加。

## 型定義

```typescript
type WooProductType = "simple" | "variable" | "grouped" | "external";

interface WooProduct {
  id: number;
  name: string;
  slug: string;
  type: WooProductType;
  status: string;
  description: string;
  shortDescription: string;
  sku: string;
  price: string;
  regularPrice: string;
  salePrice: string;
  stockStatus: "instock" | "outofstock" | "onbackorder";
  weight: string;
  categories: { slug: string; name: string }[];
  attributes: WooProductAttribute[];
  variations: WooProductVariation[];
  images: { url: string; alt: string }[];
  productUrl: string;
  buttonText: string;
}

interface WooProductVariation {
  id: number;
  sku: string;
  price: string;
  regularPrice: string;
  salePrice: string;
  stockStatus: string;
  attributes: { name: string; value: string }[];
}

interface WooProductAttribute {
  name: string;
  slug: string;
  values: string[];
  isVariation: boolean;
}
```

## WXR メタキーマッピング

| WP meta_key | WooProduct フィールド | 備考 |
|-------------|---------------------|------|
| `_price` | `price` | 最終価格 |
| `_regular_price` | `regularPrice` | 通常価格 |
| `_sale_price` | `salePrice` | セール価格 (空の場合あり) |
| `_sku` | `sku` | 在庫管理単位 |
| `_stock_status` | `stockStatus` | instock/outofstock/onbackorder |
| `_weight` | `weight` | 重量 |
| `_product_attributes` | `attributes` | PHP serialized → パース |
| `_thumbnail_id` | images[0] | media collector の ID と紐付け |
| `_product_image_gallery` | images[1..N] | カンマ区切り添付ファイル ID → media collector と紐付け |
| `_product_url` | productUrl | 外部商品の URL (type=external のみ) |
| `_button_text` | buttonText | 外部商品のボタンテキスト (type=external のみ) |

## 商品タイプ判定ロジック

WooCommerce は商品タイプを `product_type` タクソノミーで管理する:
- `<category domain="product_type" nicename="simple">simple</category>`
- `<category domain="product_type" nicename="variable">variable</category>`
- `<category domain="product_type" nicename="grouped">grouped</category>`
- `<category domain="product_type" nicename="external">external</category>`

ProductTransformer は WXR の `<category domain="product_type">` を参照して判定する。
タクソノミーが欠落している場合は `"simple"` をデフォルトとする。
子バリエーション (post_type="product_variation") は `post_parent` で親商品に紐付ける。

## Prisma スキーマ

```prisma
model Product {
  id              Int                @id @default(autoincrement())
  name            String
  slug            String             @unique
  type            String             @default("simple")
  status          String             @default("publish")
  description     String             @db.Text
  shortDescription String            @db.Text
  productUrl      String?
  buttonText      String?
  sku             String?
  price           Decimal?           @db.Decimal(10, 2)
  regularPrice    Decimal?           @db.Decimal(10, 2)
  salePrice       Decimal?           @db.Decimal(10, 2)
  stockStatus     String             @default("instock")
  weight          String?
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
  variations      ProductVariation[]
  attributes      ProductAttributeValue[]
  categories      ProductCategory[]  @relation("ProductCategories")
  images          ProductImage[]
}

model ProductVariation {
  id          Int      @id @default(autoincrement())
  productId   Int
  product     Product  @relation(fields: [productId], references: [id])
  sku         String?
  price       Decimal? @db.Decimal(10, 2)
  regularPrice Decimal? @db.Decimal(10, 2)
  salePrice   Decimal? @db.Decimal(10, 2)
  stockStatus String   @default("instock")
  attributes  Json
  createdAt   DateTime @default(now())
}

model ProductAttribute {
  id     Int      @id @default(autoincrement())
  name   String
  slug   String   @unique
  values ProductAttributeValue[]
}

model ProductAttributeValue {
  id          Int              @id @default(autoincrement())
  attributeId Int
  attribute   ProductAttribute @relation(fields: [attributeId], references: [id])
  productId   Int
  product     Product          @relation(fields: [productId], references: [id])
  value       String
  isVariation Boolean          @default(false)
}

model ProductCategory {
  id       Int               @id @default(autoincrement())
  name     String
  slug     String            @unique
  parentId Int?
  parent   ProductCategory?  @relation("CategoryTree", fields: [parentId], references: [id])
  children ProductCategory[] @relation("CategoryTree")
  products Product[]         @relation("ProductCategories")
}

model ProductImage {
  id        Int     @id @default(autoincrement())
  productId Int
  product   Product @relation(fields: [productId], references: [id])
  url       String
  alt       String?
  position  Int     @default(0)
}
```

## Scaffold 生成ファイル

### 商品表示

| パス | 内容 |
|------|------|
| `app/(shop)/products/page.tsx` | 商品一覧 + カテゴリフィルタ (Prisma クエリ, `where: { status: 'publish' }`) |
| `app/(shop)/products/[slug]/page.tsx` | 商品詳細 + バリエーション選択 UI |
| `app/(shop)/categories/[slug]/page.tsx` | カテゴリ別商品一覧 |

### カートスタブ

| パス | 内容 |
|------|------|
| `app/(shop)/cart/page.tsx` | カート表示 (数量変更/削除) |
| `app/(shop)/checkout/page.tsx` | チェックアウトスタブ (フォーム + TODO コメント) |
| `lib/cart-context.tsx` | React Context カート状態管理 (add/remove/update/clear) |

### 共通

| パス | 内容 |
|------|------|
| `app/(shop)/layout.tsx` | ショップレイアウト (ヘッダー + カートアイコン) |
| `lib/prisma.ts` | Prisma client (既存パターン踏襲) |

## Fixture 要件

`fixtures/woocommerce.xml` に最低 4 商品タイプを含む WXR テストデータ:

1. **Simple product** — 基本的な単一商品 (price, sku, stock)
2. **Variable product** — 親商品 + 2-3 product_variation (size/color 属性)
3. **Grouped product** — 複数商品をグループ化 (post_parent 参照)
4. **External product** — 外部リンク商品 (_product_url メタ)

各商品には product_cat タクソノミー、pa_* 属性タクソノミー、_thumbnail_id、_product_image_gallery を含める。

## テスト戦略

| テストファイル | 内容 |
|---------------|------|
| `product-transformer.test.ts` | 各商品タイプの変換、親子紐付け、メタデータ正規化、欠損フィールドのデフォルト値 |
| `woo-prisma-generator.test.ts` | Prisma スキーマ文字列のスナップショット |
| `woo-scaffold-generator.test.ts` | scaffold ファイル生成のスナップショット |
| `woo-e2e.test.ts` | WXR parse → transform → prisma + scaffold の統合テスト |

## CLI 統合

既存の `analyze` コマンドで WooCommerce プラグインが検出された場合:
- レポートに EC セクション (商品数、バリエーション数、属性一覧) を追加
- `--output` 指定時に商品 scaffold ファイルも出力
- 新規コマンドは作らない

## 属性マージ戦略

`_product_attributes` (PHP serialized) と WXR の `<category domain="pa_*">` は異なる情報を持つ:
- `_product_attributes`: 属性の設定情報 (name, is_variation, is_visible, position)
- `<category domain="pa_*">`: 属性の実際の値 (term name)

ProductTransformer は両方をマージして完全な属性データを構築する:
1. `_product_attributes` をパースし、属性定義 (name, slug, isVariation) を取得
2. `<category domain="pa_{slug}">` から各属性の値を収集
3. カスタム属性 (グローバルでないもの) は `_product_attributes` 内の value フィールドから取得

## PHP serialize パース

`_product_attributes` メタ値は PHP serialized 形式。npm パッケージ `php-serialize` の利用を検討し、
パッケージサイズ・メンテナンス状態が許容範囲外であれば文字列操作ベースの簡易パーサーを実装:
- `a:N:{...}` 形式の連想配列、`s:N:"..."` 文字列、`i:N` 整数、`b:N` 真偽値のみ対応
- ネストされたオブジェクト (`O:`) は非対応 (WooCommerce 標準では使わない)
- 正規表現は使わず文字列インデックス走査 (ReDoS 防止)
- パース失敗時は空属性として扱う (fail-safe)
- 入力長上限 (1MB) でフリーズ防止

## description サニタイズ

商品の `description` / `shortDescription` には Gutenberg ブロックやショートコードが含まれる可能性がある:
- Gutenberg ブロックが含まれる場合: 既存の `block-converter.ts` で Portable Text に変換
- ショートコード・プレーン HTML の場合: 既存の `sanitize.ts` でサニタイズ
- scaffold 生成コードでは `dangerouslySetInnerHTML` を使わず、サニタイズ済み HTML またはPortable Text レンダラーを使用
- scaffold テンプレートに DOMPurify インポートとサニタイズ呼び出しを含める

## C-3 (i18n) への拡張ポイント

- `WooProduct` 型に locale フィールドは今は追加しない (YAGNI)
- scaffold のファイル構成は App Router の i18n パターン (`[locale]/` prefix) と互換
- 拡張時は `(shop)` グループの上に `[locale]` を挿入する形で対応可能
