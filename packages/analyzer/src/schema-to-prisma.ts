/**
 * Parse JRA database.md documentation and generate a Prisma schema.
 *
 * Expected markdown format:
 *   ## table_name
 *   ### 0. 備考       ← notes (skipped as column)
 *   ### N. column_name ← column definition
 *   * description:type_definition
 *   * **キー**: PRIMARY KEY / KEY / UNIQUE KEY
 */

// ── Types ──

export interface PrismaSchemaResult {
  schema: string;
  tables: TableDefinition[];
}

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  note?: string;
}

export interface ColumnDefinition {
  name: string;
  type: string; // Prisma type
  nullable: boolean;
  isPrimary: boolean;
  isAutoIncrement: boolean;
  defaultValue?: string;
  comment?: string;
}

// ── MySQL → Prisma type mapping ──

function mysqlToPrismaType(mysqlType: string): string {
  const normalized = mysqlType.toLowerCase().trim();

  // tinyint(1) → Boolean
  if (/^tinyint\s*\(\s*1\s*\)/.test(normalized)) return "Boolean";

  // int types
  if (/^(?:int|integer|mediumint|smallint|tinyint)/.test(normalized))
    return "Int";

  // bigint
  if (/^bigint/.test(normalized)) return "BigInt";

  // float/double/decimal
  if (/^(?:float|double|decimal|numeric)/.test(normalized)) return "Float";

  // varchar / char / text / mediumtext / longtext / enum / set
  if (
    /^(?:varchar|char|text|mediumtext|longtext|enum|set|tinytext)/.test(
      normalized,
    )
  )
    return "String";

  // datetime / timestamp
  if (/^(?:datetime|timestamp|date|time)/.test(normalized)) return "DateTime";

  // blob
  if (/^(?:blob|mediumblob|longblob|tinyblob)/.test(normalized))
    return "Bytes";

  // json
  if (/^json/.test(normalized)) return "Json";

  // Fallback
  return "String";
}

// ── Markdown parser ──

export function parseDbSchemaMarkdown(content: string): TableDefinition[] {
  const tables: TableDefinition[] = [];
  let currentTable: TableDefinition | null = null;
  let currentColumn: Partial<ColumnDefinition> | null = null;
  let isNoteSection = false;
  // Track column index to skip 備考 section (index 0)
  let currentColumnIndex = -1;

  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // ## table_name → new table
    const tableMatch = trimmed.match(/^##\s+(\w+)\s*$/);
    if (tableMatch) {
      // Flush previous column
      if (currentColumn && currentTable && currentColumnIndex > 0) {
        currentTable.columns.push(finalizeColumn(currentColumn));
      }
      currentTable = { name: tableMatch[1]!, columns: [] };
      tables.push(currentTable);
      currentColumn = null;
      isNoteSection = false;
      currentColumnIndex = -1;
      continue;
    }

    // ### N. column_name → new column or notes section
    const colMatch = trimmed.match(/^###\s+(\d+)\.\s+(.+)$/);
    if (colMatch && currentTable) {
      // Flush previous column
      if (currentColumn && currentColumnIndex > 0) {
        currentTable.columns.push(finalizeColumn(currentColumn));
      }

      currentColumnIndex = parseInt(colMatch[1]!, 10);

      if (currentColumnIndex === 0) {
        // This is 備考 (notes) section
        isNoteSection = true;
        currentColumn = null;
        continue;
      }

      isNoteSection = false;
      currentColumn = {
        name: colMatch[2]!.trim(),
        type: "String", // default
        nullable: true, // default
        isPrimary: false,
        isAutoIncrement: false,
      };
      continue;
    }

    // Handle note lines for table-level notes
    if (isNoteSection && currentTable && trimmed.startsWith("*")) {
      const noteText = trimmed.replace(/^\*\s*/, "");
      currentTable.note = currentTable.note
        ? `${currentTable.note}; ${noteText}`
        : noteText;
      continue;
    }

    // Process column detail lines (starting with *)
    if (currentColumn && trimmed.startsWith("*")) {
      // **キー**: PRIMARY KEY / KEY / UNIQUE KEY
      const keyMatch = trimmed.match(
        /\*\*キー\*\*\s*:\s*(PRIMARY KEY|KEY|UNIQUE KEY)/i,
      );
      if (keyMatch) {
        if (keyMatch[1]!.toUpperCase() === "PRIMARY KEY") {
          currentColumn.isPrimary = true;
        }
        continue;
      }

      // Main definition line: * description:type_definition
      // e.g. "* イベントID:int(11) NOT NULL AUTO_INCREMENT"
      // e.g. "* イベントタイトル:varchar(255) CHARACTER SET utf8 DEFAULT NULL"
      const defMatch = trimmed.match(/^\*\s+(.+?):(.+)$/);
      if (defMatch) {
        const description = defMatch[1]!.trim();
        const typeStr = defMatch[2]!.trim();

        currentColumn.comment = description;

        // Extract MySQL type - first word or word(size) pattern
        const typePartMatch = typeStr.match(
          /^(\w+(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)/,
        );
        if (typePartMatch) {
          currentColumn.type = mysqlToPrismaType(typePartMatch[1]!);
        }

        // Check for NOT NULL
        if (/NOT\s+NULL/i.test(typeStr)) {
          currentColumn.nullable = false;
        }

        // Check for unsigned
        if (/unsigned/i.test(typeStr)) {
          // Prisma doesn't have unsigned, but keep note
        }

        // Check for AUTO_INCREMENT
        if (/AUTO_INCREMENT/i.test(typeStr)) {
          currentColumn.isAutoIncrement = true;
          currentColumn.nullable = false;
        }

        // Check for DEFAULT value
        const defaultMatch = typeStr.match(
          /DEFAULT\s+'([^']*)'/i,
        );
        if (defaultMatch) {
          currentColumn.defaultValue = defaultMatch[1];
        } else if (/DEFAULT\s+NULL/i.test(typeStr)) {
          currentColumn.nullable = true;
        } else if (/DEFAULT\s+CURRENT_TIMESTAMP/i.test(typeStr)) {
          currentColumn.defaultValue = "now()";
        }

        continue;
      }
    }
  }

  // Flush last column
  if (currentColumn && currentTable && currentColumnIndex > 0) {
    currentTable.columns.push(finalizeColumn(currentColumn));
  }

  return tables;
}

function finalizeColumn(partial: Partial<ColumnDefinition>): ColumnDefinition {
  return {
    name: partial.name ?? "unknown",
    type: partial.type ?? "String",
    nullable: partial.nullable ?? true,
    isPrimary: partial.isPrimary ?? false,
    isAutoIncrement: partial.isAutoIncrement ?? false,
    defaultValue: partial.defaultValue,
    comment: partial.comment,
  };
}

// ── Prisma schema generator ──

function toPrismaModelName(tableName: string): string {
  // Convert snake_case to PascalCase
  return tableName
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function prismaFieldLine(col: ColumnDefinition): string {
  let line = `  ${col.name}`;

  // Type
  let typeStr = col.type;
  if (col.nullable && !col.isPrimary) {
    typeStr += "?";
  }
  line += `  ${typeStr}`;

  // Attributes
  const attrs: string[] = [];

  if (col.isPrimary) {
    attrs.push("@id");
  }

  if (col.isAutoIncrement) {
    attrs.push("@default(autoincrement())");
  } else if (col.defaultValue === "now()") {
    attrs.push("@default(now())");
  } else if (col.defaultValue !== undefined) {
    const val = col.defaultValue;
    if (col.type === "Int" || col.type === "BigInt" || col.type === "Float") {
      attrs.push(`@default(${val})`);
    } else if (col.type === "Boolean") {
      const boolVal = val === "1" || val === "true" ? "true" : "false";
      attrs.push(`@default(${boolVal})`);
    } else {
      attrs.push(`@default("${val}")`);
    }
  }

  if (attrs.length > 0) {
    line += `  ${attrs.join(" ")}`;
  }

  // Comment
  if (col.comment) {
    line += ` /// ${col.comment}`;
  }

  return line;
}

export function generatePrismaSchema(tables: TableDefinition[]): string {
  const lines: string[] = [];

  // Header
  lines.push("// Auto-generated Prisma schema from JRA database.md");
  lines.push("// Generated at: " + new Date().toISOString());
  lines.push("");
  lines.push("generator client {");
  lines.push('  provider = "prisma-client-js"');
  lines.push("}");
  lines.push("");
  lines.push("datasource db {");
  lines.push('  provider = "mysql"');
  lines.push('  url      = env("DATABASE_URL")');
  lines.push("}");

  for (const table of tables) {
    lines.push("");

    if (table.note) {
      lines.push(`/// ${table.note}`);
    }

    const modelName = toPrismaModelName(table.name);
    lines.push(`model ${modelName} {`);

    for (const col of table.columns) {
      lines.push(prismaFieldLine(col));
    }

    // Add @@map to preserve original table name
    lines.push("");
    lines.push(`  @@map("${table.name}")`);
    lines.push("}");
  }

  lines.push("");

  return lines.join("\n");
}

export function parseSchemaToPrisma(content: string): PrismaSchemaResult {
  const tables = parseDbSchemaMarkdown(content);
  const schema = generatePrismaSchema(tables);
  return { schema, tables };
}
