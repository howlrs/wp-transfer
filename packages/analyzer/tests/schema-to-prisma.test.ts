import { describe, it, expect } from "vitest";
import {
  parseDbSchemaMarkdown,
  generatePrismaSchema,
  parseSchemaToPrisma,
} from "../src/schema-to-prisma.js";

// ── Minimal fixture matching JRA database.md format ──

const FIXTURE = `# Test Schema

## event

### 0. 備考
* jra_eventのみテーブルが存在

### 1. id
* イベントID:int(11) NOT NULL AUTO_INCREMENT
* **キー**: PRIMARY KEY

### 2. title
* イベントタイトル:varchar(255) CHARACTER SET utf8 DEFAULT NULL

### 3. recruiting_type
* 募集タイプ:int(11) DEFAULT NULL

### 4. cancel_mode
* キャンセル機能ON/OFFフラグ:tinyint(1) NOT NULL DEFAULT '0'

### 5. time_stamp
* 登録時間:timestamp NULL DEFAULT NULL

### 6. preview_mode
* プレビュー/本番公開フラグ:tinyint(1) NOT NULL DEFAULT '0'

---

## event_slot

### 1. id
* イベントスロットのID:int(11) NOT NULL AUTO_INCREMENT
* **キー**: PRIMARY KEY

### 2. event_id
* 親イベントのID:int(11) NOT NULL
* **キー**: KEY (event_id)

### 3. event_time
* 枠の開催時間:datetime DEFAULT NULL

### 4. winners_probability
* 当選確率:int(11) DEFAULT NULL

---

## lottery

### 1. id
* 抽選ID:bigint(20) NOT NULL AUTO_INCREMENT
* **キー**: PRIMARY KEY

### 2. event_id
* イベントID:int(11) DEFAULT NULL

### 3. user_id
* ユーザID:varchar(12) DEFAULT NULL

### 4. time_stamp
* 登録時間:timestamp NULL DEFAULT CURRENT_TIMESTAMP
`;

describe("parseDbSchemaMarkdown", () => {
  it("parses table names", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const names = tables.map((t) => t.name);
    expect(names).toContain("event");
    expect(names).toContain("event_slot");
    expect(names).toContain("lottery");
  });

  it("parses table notes from 備考 section", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const event = tables.find((t) => t.name === "event");
    expect(event?.note).toContain("jra_event");
  });

  it("skips 備考 (index 0) as column", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const event = tables.find((t) => t.name === "event");
    // No column should be named "備考" or have index-related artifacts
    expect(event?.columns.every((c) => c.name !== "備考")).toBe(true);
    expect(event?.columns.every((c) => c.name !== "0")).toBe(true);
  });

  it("parses column definitions", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const event = tables.find((t) => t.name === "event")!;

    // id column
    const id = event.columns.find((c) => c.name === "id")!;
    expect(id.type).toBe("Int");
    expect(id.isPrimary).toBe(true);
    expect(id.isAutoIncrement).toBe(true);
    expect(id.nullable).toBe(false);

    // title column
    const title = event.columns.find((c) => c.name === "title")!;
    expect(title.type).toBe("String");
    expect(title.nullable).toBe(true);

    // recruiting_type column
    const rt = event.columns.find((c) => c.name === "recruiting_type")!;
    expect(rt.type).toBe("Int");
    expect(rt.nullable).toBe(true);
  });

  it("maps tinyint(1) to Boolean", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const event = tables.find((t) => t.name === "event")!;
    const cancelMode = event.columns.find((c) => c.name === "cancel_mode")!;
    expect(cancelMode.type).toBe("Boolean");
    expect(cancelMode.nullable).toBe(false);
    expect(cancelMode.defaultValue).toBe("0");
  });

  it("maps bigint to BigInt", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const lottery = tables.find((t) => t.name === "lottery")!;
    const id = lottery.columns.find((c) => c.name === "id")!;
    expect(id.type).toBe("BigInt");
  });

  it("maps datetime to DateTime", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const slot = tables.find((t) => t.name === "event_slot")!;
    const eventTime = slot.columns.find((c) => c.name === "event_time")!;
    expect(eventTime.type).toBe("DateTime");
  });

  it("maps timestamp to DateTime", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const event = tables.find((t) => t.name === "event")!;
    const ts = event.columns.find((c) => c.name === "time_stamp")!;
    expect(ts.type).toBe("DateTime");
  });

  it("detects DEFAULT CURRENT_TIMESTAMP", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const lottery = tables.find((t) => t.name === "lottery")!;
    const ts = lottery.columns.find((c) => c.name === "time_stamp")!;
    expect(ts.defaultValue).toBe("now()");
  });

  it("preserves column comments", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const event = tables.find((t) => t.name === "event")!;
    const title = event.columns.find((c) => c.name === "title")!;
    expect(title.comment).toBe("イベントタイトル");
  });
});

describe("generatePrismaSchema", () => {
  it("generates valid Prisma schema structure", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const schema = generatePrismaSchema(tables);

    expect(schema).toContain("generator client");
    expect(schema).toContain("datasource db");
    expect(schema).toContain('provider = "mysql"');
  });

  it("generates PascalCase model names", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const schema = generatePrismaSchema(tables);

    expect(schema).toContain("model Event {");
    expect(schema).toContain("model EventSlot {");
    expect(schema).toContain("model Lottery {");
  });

  it("includes @@map for table name mapping", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const schema = generatePrismaSchema(tables);

    expect(schema).toContain('@@map("event")');
    expect(schema).toContain('@@map("event_slot")');
    expect(schema).toContain('@@map("lottery")');
  });

  it("includes @id and @default(autoincrement()) for primary keys", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const schema = generatePrismaSchema(tables);

    expect(schema).toContain("@id");
    expect(schema).toContain("@default(autoincrement())");
  });

  it("marks nullable fields with ?", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const schema = generatePrismaSchema(tables);

    // title is varchar DEFAULT NULL → should be String?
    expect(schema).toMatch(/title\s+String\?/);
  });

  it("includes @default for fields with defaults", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const schema = generatePrismaSchema(tables);

    // cancel_mode has DEFAULT '0' and is Boolean
    expect(schema).toContain("@default(false)");
  });

  it("includes @default(now()) for CURRENT_TIMESTAMP", () => {
    const tables = parseDbSchemaMarkdown(FIXTURE);
    const schema = generatePrismaSchema(tables);

    expect(schema).toContain("@default(now())");
  });
});

describe("parseSchemaToPrisma (integration)", () => {
  it("returns both schema string and table definitions", () => {
    const result = parseSchemaToPrisma(FIXTURE);
    expect(result.schema).toBeTruthy();
    expect(result.tables.length).toBeGreaterThan(0);
  });
});
