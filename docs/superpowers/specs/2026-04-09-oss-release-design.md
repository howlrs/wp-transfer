# A. OSS公開 (v0.1.0-alpha) 設計

**日付:** 2026-04-09
**スコープ:** CLIのみ公開。ライブラリは internal (private: true)

## 1. CLI package.json 修正 (apps/cli/package.json)

- `bin`: `./src/index.ts` → `./dist/index.js`
- `main`: `./dist/index.js` 追加
- `engines`: `{ "node": ">=20" }` 追加
- `publishConfig`: `{ "access": "public" }` 追加

## 2. ライブラリ package.json 修正 (publish しないが build 整合性のため)

packages/core, packages/analyzer, packages/wxr-parser すべてに:
- `exports`: `./src/index.ts` → `{ "import": "./dist/index.js", "types": "./dist/index.d.ts" }`
- `main`: `./dist/index.js`
- `types`: `./dist/index.d.ts`
- `private: true` (誤 publish 防止)

## 3. ビルド検証

- `pnpm -r build` → `dist/` 生成確認
- CLI `dist/index.js` にシバン確認
- `node apps/cli/dist/index.js --help` 動作確認

## 4. GitHub Release

- `v0.1.0-alpha` タグ + リリースノート
- npm publish はスキップ (alpha段階、ユーザー判断)
