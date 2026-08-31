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
  const base = fileName.replace(/\.php$/i, "");
  const ascii = Array.from(base.normalize("NFKD"))
    .map((character) => {
      if (/[A-Za-z0-9]/.test(character)) return character;
      if (/\p{M}/u.test(character)) return "";
      if (/\p{L}|\p{N}/u.test(character)) return ` U${character.codePointAt(0)!.toString(16)} `;
      return " ";
    })
    .join("");
  const pascal = ascii
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  const identifier = pascal || "PhpFile";
  return `${/^[A-Za-z_$]/.test(identifier) ? identifier : `Php${identifier}`}Schema`;
}

const RESOURCE_IRREGULARS: Record<string, string> = {
  analysis: "analyses",
  category: "categories",
  child: "children",
  data: "data",
  entry: "entries",
  information: "information",
  media: "media",
  person: "people",
  status: "statuses",
};

/** Convert a table/resource name to a stable collection path segment. */
export function pluralizeResource(name: string): string {
  const lower = name.toLowerCase();
  if (RESOURCE_IRREGULARS[lower]) return RESOURCE_IRREGULARS[lower];
  if (lower.endsWith("s")) return lower;
  if (lower.endsWith("y") && !["a", "e", "i", "o", "u"].includes(lower.at(-2) ?? "")) {
    return `${lower.slice(0, -1)}ies`;
  }
  if (/(?:ch|sh|x|z)$/.test(lower)) return `${lower}es`;
  return `${lower}s`;
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
