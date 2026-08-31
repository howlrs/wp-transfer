import { describe, expect, it } from "vitest";
import {
  detectRelations,
  generatePrismaSchema,
  parseDbSchemaMarkdown,
  parseSchemaToPrisma,
  type TableDefinition,
} from "../src/schema-to-prisma.js";

const SYNTHETIC_SCHEMA = `# Synthetic Project Schema

## project

### 0. 備考
* Synthetic project records used only by automated tests

### 1. id
* Project ID:int(11) NOT NULL AUTO_INCREMENT
* **キー**: PRIMARY KEY

### 2. title
* Project title:varchar(255) CHARACTER SET utf8 DEFAULT NULL

### 3. visibility_code
* Visibility level:int(11) DEFAULT NULL

### 4. is_archived
* Archive flag:tinyint(1) NOT NULL DEFAULT '0'

### 5. created_at
* Creation time:timestamp NULL DEFAULT NULL

---

## project_task

### 1. id
* Task ID:int(11) NOT NULL AUTO_INCREMENT
* **キー**: PRIMARY KEY

### 2. project_id
* Parent project ID:int(11) NOT NULL
* **キー**: KEY (project_id)

### 3. due_at
* Due date:datetime DEFAULT NULL

### 4. priority
* Priority:int(11) DEFAULT NULL

---

## audit_log

### 1. id
* Audit log ID:bigint(20) NOT NULL AUTO_INCREMENT
* **キー**: PRIMARY KEY

### 2. project_id
* Project ID:int(11) DEFAULT NULL

### 3. actor_id
* External actor ID:varchar(12) DEFAULT NULL

### 4. created_at
* Creation time:timestamp NULL DEFAULT CURRENT_TIMESTAMP
`;

function table(name: string, columns: TableDefinition["columns"]): TableDefinition {
  return { name, columns, note: "" };
}

describe("parseDbSchemaMarkdown", () => {
  it("parses synthetic table names and notes", () => {
    const tables = parseDbSchemaMarkdown(SYNTHETIC_SCHEMA);
    expect(tables.map((item) => item.name)).toEqual(["project", "project_task", "audit_log"]);
    expect(tables.find((item) => item.name === "project")?.note).toContain("Synthetic");
  });

  it("does not treat the note section as a column", () => {
    const project = parseDbSchemaMarkdown(SYNTHETIC_SCHEMA).find((item) => item.name === "project")!;
    expect(project.columns.every((column) => column.name !== "備考" && column.name !== "0")).toBe(true);
  });

  it("parses primary keys, strings, and nullable integers", () => {
    const project = parseDbSchemaMarkdown(SYNTHETIC_SCHEMA).find((item) => item.name === "project")!;
    expect(project.columns.find((column) => column.name === "id")).toMatchObject({
      type: "Int",
      isPrimary: true,
      isAutoIncrement: true,
      nullable: false,
    });
    expect(project.columns.find((column) => column.name === "title")).toMatchObject({
      type: "String",
      nullable: true,
      comment: "Project title",
    });
    expect(project.columns.find((column) => column.name === "visibility_code")).toMatchObject({
      type: "Int",
      nullable: true,
    });
  });

  it("maps tinyint, bigint, datetime, and timestamp types", () => {
    const tables = parseDbSchemaMarkdown(SYNTHETIC_SCHEMA);
    const project = tables.find((item) => item.name === "project")!;
    const task = tables.find((item) => item.name === "project_task")!;
    const audit = tables.find((item) => item.name === "audit_log")!;

    expect(project.columns.find((column) => column.name === "is_archived")).toMatchObject({
      type: "Boolean",
      defaultValue: "0",
    });
    expect(task.columns.find((column) => column.name === "due_at")?.type).toBe("DateTime");
    expect(audit.columns.find((column) => column.name === "id")?.type).toBe("BigInt");
    expect(audit.columns.find((column) => column.name === "created_at")).toMatchObject({
      type: "DateTime",
      defaultValue: "now()",
    });
  });
});

describe("generatePrismaSchema", () => {
  it("generates models, mappings, primary keys, and defaults", () => {
    const schema = generatePrismaSchema(parseDbSchemaMarkdown(SYNTHETIC_SCHEMA));

    expect(schema).toContain('provider = "mysql"');
    expect(schema).toContain("model Project {");
    expect(schema).toContain("model ProjectTask {");
    expect(schema).toContain("model AuditLog {");
    expect(schema).toContain('@@map("project_task")');
    expect(schema).toContain("@default(autoincrement())");
    expect(schema).toContain("@default(false)");
    expect(schema).toContain("@default(now())");
    expect(schema).toMatch(/title\s+String\?/);
  });
});

describe("primary-key fallbacks", () => {
  it("promotes an id column to a non-null primary key", () => {
    const schema = generatePrismaSchema([
      table("session", [
        { name: "id", type: "String", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "" },
        { name: "payload", type: "String", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "" },
      ]),
    ]);

    expect(schema).toContain("id  String  @id");
    expect(schema).not.toContain("id  String?  @id");
  });

  it("uses a matching single identifier when no explicit key exists", () => {
    const schema = generatePrismaSchema([
      table("service_region", [
        { name: "region_id", type: "Int", nullable: false, isPrimary: false, isAutoIncrement: false, comment: "" },
        { name: "name", type: "String", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "" },
      ]),
    ]);

    expect(schema).toContain("region_id  Int  @id");
  });

  it("uses a composite key for a synthetic junction table", () => {
    const schema = generatePrismaSchema([
      table("product_store", [
        { name: "product_id", type: "Int", nullable: false, isPrimary: false, isAutoIncrement: false, comment: "" },
        { name: "store_id", type: "Int", nullable: false, isPrimary: false, isAutoIncrement: false, comment: "" },
      ]),
    ]);

    expect(schema).toContain("@@id([product_id, store_id])");
  });

  it("falls back to the first column when no identifier exists", () => {
    const schema = generatePrismaSchema([
      table("setting", [
        { name: "key", type: "String", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "" },
        { name: "value", type: "String", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "" },
      ]),
    ]);

    expect(schema).toContain("key  String  @id");
  });
});

describe("relation detection and generation", () => {
  it("detects matching foreign keys and skips unknown targets", () => {
    const tables = parseDbSchemaMarkdown(SYNTHETIC_SCHEMA);
    const relations = detectRelations(tables);

    expect(relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          childTable: "project_task",
          childColumn: "project_id",
          parentTable: "project",
        }),
        expect.objectContaining({
          childTable: "audit_log",
          childColumn: "project_id",
          parentTable: "project",
        }),
      ]),
    );
    expect(relations.some((relation) => relation.childColumn === "actor_id")).toBe(false);
  });

  it("adds relation fields, reverse arrays, and indexes", () => {
    const tables = parseDbSchemaMarkdown(SYNTHETIC_SCHEMA);
    const schema = generatePrismaSchema(tables, detectRelations(tables));

    expect(schema).toContain("@relation(fields: [project_id], references: [id])");
    expect(schema).toContain("project_tasks  ProjectTask[]");
    expect(schema).toContain("audit_logs  AuditLog[]");
    expect(schema).toContain("@@index([project_id])");
  });

  it("returns no relations when no foreign-key-shaped columns exist", () => {
    expect(
      detectRelations([
        table("standalone", [
          { name: "id", type: "Int", nullable: false, isPrimary: true, isAutoIncrement: true, comment: "" },
          { name: "title", type: "String", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "" },
        ]),
      ]),
    ).toEqual([]);
  });
});

describe("parseSchemaToPrisma", () => {
  it("returns a complete schema with resolved tables and relations", () => {
    const result = parseSchemaToPrisma(SYNTHETIC_SCHEMA);

    expect(result.schema).toContain("Enhanced with auto-detected relations");
    expect(result.tables).toHaveLength(3);
    expect(result.relations).toHaveLength(2);
  });
});
