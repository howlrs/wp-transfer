# Issue #13: Generator Bugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 generator blockers found during Client A dogfooding — Prisma PK detection, API Zod schema generation, admin form fields, and Docker package manager.

**Architecture:** Four independent generators fixed in bottom-up order (Docker → Prisma → API → Admin). Each fix includes regression tests. All changes are to generators (code that generates code), not to the generated output.

**Tech Stack:** TypeScript 6.0.2, vitest 4.1.3

---

## File Map

- Modify: `packages/analyzer/src/docker-scaffold-generator.ts` (lines 90-123)
- Modify: `packages/analyzer/tests/docker-scaffold-generator.test.ts`
- Modify: `packages/analyzer/src/schema-to-prisma.ts` (lines 288-431)
- Modify: `packages/analyzer/tests/schema-to-prisma.test.ts`
- Modify: `packages/analyzer/src/nextjs-stub-generator.ts` (lines 429-489, 687-752)
- Modify: `packages/analyzer/tests/nextjs-stub-generator.test.ts`
- Modify: `packages/analyzer/src/admin-scaffold-generator.ts` (lines 294-327)
- Modify: `packages/analyzer/tests/admin-scaffold-generator.test.ts`

---

### Task 1: Docker — Replace pnpm with npm

**Files:**
- Modify: `packages/analyzer/src/docker-scaffold-generator.ts:90-123`
- Modify: `packages/analyzer/tests/docker-scaffold-generator.test.ts`

- [ ] **Step 1: Write failing test**

Add to the docker-scaffold-generator test file inside the existing describe block:

```typescript
  it("generates Dockerfile with npm instead of pnpm", () => {
    const files = generateDockerScaffold("test-app", "mysql");
    const dockerfile = files.find((f) => f.path === "Dockerfile");
    expect(dockerfile!.content).toContain("npm ci");
    expect(dockerfile!.content).toContain("npm run build");
    expect(dockerfile!.content).not.toContain("pnpm");
    expect(dockerfile!.content).not.toContain("corepack");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/analyzer/tests/docker-scaffold-generator.test.ts`
Expected: FAIL — "pnpm" found, "npm ci" not found

- [ ] **Step 3: Fix generateDockerfile**

In `packages/analyzer/src/docker-scaffold-generator.ts`, replace the entire `generateDockerfile()` function (lines 90-124):

```typescript
function generateDockerfile(): string {
  return `# Stage 1: Install dependencies
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: Production
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

CMD ["node", "server.js"]
`;
}
```

- [ ] **Step 4: Update existing tests that assert pnpm**

Find and fix any existing tests that assert `pnpm` presence. The test "generates valid Dockerfile with multi-stage build" likely checks for pnpm. Update those assertions to check for `npm ci` and `npm run build` instead.

- [ ] **Step 5: Run tests to verify all pass**

Run: `npx vitest run packages/analyzer/tests/docker-scaffold-generator.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/analyzer/src/docker-scaffold-generator.ts packages/analyzer/tests/docker-scaffold-generator.test.ts
git commit -m "fix(analyzer): Docker scaffold uses npm instead of pnpm (#13)

Generated Dockerfile now uses npm ci / npm run build.
Removes corepack/pnpm dependency from generated projects."
```

---

### Task 2: Prisma PK fallback — @id for tables without PRIMARY KEY

**Files:**
- Modify: `packages/analyzer/src/schema-to-prisma.ts:333-431`
- Modify: `packages/analyzer/tests/schema-to-prisma.test.ts`

- [ ] **Step 1: Write failing tests**

Add to schema-to-prisma test file:

```typescript
  it("adds @id fallback to 'id' column when no PRIMARY KEY defined", () => {
    const tables: TableDefinition[] = [{
      name: "sessions",
      columns: [
        { name: "id", type: "String", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "" },
        { name: "data", type: "String", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "" },
      ],
      note: "",
    }];
    const schema = generatePrismaSchema(tables);
    expect(schema).toContain("id  String  @id");
    // id should be non-nullable when promoted to PK
    expect(schema).not.toContain("id  String?  @id");
  });

  it("adds @id fallback to table_name_id column when no PK and no 'id'", () => {
    const tables: TableDefinition[] = [{
      name: "gps_area",
      columns: [
        { name: "area_id", type: "Int", nullable: false, isPrimary: false, isAutoIncrement: false, comment: "" },
        { name: "name", type: "String", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "" },
      ],
      note: "",
    }];
    const schema = generatePrismaSchema(tables);
    expect(schema).toContain("area_id  Int  @id");
  });

  it("adds @@id for junction tables with multiple _id columns and no PK", () => {
    const tables: TableDefinition[] = [{
      name: "m_coupon_target_stores",
      columns: [
        { name: "coupon_id", type: "Int", nullable: false, isPrimary: false, isAutoIncrement: false, comment: "" },
        { name: "store_id", type: "Int", nullable: false, isPrimary: false, isAutoIncrement: false, comment: "" },
      ],
      note: "",
    }];
    const schema = generatePrismaSchema(tables);
    expect(schema).toContain("@@id([coupon_id, store_id])");
  });

  it("promotes nullable id to non-nullable when used as PK fallback", () => {
    const tables: TableDefinition[] = [{
      name: "test",
      columns: [
        { name: "id", type: "Int", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "" },
        { name: "value", type: "String", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "" },
      ],
      note: "",
    }];
    const schema = generatePrismaSchema(tables);
    expect(schema).toContain("id  Int  @id");
    expect(schema).not.toContain("id  Int?");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/analyzer/tests/schema-to-prisma.test.ts`
Expected: FAIL — no @id on these models

- [ ] **Step 3: Add PK fallback logic to generatePrismaSchema**

In `packages/analyzer/src/schema-to-prisma.ts`, add a helper function before `generatePrismaSchema`:

```typescript
function ensurePrimaryKey(table: TableDefinition): { columns: ColumnDefinition[]; compositeId: string[] | null } {
  // Already has a PK
  if (table.columns.some((c) => c.isPrimary)) {
    return { columns: table.columns, compositeId: null };
  }

  const columns = table.columns.map((c) => ({ ...c }));

  // Try 1: column named "id"
  const idCol = columns.find((c) => c.name === "id");
  if (idCol) {
    idCol.isPrimary = true;
    idCol.nullable = false;
    return { columns, compositeId: null };
  }

  // Try 2: column named like "xxx_id" matching part of table name
  const tableWords = table.name.split("_");
  for (const col of columns) {
    if (col.name.endsWith("_id")) {
      const prefix = col.name.slice(0, -3);
      if (tableWords.includes(prefix) || table.name.includes(prefix)) {
        col.isPrimary = true;
        col.nullable = false;
        return { columns, compositeId: null };
      }
    }
  }

  // Try 3: multiple _id columns → composite key (junction table)
  const idCols = columns.filter((c) => c.name.endsWith("_id"));
  if (idCols.length >= 2) {
    return { columns, compositeId: idCols.map((c) => c.name) };
  }

  // Try 4: single _id column
  if (idCols.length === 1) {
    idCols[0]!.isPrimary = true;
    idCols[0]!.nullable = false;
    return { columns, compositeId: null };
  }

  // Last resort: first column
  if (columns.length > 0) {
    columns[0]!.isPrimary = true;
    columns[0]!.nullable = false;
  }

  return { columns, compositeId: null };
}
```

Then in `generatePrismaSchema`, replace the column iteration block (lines 370-425). After `const modelName = ...` (line 377), add the PK check:

```typescript
    const { columns: resolvedColumns, compositeId } = ensurePrimaryKey(table);

    for (const col of resolvedColumns) {
      lines.push(prismaFieldLine(col));
    }
```

And before `@@map`, add the composite key:

```typescript
    if (compositeId) {
      lines.push(`  @@id([${compositeId.join(", ")}])`);
    }
```

Also update the relation and index code to use `resolvedColumns` instead of `table.columns` where columns are searched.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/analyzer/tests/schema-to-prisma.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/analyzer/src/schema-to-prisma.ts packages/analyzer/tests/schema-to-prisma.test.ts
git commit -m "fix(analyzer): Prisma PK fallback for tables without PRIMARY KEY (#13)

- id column → @id promotion (non-nullable)
- table_name_id column → @id
- Multiple _id columns → @@id composite key (junction tables)
- Last resort: first column as @id with TODO"
```

---

### Task 3: API route — Generate Zod schema for PUT/DELETE handlers

**Files:**
- Modify: `packages/analyzer/src/nextjs-stub-generator.ts:429-489, 687-752`
- Modify: `packages/analyzer/tests/nextjs-stub-generator.test.ts`

- [ ] **Step 1: Write failing tests**

Add to nextjs-stub-generator test file:

```typescript
  it("generates Zod schema for PUT route handlers", () => {
    const analysis: PhpFileAnalysis = {
      fileName: "update.php",
      dbOperations: [{ type: "UPDATE", table: "event", columns: ["title", "date"] }],
      inputParams: [
        { name: "title", source: "$_POST" },
        { name: "date", source: "$_POST" },
      ],
      securityIssues: [],
    };
    const stubs = generateApiStubs([analysis]);
    const route = stubs.find((s) => s.path.includes("events"));
    expect(route).toBeDefined();
    expect(route!.content).toContain("Schema");
    expect(route!.content).toContain("z.object");
    // Schema should be defined before use
    expect(route!.content).not.toMatch(/\bSchema\.parse\b[\s\S]*?const \w+Schema/);
  });

  it("generates data fields for DELETE with soft-delete pattern", () => {
    const analysis: PhpFileAnalysis = {
      fileName: "user-blacklist.php",
      dbOperations: [{ type: "UPDATE", table: "user", columns: ["blacklist"] }],
      inputParams: [
        { name: "blacklist", source: "$_POST" },
      ],
      securityIssues: [],
    };
    const stubs = generateApiStubs([analysis]);
    const route = stubs.find((s) => s.path.includes("users"));
    expect(route).toBeDefined();
    // Should not have empty data object
    expect(route!.content).not.toMatch(/data:\s*\{\s*\}/);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/analyzer/tests/nextjs-stub-generator.test.ts`
Expected: FAIL

- [ ] **Step 3: Fix generateRouteHandler for PUT/DELETE**

In `packages/analyzer/src/nextjs-stub-generator.ts`, modify the `hasBody` check (line 459):

Change:
```typescript
  const hasBody = bodyParams.length > 0 && mapping.method !== "DELETE";
```
To:
```typescript
  const hasBody = bodyParams.length > 0;
```

This ensures PUT and DELETE routes with body params also get Zod schemas generated.

Then fix `generateDirectBody` for DELETE (lines 727-739). When the DB operation is actually an UPDATE (soft-delete pattern), generate update with data:

```typescript
    case "DELETE":
      if (hasBody) {
        // Soft-delete / flag update pattern
        lines.push(`    const result = await prisma.${modelName}.update({`);
        if (hasPathParams) {
          lines.push(`      where: { id: ${pathParams[0]} },`);
        } else {
          lines.push("      where: { id: parseInt(request.nextUrl.searchParams.get('id') ?? '0') },");
        }
        lines.push("      data: {");
        lines.push("        ...data,");
        lines.push("      },");
        lines.push("    });");
        lines.push("");
        lines.push("    return NextResponse.json(result);");
      } else {
        lines.push(`    await prisma.${modelName}.delete({`);
        if (hasPathParams) {
          lines.push(`      where: { id: ${pathParams[0]} },`);
        } else {
          lines.push("      where: { id: parseInt(request.nextUrl.searchParams.get('id') ?? '0') },");
        }
        lines.push("    });");
        lines.push("");
        lines.push('    return NextResponse.json({ success: true });');
      }
      break;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/analyzer/tests/nextjs-stub-generator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/analyzer/src/nextjs-stub-generator.ts packages/analyzer/tests/nextjs-stub-generator.test.ts
git commit -m "fix(analyzer): generate Zod schema for PUT/DELETE route handlers (#13)

- PUT routes now generate Zod validation schema
- DELETE with body params uses update (soft-delete pattern)
- DELETE without body params uses delete (hard delete)"
```

---

### Task 4: Admin scaffold — Form field fallback from table columns

**Files:**
- Modify: `packages/analyzer/src/admin-scaffold-generator.ts:294-327`
- Modify: `packages/analyzer/tests/admin-scaffold-generator.test.ts`

- [ ] **Step 1: Write failing test**

Add to admin-scaffold-generator test file:

```typescript
  it("generates form fields from table columns when analysis has no input params", () => {
    const analyses: PhpFileAnalysis[] = [{
      fileName: "page-event-copy.php",
      dbOperations: [{ type: "INSERT", table: "event", columns: ["title", "date"] }],
      inputParams: [],
      securityIssues: [],
    }];
    const tables: TableDefinition[] = [{
      name: "event",
      columns: [
        { name: "id", type: "Int", nullable: false, isPrimary: true, isAutoIncrement: true, comment: "ID" },
        { name: "title", type: "String", nullable: false, isPrimary: false, isAutoIncrement: false, comment: "タイトル" },
        { name: "event_date", type: "DateTime", nullable: true, isPrimary: false, isAutoIncrement: false, comment: "開催日" },
      ],
      note: "",
    }];
    const pages = generateAdminScaffold(analyses, tables);
    const copyPage = pages.find((p) => p.path.includes("copy"));
    expect(copyPage).toBeDefined();
    // Should have form fields from table (excluding PK autoincrement)
    expect(copyPage!.content).toContain("title");
    expect(copyPage!.content).toContain("event_date");
    // Should NOT have the auto-increment PK
    expect(copyPage!.content).not.toMatch(/<input[^>]*name="id"/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/analyzer/tests/admin-scaffold-generator.test.ts`
Expected: FAIL — form fields are empty

- [ ] **Step 3: Fix generateFormPage fallback**

In `packages/analyzer/src/admin-scaffold-generator.ts`, the `generateFormPage` function (line 294-327) already has the correct fallback logic at lines 318-327:

```typescript
  } else if (table) {
    for (const col of table.columns) {
      if (col.isPrimary && col.isAutoIncrement) continue;
      formFields.push({ ... });
    }
  }
```

The issue is likely that `findTableForResource` doesn't find the table for certain resources. Check `findTableForResource` (lines 104-120) — it tries exact match, singular (-s strip), and underscored. For "event" resource with "event" table, it should match.

Debug by checking if the `analysis.inputParams` path (lines 307-317) is triggered with an empty array. If `analysis.inputParams.length > 0` is false (empty), it falls through to the `else if (table)` branch — which is correct. But the issue is that if `analysis.inputParams` is actually populated (with params that get filtered out on lines 309-310), the else branch never runs.

The fix: After the inputParams loop, if `formFields` is still empty, fall through to the table columns:

```typescript
  if (analysis && analysis.inputParams.length > 0) {
    for (const param of analysis.inputParams) {
      if (param.source === "$_FILES") continue;
      if (param.name === "id" || param.name === "update" || param.name === "delete") continue;
      const col = table?.columns.find((c) => c.name === param.name);
      formFields.push({
        name: param.name.replace(/\[\]$/, ""),
        type: col ? fieldTypeToInputType(col.type) : "text",
        label: col?.comment ?? fieldLabel(param.name),
      });
    }
  }

  // Fallback: if no fields from analysis, use table columns
  if (formFields.length === 0 && table) {
    for (const col of table.columns) {
      if (col.isPrimary && col.isAutoIncrement) continue;
      formFields.push({
        name: col.name,
        type: fieldTypeToInputType(col.type),
        label: col.comment ?? fieldLabel(col.name),
      });
    }
  }
```

This replaces the `else if (table)` with a separate `if` that runs whenever formFields is empty.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/analyzer/tests/admin-scaffold-generator.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/analyzer/src/admin-scaffold-generator.ts packages/analyzer/tests/admin-scaffold-generator.test.ts
git commit -m "fix(analyzer): admin form falls back to table columns when no params (#13)

Form fields now always populated: first from PHP input params,
then from table columns if no params found or all filtered out."
```

---

### Task 5: Re-run dogfooding verification

- [ ] **Step 1: Re-generate Client A**

Run:
```bash
rm -rf output/client-a-v2
pnpm --filter wp-transfer-cli dev analyze-php \
  /path/to/wp/site \
  --schema /path/to/api/docs/database.md \
  --output output/client-a-v2
```

- [ ] **Step 2: Verify Prisma schema has @id on all models**

Run: `grep -c "@id" output/client-a-v2/prisma/schema.prisma`
Expected: Every model has at least one @id or @@id

Run: `grep "model " output/client-a-v2/prisma/schema.prisma | wc -l`
Then verify same count of @id decorators.

- [ ] **Step 3: Verify API routes have Zod schemas defined**

Run: `grep -rn "Schema" output/client-a-v2/app/api/ | grep -c "const.*Schema"`
Verify no undefined schema references.

- [ ] **Step 4: Verify Docker uses npm**

Run: `grep "pnpm" output/client-a-v2/Dockerfile`
Expected: No matches

- [ ] **Step 5: Verify admin forms have fields**

Run: `grep -c "input" output/client-a-v2/app/\(admin\)/events/\[id\]/copy/page.tsx`
Expected: At least 1 input field

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run && pnpm -r typecheck`
Expected: All pass
