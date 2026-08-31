import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPreflightChecks } from "../src/preflight.js";
import { analyzePhpFile } from "../src/php-analyzer.js";
import { parseSchemaToPrisma } from "../src/schema-to-prisma.js";
import { generateApiStubs } from "../src/nextjs-stub-generator.js";

const fixtureDirectory = join(import.meta.dirname, "fixtures/generic-pipeline");
const temporaryDirectories: string[] = [];

function readFixture(name: string): string {
  return readFileSync(join(fixtureDirectory, name), "utf8");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("generic migration pipeline", () => {
  it("passes preflight, analyzes source, and generates a schema-backed API route", () => {
    const outputParent = mkdtempSync(join(tmpdir(), "wp-transfer-generic-"));
    temporaryDirectories.push(outputParent);

    const preflight = runPreflightChecks({
      sourcePath: fixtureDirectory,
      schemaPath: join(fixtureDirectory, "schema.md"),
      outputPath: join(outputParent, "generated", "app"),
    });
    expect(preflight.canProceed).toBe(true);

    const analysis = analyzePhpFile(readFixture("create-item.php"), "create-item.php");
    expect(analysis.dbOperations).toEqual([
      expect.objectContaining({
        type: "INSERT",
        table: "catalog_item",
        columns: ["name", "active"],
      }),
    ]);
    expect(analysis.inputParams.map((parameter) => parameter.name)).toEqual(["name", "active"]);
    expect(analysis.redirectTarget).toBe("catalog.php");

    const { tables, schema } = parseSchemaToPrisma(readFixture("schema.md"));
    expect(schema).toContain("model CatalogItem");
    expect(tables.map((table) => table.name)).toEqual(["catalog_item"]);

    const stubs = generateApiStubs([analysis], tables);
    const route = stubs.get("app/api/catalog_items/route.ts");
    expect(route).toContain("export async function GET");
    expect(route).toContain("prisma.catalogItem.findMany");
  });
});
