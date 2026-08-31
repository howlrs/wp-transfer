import { describe, expect, it } from "vitest";
import ts from "typescript";
import { generateApiStubs, inferRouteMapping } from "../src/nextjs-stub-generator.js";
import type { DbOperation, InputParam, PhpFileAnalysis } from "../src/php-analyzer.js";
import type { ColumnDefinition, TableDefinition } from "../src/schema-to-prisma.js";

function analysis(overrides: Partial<PhpFileAnalysis> = {}): PhpFileAnalysis {
  return { fileName: "create-product.php", purpose: "Create a product", dbOperations: [], inputParams: [], outputType: "redirect", securityIssues: [], phpVersionHints: [], ...overrides };
}

function operation(overrides: Partial<DbOperation> = {}): DbOperation {
  return { type: "INSERT", table: "product", columns: ["name"], inLoop: false, ...overrides };
}

function parameter(overrides: Partial<InputParam> = {}): InputParam {
  return { name: "name", source: "$_POST", usage: '$name = $_POST["name"];', ...overrides };
}

function column(overrides: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return { name: "id", type: "Int", nullable: false, isPrimary: true, isAutoIncrement: true, ...overrides };
}

describe("inferRouteMapping", () => {
  it("derives collection and detail routes from generic verbs and database operations", () => {
    expect(inferRouteMapping(analysis({ dbOperations: [operation({ table: "catalog_item" })] }))).toEqual({ method: "POST", path: "app/api/catalog_items/route.ts" });
    expect(inferRouteMapping(analysis({ fileName: "update-product.php", dbOperations: [operation({ type: "UPDATE" })] }))).toEqual({ method: "PUT", path: "app/api/products/[id]/route.ts" });
    expect(inferRouteMapping(analysis({ fileName: "remove-account.php", dbOperations: [operation({ type: "DELETE", table: "account" })] }))).toEqual({ method: "DELETE", path: "app/api/accounts/[id]/route.ts" });
    expect(inferRouteMapping(analysis({ fileName: "list-articles.php", dbOperations: [operation({ type: "SELECT", table: "article" })] }))).toEqual({ method: "GET", path: "app/api/articles/route.ts" });
  });

  it("uses a read-only, namespaced fallback when no table can be inferred", () => {
    expect(inferRouteMapping(analysis({ fileName: "show-summary.php", inputParams: [parameter({ name: "id", source: "$_GET" })] }))).toEqual({ method: "GET", path: "app/api/legacy/summary/[id]/route.ts" });
    expect(inferRouteMapping(analysis({ fileName: "maintenance.php" }))).toEqual({ method: "GET", path: "app/api/legacy/maintenance/route.ts" });
  });
});

describe("generated API routes", () => {
  it("quotes arbitrary request keys and uses safe local names for uploads", () => {
    const code = generateApiStubs([
      analysis({
        inputParams: [
          parameter({ name: "first-name" }),
          parameter({ name: 'quote"key' }),
          parameter({ name: "path\\key" }),
          parameter({ name: "first-name", source: "$_FILES" }),
        ],
        dbOperations: [operation({ columns: ["first-name"] })],
      }),
    ]).get("app/api/products/route.ts")!;

    expect(code).toContain('"first-name": z.string()');
    expect(code).toContain('"quote\\"key": z.string()');
    expect(code).toContain('"path\\\\key": z.string()');
    expect(code).toContain('const first_name_0 = formData.get("first-name") as File | null');
    const result = ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
    });
    expect((result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });

  it("generates a POST handler with schema-aware validation", () => {
    const tables: TableDefinition[] = [{ name: "product", columns: [column(), column({ name: "name", type: "String", isPrimary: false }), column({ name: "published", type: "Boolean", isPrimary: false })] }];
    const stubs = generateApiStubs([analysis({ inputParams: [parameter(), parameter({ name: "published" })], dbOperations: [operation()] })], tables);
    const code = stubs.get("app/api/products/route.ts")!;
    expect(code).toContain("export async function POST");
    expect(code).toContain('"name": z.string()');
    expect(code).toContain('"published": z.preprocess((v) => v === "1" || v === 1 || v === true, z.boolean())');
    expect(code).toContain("prisma.product.create");
  });

  it("uses generic name patterns when no database schema is available", () => {
    const code = generateApiStubs([
      analysis({
        inputParams: [
          parameter({ name: "is_visible" }),
          parameter({ name: "item_count" }),
        ],
        dbOperations: [operation()],
      }),
    ]).get("app/api/products/route.ts")!;

    expect(code).toContain('"is_visible": z.preprocess((v) => v === "1" || v === 1 || v === true, z.boolean())');
    expect(code).toContain('"item_count": z.coerce.number().int().min(0)');
  });

  it("co-locates PUT and DELETE detail handlers inferred from operations", () => {
    const stubs = generateApiStubs([
      analysis({ fileName: "update-product.php", inputParams: [parameter()], dbOperations: [operation({ type: "UPDATE" })] }),
      analysis({ fileName: "delete-product.php", dbOperations: [operation({ type: "DELETE", columns: [] })] }),
    ]);
    const code = stubs.get("app/api/products/[id]/route.ts")!;
    expect(code).toContain("export async function PUT");
    expect(code).toContain("export async function DELETE");
    expect(code).toContain("UpdateProductSchema");
    expect(code).toContain(".delete(");
  });

  it("uses a non-id integer primary key for co-located PHP detail handlers", () => {
    const tables: TableDefinition[] = [{
      name: "catalog_item",
      columns: [column({ name: "catalog_number", isPrimary: true }), column({ name: "name", type: "String", isPrimary: false })],
    }];
    const code = generateApiStubs([
      analysis({ fileName: "update-catalog-item.php", inputParams: [parameter()], dbOperations: [operation({ type: "UPDATE", table: "catalog_item" })] }),
      analysis({ fileName: "delete-catalog-item.php", dbOperations: [operation({ type: "DELETE", table: "catalog_item", columns: [] })] }),
    ], tables).get("app/api/catalog_items/[id]/route.ts")!;

    expect(code).toContain("const id = parseInt(resolvedParams.id, 10);");
    expect(code.match(/where: \{ "catalog_number": id \}/g)).toHaveLength(2);
    expect(code).not.toContain('where: { "id": id }');
    const result = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
    expect((result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });

  it("uses a String/UUID primary key without numeric coercion for PHP detail handlers", () => {
    const tables: TableDefinition[] = [{
      name: "asset",
      columns: [column({ name: "asset_uuid", type: "String", isPrimary: true, isAutoIncrement: false }), column({ name: "name", type: "String", isPrimary: false })],
    }];
    const code = generateApiStubs([
      analysis({ fileName: "show-asset.php", inputParams: [parameter({ name: "id", source: "$_GET" })], dbOperations: [operation({ type: "SELECT", table: "asset", columns: ["*"] })] }),
      analysis({ fileName: "update-asset.php", inputParams: [parameter()], dbOperations: [operation({ type: "UPDATE", table: "asset" })] }),
      analysis({ fileName: "delete-asset.php", dbOperations: [operation({ type: "DELETE", table: "asset", columns: [] })] }),
    ], tables).get("app/api/assets/[id]/route.ts")!;

    expect(code).toContain("const id = resolvedParams.id;");
    expect(code).not.toContain("parseInt(resolvedParams.id, 10)");
    expect(code.match(/where: \{ "asset_uuid": id \}/g)).toHaveLength(3);
    const result = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
    expect((result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });

  it("does not generate PHP-derived detail mutations without a single primary key", () => {
    const tables: TableDefinition[] = [{
      name: "membership",
      columns: [
        column({ name: "account_id", isPrimary: true }),
        column({ name: "group_id", isPrimary: true }),
      ],
    }];
    const code = generateApiStubs([
      analysis({ fileName: "update-membership.php", inputParams: [parameter()], dbOperations: [operation({ type: "UPDATE", table: "membership" })] }),
    ], tables).get("app/api/memberships/[id]/route.ts")!;

    expect(code).toContain("Detail routes require a single-column primary key");
    expect(code).toContain("TODO: Add a single-column primary key");
    expect(code).not.toContain("prisma.membership.update");
  });

  it("uses findMany for a collection SELECT rather than an invalid findUnique call", () => {
    const code = generateApiStubs([
      analysis({
        fileName: "list-products.php",
        dbOperations: [operation({ type: "SELECT", columns: ["*"] })],
      }),
    ]).get("app/api/products/route.ts")!;

    expect(code).toContain("prisma.product.findMany()");
    expect(code).toContain("prisma.product.count()");
    expect(code).toContain("NextResponse.json(jsonSafe({ items, total }))");
    expect(code).not.toContain("prisma.product.findUnique({\n    });");
  });

  it("serializes BigInt values safely across schema-driven list, detail, and write handlers", () => {
    const tables: TableDefinition[] = [{
      name: "ledger_entry",
      columns: [
        column({ name: "entry_id", type: "BigInt", isPrimary: true, isAutoIncrement: false }),
        column({ name: "amount", type: "BigInt", isPrimary: false, isAutoIncrement: false }),
      ],
    }];
    const stubs = generateApiStubs([], tables);
    const list = stubs.get("app/api/ledger_entries/route.ts")!;
    const detail = stubs.get("app/api/ledger_entries/[id]/route.ts")!;

    for (const code of [list, detail]) {
      expect(code.match(/function jsonSafe\b/g)).toHaveLength(1);
      expect(code).toContain('if (typeof value === "bigint") return value.toString();');
      expect(code).toContain("value === null || value instanceof Date");
      expect(code).toContain('typeof serializable.toJSON === "function"');
      expect(code).toContain("Object.getPrototypeOf(value)");
      const result = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
      expect((result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
    }

    expect(list).toContain("NextResponse.json(jsonSafe({ items, total, skip, take }))");
    expect(list).toContain("NextResponse.json(jsonSafe(created), { status: 201 })");
    expect(detail).toContain("where: { entry_id: parseBigIntPath(id) }");
    expect(detail).toContain("NextResponse.json(jsonSafe(item))");
    expect(detail).toContain("NextResponse.json(jsonSafe(updated))");
  });

  it("preserves DateTime, Decimal, and Bytes response serialization while converting bigint values", () => {
    const tables: TableDefinition[] = [{
      name: "record",
      columns: [
        column({ name: "record_id", type: "BigInt", isPrimary: true, isAutoIncrement: false }),
        column({ name: "occurred_at", type: "DateTime", isPrimary: false, isAutoIncrement: false }),
        column({ name: "amount", type: "Decimal", isPrimary: false, isAutoIncrement: false }),
        column({ name: "payload", type: "Bytes", isPrimary: false, isAutoIncrement: false }),
      ],
    }];
    const code = generateApiStubs([], tables).get("app/api/records/route.ts")!;

    expect(code).toContain("value instanceof Date");
    expect(code).toContain('const serializable = value as { toJSON?: () => unknown };');
    expect(code).toContain('if (typeof serializable.toJSON === "function") return jsonSafe(serializable.toJSON());');
    expect(code).toContain('"occurred_at": z.coerce.date()');
    expect(code).toContain('"amount": z.string().regex(/^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?$/');
    expect(code).toContain('"payload": z.string().regex(/^(?:[A-Za-z0-9+/]{4})*');
    const result = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
    expect((result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });

  it("uses strict scalar schemas for generated writes and preserves BigInt precision", () => {
    const tables: TableDefinition[] = [{
      name: "ledger_entry",
      columns: [
        column({ name: "entry_id", type: "BigInt", isPrimary: true, isAutoIncrement: false }),
        column({ name: "amount", type: "Decimal", isPrimary: false, isAutoIncrement: false }),
        column({ name: "quantity", type: "Int", isPrimary: false, isAutoIncrement: false }),
        column({ name: "ratio", type: "Float", isPrimary: false, isAutoIncrement: false }),
        column({ name: "published_at", type: "DateTime", isPrimary: false, isAutoIncrement: false }),
        column({ name: "payload", type: "Json", isPrimary: false, isAutoIncrement: false }),
        column({ name: "bytes", type: "Bytes", isPrimary: false, isAutoIncrement: false }),
      ],
    }];
    const stubs = generateApiStubs([], tables);
    const list = stubs.get("app/api/ledger_entries/route.ts")!;
    const detail = stubs.get("app/api/ledger_entries/[id]/route.ts")!;

    expect(list).toContain("const data = z.object({");
    expect(list).toContain("}).strict().parse(await request.json())");
    expect(list).not.toContain('"entry_id":');
    expect(list).toContain('"amount": z.string().regex(/^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?$/');
    expect(list).toContain('"quantity": z.coerce.number().int().finite().min(-2147483648).max(2147483647)');
    expect(list).toContain('"ratio": z.coerce.number().finite()');
    expect(list).toContain('"published_at": z.coerce.date()');
    expect(list).toContain('"payload": z.unknown()');
    expect(list).toContain('"bytes": z.string().regex(/^(?:[A-Za-z0-9+/]{4})*');
    expect(list).toContain("}).strict().parse(await request.json())");
    expect(detail).toContain("const data = z.object({");
    expect(detail).toContain("}).strict().parse(await request.json())");
    expect(detail).toContain("where: { entry_id: parseBigIntPath(id) }");
    expect(detail).toContain('if (!/^(?:0|-?[1-9]\\d*)$/.test(value))');

    for (const code of [list, detail]) {
      const result = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
      expect((result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
    }
  });

  it("converts PHP-derived BigInt input strings after canonical validation", () => {
    const tables: TableDefinition[] = [{
      name: "ledger_entry",
      columns: [
        column({ name: "entry_id", type: "BigInt", isPrimary: true, isAutoIncrement: false }),
        column({ name: "amount", type: "BigInt", isPrimary: false, isAutoIncrement: false }),
      ],
    }];
    const code = generateApiStubs([
      analysis({
        fileName: "update-ledger-entry.php",
        inputParams: [parameter({ name: "entry_id" }), parameter({ name: "amount" })],
        dbOperations: [operation({ type: "UPDATE", table: "ledger_entry", columns: ["entry_id", "amount"] })],
      }),
    ], tables).get("app/api/ledger_entries/[id]/route.ts")!;

    expect(code).toContain('"entry_id": z.string().regex(/^(?:0|-?[1-9]\\d*)$/, "Expected a canonical integer string").transform((value) => BigInt(value))');
    expect(code).toContain('"amount": z.string().regex(/^(?:0|-?[1-9]\\d*)$/, "Expected a canonical integer string").transform((value) => BigInt(value))');
    expect(code).toContain("where: { entry_id: parseBigIntPath(id) }");
    expect(code).toContain("...data,");
    const result = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
    expect((result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });

  it("rejects generated-write system fields, unknown keys, and nested relation operations", () => {
    const tables: TableDefinition[] = [{
      name: "product",
      columns: [
        column({ name: "product_id", isPrimary: true, isAutoIncrement: true }),
        column({ name: "name", type: "String", isPrimary: false, isAutoIncrement: false }),
        column({ name: "created_at", type: "DateTime", isPrimary: false, isAutoIncrement: false, defaultValue: "now()" }),
      ],
    }];
    const code = generateApiStubs([], tables).get("app/api/products/route.ts")!;

    expect(code).toContain('"name": z.string()');
    expect(code).not.toContain('"product_id":');
    expect(code).not.toContain('"created_at":');
    expect(code).toContain("z.object({\n  \"name\": z.string(),\n}).strict()");
    expect(code).toContain("}).strict().parse(await request.json())");
  });

  it("generates a transaction for parent-child inserts and preserves batch detection", () => {
    const code = generateApiStubs([analysis({ inputParams: [parameter({ name: "title" })], dbOperations: [operation({ table: "catalog", columns: ["title"] }), operation({ table: "catalog_tag", columns: ["catalog_id", "tag_id"], inLoop: true, foreachArrayVar: "tags" })] })]).get("app/api/catalogs/route.ts")!;
    expect(code).toContain("prisma.$transaction");
    expect(code).toContain("tx.catalog.create");
    expect(code).toContain("tx.catalogTag.createMany");
    expect(code).toContain("NextResponse.json(jsonSafe(result), { status: 201 })");
  });

  it("generates safe file upload handling without trusting the client filename", () => {
    const code = generateApiStubs([analysis({ inputParams: [parameter({ name: "photo", source: "$_FILES" })], dbOperations: [operation({ columns: ["photo"] })] })]).get("app/api/products/route.ts")!;
    expect(code).toContain("request.formData()");
    expect(code).toContain('import { randomUUID } from "node:crypto"');
    expect(code).toContain('path.resolve(uploadDir, `${randomUUID()}${extension}`)');
    expect(code).toContain("detectImageExtension(bytes)");
    expect(code).toContain("Image exceeds 5 MB limit");
    expect(code).toContain("uploadedFilePaths.map((filePath) => unlink(filePath)");
    expect(code.indexOf(".parse(body)")).toBeLessThan(code.indexOf("await writeFile(upload.filePath, upload.bytes)"));
    const result = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
    expect((result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });

  it("persists mapped upload URLs as part of Prisma create data", () => {
    const code = generateApiStubs([
      analysis({
        inputParams: [parameter({ name: "photo", source: "$_FILES" })],
        dbOperations: [operation({ columns: ["photo"] })],
      }),
    ]).get("app/api/products/route.ts")!;

    expect(code).toContain('uploadData["photo"] = `/uploads/${path.basename(photoPath)}`;');
    expect(code).toContain("const dataWithUploads = { ...data, ...uploadData };");
    expect(code).toContain("data: {\n        ...dataWithUploads,");
  });

  it("persists mapped upload URLs as part of Prisma update data", () => {
    const code = generateApiStubs([
      analysis({
        fileName: "update-product.php",
        inputParams: [parameter({ name: "photo", source: "$_FILES" })],
        dbOperations: [operation({ type: "UPDATE", columns: ["photo"] })],
      }),
    ]).get("app/api/products/[id]/route.ts")!;

    expect(code).toContain("prisma.product.update");
    expect(code).toContain("data: {\n        ...dataWithUploads,");
  });

  it("rejects unmapped upload fields before writing a file", () => {
    const code = generateApiStubs([
      analysis({
        inputParams: [parameter({ name: "photo", source: "$_FILES" })],
        dbOperations: [operation({ columns: ["name"] })],
      }),
    ]).get("app/api/products/route.ts")!;

    expect(code).toContain("Upload field photo is not mapped to a writable database column");
    expect(code).toContain("TODO: Map upload field \"photo\"");
    expect(code).not.toContain("pendingUploads.push({ filePath: photoPath, bytes })");
  });

  it("uses form data for file-only handlers", () => {
    const code = generateApiStubs([analysis({ inputParams: [parameter({ name: "photo", source: "$_FILES" })], dbOperations: [operation({ columns: ["photo"] })] })]).get("app/api/products/route.ts")!;
    expect(code).toContain('const photo = formData.get("photo") as File | null');
    expect(code).not.toContain("const body = await request.json()");
  });
});

describe("schema-driven GET routes", () => {
  it("co-locates GET with inferred write routes and creates detail GET routes", () => {
    const tables: TableDefinition[] = [{ name: "product", columns: [column(), column({ name: "name", type: "String", isPrimary: false })] }];
    const stubs = generateApiStubs([analysis({ dbOperations: [operation()] })], tables);
    const list = stubs.get("app/api/products/route.ts")!;
    const detail = stubs.get("app/api/products/[id]/route.ts")!;
    expect(list).toContain("export async function POST");
    expect(list).toContain("export async function GET");
    expect(list).toContain("prisma.product.findMany");
    expect(list.match(/function jsonSafe\b/g)).toHaveLength(1);
    expect(detail).toContain("prisma.product.findUnique");
  });
});

describe("route consolidation", () => {
  it("fails fast instead of choosing a richer duplicate path and method", () => {
    expect(() => generateApiStubs([
      analysis({ fileName: "create-product.php", inputParams: [parameter({ name: "name" })], dbOperations: [operation()] }),
      analysis({ fileName: "insert-product.php", inputParams: [parameter({ name: "photo", source: "$_FILES" })], dbOperations: [operation({ columns: ["photo"] })] }),
    ])).toThrow("Conflicting PHP route analyses for POST app/api/products/route.ts: create-product.php, insert-product.php");
  });

  it("reports same-path same-method conflicts with distinct operations and fields", () => {
    expect(() => generateApiStubs([
      analysis({ fileName: "create-product.php", inputParams: [parameter({ name: "name" })], dbOperations: [operation({ columns: ["name"] })] }),
      analysis({ fileName: "save-product.php", inputParams: [parameter({ name: "state" })], dbOperations: [operation({ type: "UPDATE", columns: ["state"] })] }),
    ])).toThrow("Conflicting PHP route analyses for POST app/api/products/route.ts: create-product.php, save-product.php");
  });

  it("reports safe source-relative paths when nested files with the same basename collide", () => {
    expect(() => generateApiStubs([
      analysis({ fileName: "create.php", sourceRelativePath: "catalog/create.php", inputParams: [parameter({ name: "name" })], dbOperations: [operation()] }),
      analysis({ fileName: "create.php", sourceRelativePath: "inventory/create.php", inputParams: [parameter({ name: "sku" })], dbOperations: [operation()] }),
    ])).toThrow("catalog/create.php, inventory/create.php");
  });

  it("shares upload imports and helpers when different methods use the same route", () => {
    const stubs = generateApiStubs([
      analysis({ fileName: "update-product.php", inputParams: [parameter({ name: "photo", source: "$_FILES" })], dbOperations: [operation({ type: "UPDATE", columns: ["photo"] })] }),
      analysis({ fileName: "delete-product.php", dbOperations: [operation({ type: "DELETE", columns: [] })] }),
    ]);
    expect([...stubs.keys()]).toEqual(["app/api/products/[id]/route.ts"]);
    const code = stubs.get("app/api/products/[id]/route.ts")!;

    expect(code.match(/import \{ writeFile, mkdir, unlink \}/g)).toHaveLength(1);
    expect(code.match(/function detectImageExtension\b/g)).toHaveLength(1);
    expect(code).toContain("export async function PUT");
    expect(code).toContain("export async function DELETE");
    expect(code).toContain("await writeFile(upload.filePath, upload.bytes)");
  });
});

describe("optional generated-route authorization", () => {
  const protectedTables: TableDefinition[] = [
    { name: "product", columns: [column(), column({ name: "name", type: "String", isPrimary: false })] },
    { name: "article", columns: [column(), column({ name: "title", type: "String", isPrimary: false })] },
  ];

  it("does not add authorization by default", () => {
    const code = generateApiStubs([analysis({ dbOperations: [operation()] })], protectedTables)
      .get("app/api/products/route.ts")!;
    expect(code).not.toContain("requireActiveAccess");
  });

  it("protects inferred and schema-driven handlers with one shared import per route", () => {
    const stubs = generateApiStubs(
      [analysis({ dbOperations: [operation()] })],
      protectedTables,
      { requireAuth: true },
    );
    const productList = stubs.get("app/api/products/route.ts")!;
    const productDetail = stubs.get("app/api/products/[id]/route.ts")!;
    const articleList = stubs.get("app/api/articles/route.ts")!;
    const articleDetail = stubs.get("app/api/articles/[id]/route.ts")!;

    for (const code of [productList, productDetail, articleList, articleDetail]) {
      expect(code.match(/import \{ requireActiveAccess \}/g)).toHaveLength(1);
      expect(code).toContain('return NextResponse.json({ error: "Forbidden" }, { status: 403 })');
      const result = ts.transpileModule(code, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        reportDiagnostics: true,
      });
      expect((result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
    }
    expect(productList).toContain('requireActiveAccess("/products")');
    expect(productDetail.match(/requireActiveAccess\("\/products"\)/g)).toHaveLength(3);
    expect(articleList.match(/requireActiveAccess\("\/articles"\)/g)).toHaveLength(2);
    expect(articleDetail.match(/requireActiveAccess\("\/articles"\)/g)).toHaveLength(3);
  });
});

describe("schema identifier safety", () => {
  it("emits valid TypeScript for arbitrary PHP basenames", () => {
    for (const [fileName, schemaName] of [
      ["create product.php", "CreateProductSchema"],
      ["9.config.php", "Php9ConfigSchema"],
      ["日本語.php", "U65e5U672cU8a9eSchema"],
    ]) {
      const code = generateApiStubs([
        analysis({ fileName, inputParams: [parameter()], dbOperations: [operation()] }),
      ]).get("app/api/products/route.ts")!;
      expect(code).toContain(`const ${schemaName} = z.object(`);
      const result = ts.transpileModule(code, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        reportDiagnostics: true,
      });
      expect((result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
    }
  });

  it("fails fast when distinct analyses would generate the same route method", () => {
    expect(() => generateApiStubs([
      analysis({ fileName: "create product.php", dbOperations: [operation()] }),
      analysis({ fileName: "create.product.php", dbOperations: [operation()] }),
    ])).toThrow(/Conflicting PHP route analyses for POST app\/api\/products\/route\.ts/);
  });
});
