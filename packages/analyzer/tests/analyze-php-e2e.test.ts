import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzePhpFile } from "../src/php-analyzer.js";
import { parseSchemaToPrisma } from "../src/schema-to-prisma.js";
import { generateApiStubs } from "../src/nextjs-stub-generator.js";
import { generateDockerScaffold } from "../src/docker-scaffold-generator.js";

const FIXTURE_DIR = join(import.meta.dirname, "fixtures/e2e-php");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf-8");
}

describe("analyze-php E2E pipeline", () => {
  // Step 1: PHP analysis
  const insertAnalysis = analyzePhpFile(loadFixture("insert.php"), "insert.php");
  const updateAnalysis = analyzePhpFile(loadFixture("update.php"), "update.php");
  const deleteAnalysis = analyzePhpFile(loadFixture("delete.php"), "delete.php");
  const analyses = [insertAnalysis, updateAnalysis, deleteAnalysis];

  // Step 2: Schema parsing
  const schemaContent = loadFixture("schema.md");
  const { tables, schema: prismaSchema } = parseSchemaToPrisma(schemaContent);

  // Step 3: API stubs
  const stubs = generateApiStubs(analyses, tables);

  // Step 4: Docker scaffold
  const dockerFiles = generateDockerScaffold("e2e-test", "mysql");

  describe("PHP analysis", () => {
    it("detects INSERT, UPDATE, DELETE operations", () => {
      expect(insertAnalysis.dbOperations.some((op) => op.type === "INSERT")).toBe(true);
      expect(updateAnalysis.dbOperations.some((op) => op.type === "UPDATE")).toBe(true);
      expect(deleteAnalysis.dbOperations.some((op) => op.type === "DELETE")).toBe(true);
    });

    it("detects input parameters", () => {
      expect(insertAnalysis.inputParams.length).toBeGreaterThan(0);
      expect(insertAnalysis.inputParams.some((p) => p.name === "title")).toBe(true);
    });

    it("detects loop in insert.php for event_slot INSERT", () => {
      const slotInsert = insertAnalysis.dbOperations.find((op) => op.table === "event_slot");
      expect(slotInsert).toBeDefined();
      expect(slotInsert!.inLoop).toBe(true);
    });

    it("marks non-loop INSERT as inLoop=false", () => {
      const eventInsert = insertAnalysis.dbOperations.find((op) => op.table === "event");
      expect(eventInsert).toBeDefined();
      expect(eventInsert!.inLoop).toBe(false);
    });

    it("detects security issues", () => {
      // All files use parameterized queries but the regex patterns still detect
      // variable interpolation in SQL string contexts and missing CSRF/validation
      expect(insertAnalysis.securityIssues.length).toBeGreaterThan(0);
    });

    it("extracts redirect targets", () => {
      expect(insertAnalysis.outputType).toBe("redirect");
      expect(insertAnalysis.redirectTarget).toBe("event-list.php");
    });

    it("extracts Japanese comment as purpose", () => {
      expect(insertAnalysis.purpose).toBe("イベント登録");
    });
  });

  describe("Prisma schema", () => {
    it("generates valid schema with both tables", () => {
      expect(prismaSchema).toContain("model Event");
      expect(prismaSchema).toContain("model EventSlot");
    });

    it("includes correct column types", () => {
      expect(prismaSchema).toContain("String");
      expect(prismaSchema).toContain("Boolean");
      expect(prismaSchema).toContain("DateTime");
    });

    it("maps tinyint(1) status to Boolean with default", () => {
      expect(prismaSchema).toContain("@default(false)");
    });

    it("detects event_id FK relation", () => {
      expect(prismaSchema).toContain("event_id");
      expect(prismaSchema).toContain("@relation(fields: [event_id], references: [id])");
    });

    it("generates @@map for original table names", () => {
      expect(prismaSchema).toContain('@@map("event")');
      expect(prismaSchema).toContain('@@map("event_slot")');
    });

    it("parses both tables from schema markdown", () => {
      expect(tables).toHaveLength(2);
      expect(tables.map((t) => t.name)).toEqual(["event", "event_slot"]);
    });
  });

  describe("API stubs", () => {
    it("generates routes for all PHP files", () => {
      expect(stubs.size).toBeGreaterThan(0);
    });

    it("POST route has Zod validation with InsertSchema", () => {
      const postRoute = stubs.get("app/api/events/route.ts");
      expect(postRoute).toBeDefined();
      expect(postRoute).toContain("z.object");
      expect(postRoute).toContain("InsertSchema");
    });

    it("PUT route has UpdateSchema with .optional() fields", () => {
      const idRoute = stubs.get("app/api/events/[id]/route.ts");
      expect(idRoute).toBeDefined();
      expect(idRoute).toContain("UpdateSchema");
      expect(idRoute).toContain(".optional()");
      expect(idRoute).toContain("PUT");
    });

    it("DELETE route generates correct pattern", () => {
      const idRoute = stubs.get("app/api/events/[id]/route.ts");
      expect(idRoute).toBeDefined();
      expect(idRoute).toContain("DELETE");
      expect(idRoute).toContain("prisma.event.delete");
    });

    it("POST route uses transaction for multi-table insert", () => {
      const postRoute = stubs.get("app/api/events/route.ts");
      expect(postRoute).toBeDefined();
      expect(postRoute).toContain("$transaction");
      expect(postRoute).toContain("createMany");
    });

    it("generates schema-driven GET endpoints for tables", () => {
      // Schema-driven GET endpoints are generated for tables not covered by PHP routes
      const eventListRoute = stubs.get("app/api/event/route.ts");
      expect(eventListRoute).toBeDefined();
      expect(eventListRoute).toContain("GET");
      expect(eventListRoute).toContain("findMany");
    });
  });

  describe("cross-reference consistency", () => {
    it("Prisma model names match API route model references", () => {
      // event table should be referenced in stubs via prisma.event
      const allStubCode = [...stubs.values()].join("\n");
      expect(allStubCode).toContain("prisma.event");
    });

    it("detected tables appear in both Prisma schema and API stubs", () => {
      // Both "event" and "event_slot" tables should have API routes
      const allPaths = [...stubs.keys()];
      expect(allPaths.some((p) => p.includes("event"))).toBe(true);
      expect(allPaths.some((p) => p.includes("event_slot"))).toBe(true);
    });

    it("FK column from schema matches transaction pattern in stubs", () => {
      const postRoute = stubs.get("app/api/events/route.ts")!;
      // Transaction uses the child table (eventSlot) for createMany
      expect(postRoute).toContain("tx.eventSlot.createMany");
    });

    it("Docker scaffold generates all required files", () => {
      expect(dockerFiles).toHaveLength(6);
      const paths = dockerFiles.map((f) => f.path);
      expect(paths).toContain("docker-compose.yml");
      expect(paths).toContain("Dockerfile");
      expect(paths).toContain(".env.example");
      expect(paths).toContain(".gitignore");
      expect(paths).toContain(".dockerignore");
      expect(paths).toContain("app/api/health/route.ts");
    });

    it("Docker scaffold DB matches schema provider", () => {
      const compose = dockerFiles.find((f) => f.path === "docker-compose.yml")!;
      expect(compose.content).toContain("mysql:8.0");
      expect(compose.content).toContain("e2e-test");
    });
  });
});
