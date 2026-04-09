/**
 * Shared utilities for code generators.
 * Naming conventions, type mappings, and common patterns.
 */

/** snake_case → camelCase (first word lowercase) */
export function toCamelCase(name: string): string {
  return name
    .split(/[-_]/)
    .map((p, i) =>
      i === 0
        ? p.charAt(0).toLowerCase() + p.slice(1)
        : p.charAt(0).toUpperCase() + p.slice(1),
    )
    .join("");
}

/** snake_case → PascalCase */
export function toPascalCase(name: string): string {
  return name
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

/** Table name → Prisma model name (camelCase) */
export function toPrismaModelName(tableName: string): string {
  return toCamelCase(tableName);
}

/** Table name → PascalCase model name */
export function toPascalModelName(tableName: string): string {
  return toPascalCase(tableName);
}

/** PHP file name → Zod schema name (PascalCase + "Schema") */
export function toSchemaName(fileName: string): string {
  const base = fileName.replace(/\.php$/, "");
  const pascal = base
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  return `${pascal}Schema`;
}

/** Prisma type → HTML input type */
export function fieldTypeToInputType(prismaType: string): string {
  switch (prismaType) {
    case "Int":
    case "BigInt":
    case "Float":
      return "number";
    case "Boolean":
      return "checkbox";
    case "DateTime":
      return "datetime-local";
    default:
      return "text";
  }
}
