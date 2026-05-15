# Client A 移行品質評価レポート

**日付:** 2026-04-09
**対象:** Client A イベント管理システム (PHP → Next.js)
**ツール:** wp-transfer v0.2.0-alpha `analyze-php`
**レビュアー:** Claude Opus 4.6 + Gemini Pro

---

## エグゼクティブサマリー

| 項目 | 結果 |
|------|------|
| PHPファイル解析 | 39ファイル (30にDB操作あり) |
| DBテーブル | 21テーブル → Prismaスキーマ生成 |
| APIルート生成 | 17ルート |
| 管理画面 | 3ページ (ダッシュボード + アカウント + イベントコピー) |
| 認証 | NextAuth v5 + RBAC (4ロール) |
| Docker | Compose + Dockerfile (multi-stage) |
| 生成ファイル合計 | 42ファイル |
| セキュリティ問題検出 | 111件 (レポート出力) |
| **総合評価** | **Prismaスキーマ: 優秀 / APIルート: 要修正 / 認証・Docker: 良好** |

---

## 1. Prismaスキーマ品質: A (優秀)

### 評価

21テーブルすべてが正確にマッピング。

| 検証項目 | 結果 |
|---------|------|
| テーブル数の一致 | 21/21 (100%) |
| カラム型マッピング | 正確 (Int, String, DateTime, BigInt, Boolean) |
| NULL許容の一致 | 正確 |
| デフォルト値 | 正確 (cancel_mode=false, lottery_exec_flg=false 等) |
| リレーション自動検出 | Event→EventSlot, Lottery→Event, Lottery→User, Sessions→User, TCouponLottery→User |
| 複合PK | MCouponTargetStores @@id([coupon_id, store_id]) 正確 |
| インデックス | event_id, user_id に @@index 生成済み |
| @@map | 全テーブルに snake_case マッピング正確 |

### 軽微な問題 (1件)

- `EventSlot.time_disp`: `Boolean? @default(true)` — DB定義は `NOT NULL DEFAULT '1'` なので `Boolean @default(true)` が正しい。動作に影響なし。

---

## 2. APIルート品質: C (要修正)

### CRITICAL (即座に修正が必要): 6件

| # | 問題 | ファイル | 影響 |
|---|------|---------|------|
| 1 | `UpdateSchema` 未定義 | events/[id]/route.ts | PUT crashes |
| 2 | `EventSlotUpdateSchema` 未定義 | events/[id]/slots/[slotId]/route.ts | PUT crashes |
| 3 | `UserBlacklistSchema` 未定義 | users/[id]/blacklist/route.ts | POST crashes |
| 4 | DELETE が `.update()` を使用 | events/[id]/route.ts | データ削除されない |
| 5 | DELETE が `.update()` を使用 | events/[id]/slots/[slotId]/route.ts | スロット削除されない |
| 6 | イベントコピーでスロットループ欠落 | events/[id]/copy/route.ts | コピー機能壊れ |

### HIGH (本番前に修正推奨): 3件

| # | 問題 | 影響 |
|---|------|------|
| 7 | イベント作成で単一スロットのみ | マルチスロットイベント非対応 |
| 8 | 状態遷移に POST 使用 (PATCH が正しい) | REST規約違反 |
| 9 | GETエンドポイント未生成 | データ取得不可 |

### 根本原因分析 (Gemini Pro 見解)

> 9割以上、ジェネレーター側の実装不備が原因。変数の未定義やDELETE→UPDATE誤変換は、入力PHPの複雑さに関係なく発生してはならない出力時の構文生成バグ。

---

## 3. CRUD カバレッジ

| モジュール | CREATE | READ | UPDATE | DELETE | 特殊操作 |
|-----------|--------|------|--------|--------|---------|
| Event | OK (要スロットループ修正) | **欠落** | OK (要Schema定義) | **バグ (.update())** | copy(要ループ), stop, restore |
| EventSlot | OK | **欠落** | **crash (Schema未定義)** | **バグ (.update())** | — |
| Information | OK | **欠落** | OK | — | banner/text enable/disable |
| Lottery | **欠落** | **欠落** | OK | **欠落** | — |
| User | **欠落** | **欠落** | — | — | blacklist(**crash**), unblacklist(OK) |

---

## 4. Zodバリデーション品質: B-

### 良い点
- 型推論は概ね正確 (z.coerce.number(), z.string(), z.boolean() preprocess)
- ファイルアップロード対応 (FormData + File handling)
- 空文字列のpreprocess処理が適切

### 問題点
- UPDATE系のスキーマが複数未定義 (CRITICAL)
- event-restoration のスキーマに不要なフィールド (winners_limit等) が含まれる (PHPは status=0 のみ更新)
- slot_time_disp, ticket_counter 等の初期化フィールドが欠落

---

## 5. 認証・RBAC品質: A (良好)

| 項目 | 評価 |
|------|------|
| NextAuth v5 設定 | Credentials Provider + JWT session |
| パスワードハッシュ | bcryptjs 12 rounds |
| RBAC | 4ロール (administrator/editor/contributor/support_admin) |
| デフォルト拒否 | fail-safe: 未登録パスは administrator のみ |
| ミドルウェア | パスベース認証チェック |
| AdminUser Prisma | 別モデルで分離 (正しい設計判断) |

---

## 6. Docker品質: A-

| 項目 | 評価 |
|------|------|
| マルチステージビルド | deps → builder → runner (適切) |
| ベースイメージ | node:20-slim |
| Next.js standalone | output: standalone 対応 |
| Prisma generate | ビルドステージで実行 |
| docker-compose | db (MySQL) + app 構成 |

軽微: seed.ts がランナーステージに含まれていない。

---

## 7. セキュリティ

### 良い点
- 111件のセキュリティ問題を自動検出・レポート
- SQLインジェクション脆弱性の明確な指摘
- 入力バリデーション (Zod) の自動付与

### 問題点
- `.env` にハードコードされた AUTH_SECRET — `.env.example` のみ出力すべき

---

## 8. 「移行アクセラレータ」としての評価

### Gemini Pro 評価

> 現状はアルファ版未満の品質。GETが生成されない、DELETEがUPDATEになる、コンパイルエラーになるなど、生成されたコードのデバッグに多大な時間を奪われる。

### Claude 評価

**Prismaスキーマ生成は production-ready 品質。** 21テーブル、リレーション、インデックスが完璧に生成される点は移行アクセラレータとして非常に価値が高い。手動でこれを書くと2-3時間かかる作業が即座に完了する。

**APIルート生成は scaffold 品質。** 意図通り「完全自動移行」ではなく「開発者を支援するスタブ」として機能している。ただし、6件のCRITICALバグ (undefined schema, DELETE→update) はスタブとしても許容範囲外であり、ジェネレーターの修正が必要。

### 修正後の期待効果

| 作業 | 手動のみ | wp-transfer + 修正 |
|------|---------|-------------------|
| Prismaスキーマ作成 | 2-3時間 | **0分** (そのまま使用可) |
| APIルートスタブ | 8-12時間 | **4-6時間** (修正作業) |
| 認証scaffold | 3-4時間 | **0.5時間** (確認のみ) |
| Docker設定 | 1-2時間 | **0.5時間** (確認のみ) |
| **合計** | **14-21時間** | **5-7時間** |

---

## 9. 推奨アクション

### ジェネレーター改善 (wp-transfer側)

1. **P0: DELETE → `.delete()` マッピング修正** — nextjs-stub-generator.ts でDELETEメソッド検出時に `.delete()` を生成
2. **P0: UPDATE用Zodスキーマ生成** — PUT/PATCHハンドラーには必ず対応するスキーマを生成
3. **P1: GETエンドポイント自動生成** — テーブルごとに一覧(findMany) + 詳細(findUnique) のGETを標準生成
4. **P1: ループ検出** — PHP内のforeachでDB操作しているパターンを検出し、Prismaの createMany/Promise.all に変換
5. **P2: HTTP Method最適化** — 状態遷移操作をPATCHで生成

### Client A 個別修正 (生成物側)

修正工数: **4-6時間** (ジェネレーター改善なしの場合)
- 3件のSchema定義追加
- 2件のDELETE修正
- 1件のスロットコピーループ実装
- GETエンドポイント追加
- HTTP Method修正

---

## 10. 結論

wp-transfer の `analyze-php` は **DBスキーマ → Prisma 変換** と **認証/Docker scaffold** において高い品質を発揮しており、移行アクセラレータとしての価値は明確である。

**APIルート生成の6件のCRITICALバグ**はジェネレーター側の修正で解決可能であり、修正後は手動移行の **60-70%の工数削減** が期待できる。

現時点での推奨: **Prismaスキーマと認証scaffoldはそのまま採用、APIルートは修正パッチ適用後に採用。**
