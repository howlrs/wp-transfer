import { describe, it, expect } from "vitest";
import { generateApiStubs } from "../src/nextjs-stub-generator.js";
import type { PhpFileAnalysis, InputParam, DbOperation } from "../src/php-analyzer.js";
import type { TableDefinition, ColumnDefinition } from "../src/schema-to-prisma.js";

// ── Helper to build PhpFileAnalysis fixtures ──

function makeAnalysis(overrides: Partial<PhpFileAnalysis>): PhpFileAnalysis {
  return {
    fileName: "insert.php",
    purpose: "Create new record",
    dbOperations: [],
    inputParams: [],
    outputType: "redirect",
    securityIssues: [],
    ...overrides,
  };
}

function makeParam(overrides: Partial<InputParam>): InputParam {
  return {
    name: "field",
    source: "$_POST",
    usage: "$field = $_POST[\"field\"];",
    ...overrides,
  };
}

function makeDbOp(overrides: Partial<DbOperation>): DbOperation {
  return {
    type: "INSERT",
    table: "event",
    columns: ["title"],
    ...overrides,
  };
}

function makeColumn(overrides: Partial<ColumnDefinition>): ColumnDefinition {
  return {
    name: "field",
    type: "String",
    nullable: true,
    isPrimary: false,
    isAutoIncrement: false,
    ...overrides,
  };
}

function makeTable(
  name: string,
  columns: ColumnDefinition[],
): TableDefinition {
  return { name, columns };
}

// ── Tests ──

describe("Improvement 1: Enhanced Zod Type Inference", () => {
  describe("A) Name-based heuristics", () => {
    it("maps *_time, *_date, *_at params to z.string() (datetime)", () => {
      const analysis = makeAnalysis({
        fileName: "insert.php",
        inputParams: [
          makeParam({ name: "start_time" }),
          makeParam({ name: "event_date" }),
          makeParam({ name: "created_at" }),
        ],
        dbOperations: [makeDbOp()],
      });

      const stubs = generateApiStubs([analysis]);
      const code = stubs.get("app/api/events/route.ts")!;

      expect(code).toContain("start_time: z.string()");
      expect(code).toContain("event_date: z.string()");
      expect(code).toContain("created_at: z.string()");
    });

    it("maps *_type, *_mode, *_status to z.coerce.number().int() with TODO for enum range", () => {
      const analysis = makeAnalysis({
        fileName: "insert.php",
        inputParams: [
          makeParam({ name: "recruiting_type" }),
          makeParam({ name: "recruiting_mode" }),
          makeParam({ name: "event_status" }),
        ],
        dbOperations: [makeDbOp()],
      });

      const stubs = generateApiStubs([analysis]);
      const code = stubs.get("app/api/events/route.ts")!;

      expect(code).toContain("recruiting_type: z.coerce.number().int()");
      expect(code).toContain("recruiting_mode: z.coerce.number().int()");
      expect(code).toContain("event_status: z.coerce.number().int()");
      // Should have TODO for enum range
      expect(code).toContain("// TODO: Consider adding enum range validation");
    });

    it("maps *_limit, *_probability, *_current, *_counter to z.coerce.number().int().min(0)", () => {
      const analysis = makeAnalysis({
        fileName: "insert.php",
        inputParams: [
          makeParam({ name: "entry_limit" }),
          makeParam({ name: "winners_probability" }),
          makeParam({ name: "access_current" }),
          makeParam({ name: "view_counter" }),
        ],
        dbOperations: [makeDbOp()],
      });

      const stubs = generateApiStubs([analysis]);
      const code = stubs.get("app/api/events/route.ts")!;

      expect(code).toContain("entry_limit: z.coerce.number().int().min(0)");
      expect(code).toContain("winners_probability: z.coerce.number().int().min(0)");
      expect(code).toContain("access_current: z.coerce.number().int().min(0)");
      expect(code).toContain("view_counter: z.coerce.number().int().min(0)");
    });

    it("maps cancel_mode, preview_mode, *_flg, blacklist to boolean preprocess", () => {
      const analysis = makeAnalysis({
        fileName: "insert.php",
        inputParams: [
          makeParam({ name: "cancel_mode" }),
          makeParam({ name: "preview_mode" }),
          makeParam({ name: "disp_flg" }),
          makeParam({ name: "blacklist" }),
        ],
        dbOperations: [makeDbOp()],
      });

      const stubs = generateApiStubs([analysis]);
      const code = stubs.get("app/api/events/route.ts")!;

      // These should use boolean preprocess pattern
      expect(code).toContain('cancel_mode: z.preprocess((v) => v === "1" || v === 1 || v === true, z.boolean())');
      expect(code).toContain('preview_mode: z.preprocess((v) => v === "1" || v === 1 || v === true, z.boolean())');
      expect(code).toContain('disp_flg: z.preprocess((v) => v === "1" || v === 1 || v === true, z.boolean())');
      expect(code).toContain('blacklist: z.preprocess((v) => v === "1" || v === 1 || v === true, z.boolean())');
    });

    it("maps params with [] suffix to z.array(z.string())", () => {
      const analysis = makeAnalysis({
        fileName: "insert.php",
        inputParams: [
          makeParam({ name: "event_time_text[]" }),
          makeParam({ name: "slot_ids[]" }),
        ],
        dbOperations: [makeDbOp()],
      });

      const stubs = generateApiStubs([analysis]);
      const code = stubs.get("app/api/events/route.ts")!;

      // Array params should NOT be excluded, they should get array type
      expect(code).toContain("event_time_text: z.array(z.string())");
      expect(code).toContain("slot_ids: z.array(z.string())");
    });
  });

  describe("B) DB schema-driven enhancement", () => {
    it("uses tinyint(1) / Boolean column to generate boolean preprocess", () => {
      const tables: TableDefinition[] = [
        makeTable("event", [
          makeColumn({ name: "id", type: "Int", isPrimary: true }),
          makeColumn({ name: "disp_mode", type: "Boolean", nullable: false }),
        ]),
      ];

      const analysis = makeAnalysis({
        fileName: "insert.php",
        inputParams: [makeParam({ name: "disp_mode" })],
        dbOperations: [makeDbOp({ table: "event" })],
      });

      const stubs = generateApiStubs([analysis], tables);
      const code = stubs.get("app/api/events/route.ts")!;

      expect(code).toContain('disp_mode: z.preprocess((v) => v === "1" || v === 1 || v === true, z.boolean())');
    });

    it("does not override name-based heuristic when DB schema agrees", () => {
      const tables: TableDefinition[] = [
        makeTable("event", [
          makeColumn({ name: "id", type: "Int", isPrimary: true }),
          makeColumn({ name: "start_time", type: "DateTime", nullable: true }),
        ]),
      ];

      const analysis = makeAnalysis({
        fileName: "insert.php",
        inputParams: [makeParam({ name: "start_time" })],
        dbOperations: [makeDbOp({ table: "event" })],
      });

      const stubs = generateApiStubs([analysis], tables);
      const code = stubs.get("app/api/events/route.ts")!;

      // start_time should still be z.string() because it comes from HTML input
      expect(code).toContain("start_time: z.string()");
    });
  });

  describe("C) PHP empty string -> null preprocessing", () => {
    it("generates preprocess for optional string fields", () => {
      const tables: TableDefinition[] = [
        makeTable("event", [
          makeColumn({ name: "id", type: "Int", isPrimary: true }),
          makeColumn({ name: "subtitle", type: "String", nullable: true }),
        ]),
      ];

      const analysis = makeAnalysis({
        fileName: "insert.php",
        inputParams: [makeParam({ name: "subtitle" })],
        dbOperations: [makeDbOp({ table: "event" })],
      });

      const stubs = generateApiStubs([analysis], tables);
      const code = stubs.get("app/api/events/route.ts")!;

      expect(code).toContain(
        'subtitle: z.preprocess((v) => v === "" ? undefined : v, z.string().optional())',
      );
    });
  });
});

describe("Improvement 2: Transaction Detection", () => {
  it("wraps in $transaction when multiple INSERTs to different tables", () => {
    const analysis = makeAnalysis({
      fileName: "insert.php",
      inputParams: [makeParam({ name: "title" })],
      dbOperations: [
        makeDbOp({ type: "INSERT", table: "event", columns: ["title"] }),
        makeDbOp({ type: "INSERT", table: "event_slot", columns: ["event_id", "time_stamp"] }),
      ],
    });

    const stubs = generateApiStubs([analysis]);
    const code = stubs.get("app/api/events/route.ts")!;

    expect(code).toContain("prisma.$transaction");
  });

  it("generates parent->child pattern for 2 INSERTs to different tables", () => {
    const analysis = makeAnalysis({
      fileName: "insert.php",
      inputParams: [makeParam({ name: "title" })],
      dbOperations: [
        makeDbOp({ type: "INSERT", table: "event", columns: ["title"] }),
        makeDbOp({ type: "INSERT", table: "event_slot", columns: ["event_id", "time_stamp"] }),
      ],
    });

    const stubs = generateApiStubs([analysis]);
    const code = stubs.get("app/api/events/route.ts")!;

    // Should create parent first, then use its ID for child
    expect(code).toContain("tx.event.create");
    expect(code).toContain("tx.eventSlot.create");
  });

  it("wraps in $transaction when INSERT + SELECT on same table (check-then-insert)", () => {
    const analysis = makeAnalysis({
      fileName: "insert.php",
      inputParams: [makeParam({ name: "title" })],
      dbOperations: [
        makeDbOp({ type: "SELECT", table: "event", columns: ["*"] }),
        makeDbOp({ type: "INSERT", table: "event", columns: ["title"] }),
      ],
    });

    const stubs = generateApiStubs([analysis]);
    const code = stubs.get("app/api/events/route.ts")!;

    expect(code).toContain("prisma.$transaction");
  });

  it("adds TODO comment when transaction pattern is ambiguous", () => {
    // 3 INSERTs to 3 different tables — ambiguous
    const analysis = makeAnalysis({
      fileName: "insert.php",
      inputParams: [makeParam({ name: "title" })],
      dbOperations: [
        makeDbOp({ type: "INSERT", table: "event", columns: ["title"] }),
        makeDbOp({ type: "INSERT", table: "event_slot", columns: ["event_id"] }),
        makeDbOp({ type: "INSERT", table: "lottery", columns: ["event_id"] }),
      ],
    });

    const stubs = generateApiStubs([analysis]);
    const code = stubs.get("app/api/events/route.ts")!;

    expect(code).toContain("prisma.$transaction");
    expect(code).toContain("// TODO: Manual Transaction Adjustment");
  });

  it("detects lastInsertId pattern: INSERT A then INSERT B referencing A", () => {
    const analysis = makeAnalysis({
      fileName: "insert.php",
      inputParams: [makeParam({ name: "title" })],
      dbOperations: [
        makeDbOp({ type: "INSERT", table: "event", columns: ["title"] }),
        makeDbOp({
          type: "INSERT",
          table: "event_slot",
          columns: ["event_id", "time_stamp"],
        }),
      ],
    });

    const stubs = generateApiStubs([analysis]);
    const code = stubs.get("app/api/events/route.ts")!;

    // Should detect that event_slot.event_id references event
    // and generate parent.id usage
    expect(code).toContain("parent.id");
  });
});

describe("Improvement 3: File Upload Detection", () => {
  it("generates formData() when $_FILES params exist", () => {
    const analysis = makeAnalysis({
      fileName: "insert_information.php",
      inputParams: [
        makeParam({ name: "title" }),
        makeParam({ name: "banner_img", source: "$_FILES" }),
      ],
      dbOperations: [
        makeDbOp({ type: "INSERT", table: "information", columns: ["title"] }),
      ],
    });

    const stubs = generateApiStubs([analysis]);
    const code = stubs.get("app/api/information/route.ts")!;

    expect(code).toContain("request.formData()");
    // Should NOT contain request.json() when files are present
    expect(code).not.toContain("request.json()");
  });

  it("adds file handling code with writeFile/mkdir imports", () => {
    const analysis = makeAnalysis({
      fileName: "insert_information.php",
      inputParams: [
        makeParam({ name: "title" }),
        makeParam({ name: "banner_img", source: "$_FILES" }),
      ],
      dbOperations: [
        makeDbOp({ type: "INSERT", table: "information", columns: ["title"] }),
      ],
    });

    const stubs = generateApiStubs([analysis]);
    const code = stubs.get("app/api/information/route.ts")!;

    expect(code).toContain('import { writeFile, mkdir } from "node:fs/promises"');
    expect(code).toContain('import path from "node:path"');
  });

  it("generates file handling for each file field", () => {
    const analysis = makeAnalysis({
      fileName: "insert_information.php",
      inputParams: [
        makeParam({ name: "title" }),
        makeParam({ name: "banner_img", source: "$_FILES" }),
      ],
      dbOperations: [
        makeDbOp({ type: "INSERT", table: "information", columns: ["title"] }),
      ],
    });

    const stubs = generateApiStubs([analysis]);
    const code = stubs.get("app/api/information/route.ts")!;

    expect(code).toContain('formData.get("banner_img")');
    expect(code).toContain("File | null");
    expect(code).toContain("public/uploads");
  });

  it("separates file params from regular form params in Zod schema", () => {
    const analysis = makeAnalysis({
      fileName: "insert_information.php",
      inputParams: [
        makeParam({ name: "title" }),
        makeParam({ name: "banner_img", source: "$_FILES" }),
      ],
      dbOperations: [
        makeDbOp({ type: "INSERT", table: "information", columns: ["title"] }),
      ],
    });

    const stubs = generateApiStubs([analysis]);
    const code = stubs.get("app/api/information/route.ts")!;

    // File params should NOT appear in the Zod schema
    expect(code).not.toMatch(/banner_img:\s*z\./);
    // Regular params should be in the schema
    expect(code).toContain("title: z.string()");
  });
});

describe("Improvement 4: Zod Schema for PUT/DELETE", () => {
  it("generates Zod schema for PUT route handlers", () => {
    const analysis = makeAnalysis({
      fileName: "update.php",
      inputParams: [
        makeParam({ name: "title" }),
        makeParam({ name: "date", source: "$_POST" }),
      ],
      dbOperations: [makeDbOp({ type: "UPDATE", table: "event", columns: ["title", "date"] })],
    });
    const stubs = generateApiStubs([analysis]);
    const code = stubs.get("app/api/events/[id]/route.ts")!;
    expect(code).toBeDefined();
    expect(code).toContain("z.object");
    expect(code).toContain("title:");
  });

  it("generates update body for DELETE with body params (soft-delete)", () => {
    const analysis = makeAnalysis({
      fileName: "user-blacklist-out.php",
      inputParams: [
        makeParam({ name: "blacklist" }),
      ],
      dbOperations: [makeDbOp({ type: "UPDATE", table: "user", columns: ["blacklist"] })],
    });
    const stubs = generateApiStubs([analysis]);
    const code = stubs.get("app/api/users/[id]/blacklist/route.ts")!;
    expect(code).toBeDefined();
    expect(code).toContain("z.object");
    expect(code).toContain("...data");
    expect(code).not.toMatch(/data:\s*\{\s*\}/);
  });

  it("generates hard delete for DELETE without body params", () => {
    const analysis = makeAnalysis({
      fileName: "delete.php",
      dbOperations: [makeDbOp({ type: "DELETE", table: "event", columns: [] })],
      inputParams: [],
    });
    const stubs = generateApiStubs([analysis]);
    const code = stubs.get("app/api/events/[id]/route.ts")!;
    expect(code).toBeDefined();
    expect(code).toContain(".delete(");
    expect(code).not.toContain("z.object");
  });
});
