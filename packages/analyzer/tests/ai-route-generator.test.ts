import { describe, it, expect } from "vitest";
import {
  maskCredentials,
  stripMarkdown,
  validateRouteOutput,
  preservesExportedHttpMethods,
  hasNoTopLevelSideEffects,
  hasActiveAccessGuard,
  buildPrompt,
  generateRouteWithAi,
  generateRoutesWithAi,
} from "../src/ai-route-generator.js";
import type { AiRouteInput } from "../src/ai-route-generator.js";

// ── Helpers ──

function makeInput(overrides?: Partial<AiRouteInput>): AiRouteInput {
  return {
    phpSource: '<?php\n$stmt = $pdo->prepare("INSERT INTO products (title) VALUES (?)");\n',
    phpFilePath: "insert.php",
    targetRoutePath: "app/api/products/route.ts",
    accessPath: "/products",
    prismaSchema: "model Product {\n  id Int @id @default(autoincrement())\n  title String\n}",
    staticAnalysis: {
      dbOperations: [{ type: "INSERT", table: "products", columns: ["title"] }],
      inputParams: [{ name: "title", source: "$_POST" }],
    },
    ...overrides,
  };
}

// ── Credential masking ──

describe("maskCredentials", () => {
  it("masks database passwords in PHP source", () => {
    const php = `$password = "s3cret123";`;
    const masked = maskCredentials(php);
    expect(masked).toBe(`$password = "***MASKED***";`);
    expect(masked).not.toContain("s3cret123");
  });

  it("masks single-quoted passwords", () => {
    const php = `$password = 'myP@ss!';`;
    const masked = maskCredentials(php);
    expect(masked).toBe(`$password = "***MASKED***";`);
  });

  it("masks $db_password variants", () => {
    const php = `$db_password = "abc"; $dbpass = "xyz";`;
    const masked = maskCredentials(php);
    expect(masked).not.toContain("abc");
    expect(masked).not.toContain("xyz");
  });

  it("masks array-style password assignments", () => {
    const php = `"password" => "hunter2"`;
    const masked = maskCredentials(php);
    expect(masked).not.toContain("hunter2");
  });

  it("masks API key patterns", () => {
    const php = `$api_key = "sk-1234567890abcdef";`;
    const masked = maskCredentials(php);
    expect(masked).not.toContain("sk-1234567890abcdef");
    expect(masked).toContain("***MASKED***");
  });

  it("masks secret_key and access_token", () => {
    const php = `$secret_key = "sec123"; $access_token = "tok456";`;
    const masked = maskCredentials(php);
    expect(masked).not.toContain("sec123");
    expect(masked).not.toContain("tok456");
  });

  it("masks array-style API key assignments", () => {
    const php = `"api_key" => "key-abc", 'secret-key' => 'sk-xyz'`;
    const masked = maskCredentials(php);
    expect(masked).not.toContain("key-abc");
    expect(masked).not.toContain("sk-xyz");
  });

  it("preserves non-sensitive code", () => {
    const php = `$title = "Hello World";\n$count = 42;\necho $title;`;
    const masked = maskCredentials(php);
    expect(masked).toBe(php);
  });

  it("preserves SQL queries and logic", () => {
    const php = `$stmt = $pdo->prepare("INSERT INTO products (title) VALUES (?)");\n$stmt->execute([$_POST["title"]]);`;
    const masked = maskCredentials(php);
    expect(masked).toBe(php);
  });
});

// ── Markdown stripping ──

describe("stripMarkdown", () => {
  it("strips ```typescript code blocks from LLM output", () => {
    const output = '```typescript\nexport async function GET() {\n  return new Response("ok");\n}\n```';
    const stripped = stripMarkdown(output);
    expect(stripped).toBe('export async function GET() {\n  return new Response("ok");\n}');
    expect(stripped).not.toContain("```");
  });

  it("strips ```ts code blocks", () => {
    const output = "```ts\nconst x = 1;\nexport async function POST() {}\n```";
    const stripped = stripMarkdown(output);
    expect(stripped).not.toContain("```");
    expect(stripped).toContain("export async function POST()");
  });

  it("strips bare ``` code blocks", () => {
    const output = "```\nexport async function DELETE() {}\n```";
    const stripped = stripMarkdown(output);
    expect(stripped).toBe("export async function DELETE() {}");
  });

  it("handles output without markdown wrapper", () => {
    const output = 'export async function GET() {\n  return NextResponse.json({});\n}';
    const stripped = stripMarkdown(output);
    expect(stripped).toBe(output);
  });

  it("trims leading/trailing whitespace", () => {
    const output = "  \n```typescript\ncode here\n```\n  ";
    const stripped = stripMarkdown(output);
    expect(stripped).toBe("code here");
  });
});

// ── Output validation ──

describe("validateRouteOutput", () => {
  it("validates output containing export async function", () => {
    const output = `import { NextRequest } from "next/server";\n\nexport async function GET(request: NextRequest) {\n  return new Response("ok");\n}`;
    expect(validateRouteOutput(output)).toBe(true);
  });

  it("validates output with multiple exported functions", () => {
    const output = `export async function GET() {}\nexport async function POST() {}`;
    expect(validateRouteOutput(output)).toBe(true);
  });

  it("rejects output without valid function export", () => {
    expect(validateRouteOutput("const x = 1;")).toBe(false);
  });

  it("rejects empty output", () => {
    expect(validateRouteOutput("")).toBe(false);
  });

  it("rejects output with only a regular function", () => {
    expect(validateRouteOutput("function GET() {}")).toBe(false);
  });

  it("rejects output with non-async export", () => {
    expect(validateRouteOutput("export function GET() {}")).toBe(false);
  });

  it("rejects handler-shaped text that is not an exported function", () => {
    expect(validateRouteOutput('const example = "export async function POST() {}";')).toBe(false);
    expect(validateRouteOutput("type Example = `export async function DELETE() {}`;")).toBe(false);
  });
});

describe("hasActiveAccessGuard", () => {
  it("accepts a route that imports and awaits the database-backed guard", () => {
    const output = `import { requireActiveAccess } from "@/lib/require-active-user";
import { NextResponse } from "next/server";

export async function POST() {
  const activeUser = await requireActiveAccess("/products");
  if (!activeUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}`;

    expect(hasActiveAccessGuard(output, "/products")).toBe(true);
  });

  it("rejects a route that merely has an API handler", () => {
    expect(hasActiveAccessGuard("export async function POST() { return new Response(); }", "/products")).toBe(false);
  });

  it("rejects a comment-only guard reference", () => {
    const output = `// import { requireActiveAccess } from "@/lib/require-active-user";
export async function POST() {
  // await requireActiveAccess("/products");
  return new Response();
}`;

    expect(hasActiveAccessGuard(output, "/products")).toBe(false);
  });

  it("rejects multi-handler output when only one handler is guarded", () => {
    const output = `import { requireActiveAccess } from "@/lib/require-active-user";
import { NextResponse } from "next/server";
export async function GET() {
  const activeUser = await requireActiveAccess("/products");
  if (!activeUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({});
}
export async function POST() {
  return NextResponse.json({});
}`;

    expect(hasActiveAccessGuard(output, "/products")).toBe(false);
  });

  it("rejects a handler that ignores the guard result", () => {
    const output = `import { requireActiveAccess } from "@/lib/require-active-user";
export async function POST() {
  await requireActiveAccess("/products");
  return new Response();
}`;

    expect(hasActiveAccessGuard(output, "/products")).toBe(false);
  });

  it("rejects a handler that does not return when the guard rejects access", () => {
    const output = `import { requireActiveAccess } from "@/lib/require-active-user";
import { NextResponse } from "next/server";
export async function DELETE() {
  const activeUser = await requireActiveAccess("/products");
  if (!activeUser) NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ success: true });
}`;

    expect(hasActiveAccessGuard(output, "/products")).toBe(false);
  });

  it("rejects a handler that mutates data before checking access", () => {
    const output = `import { requireActiveAccess } from "@/lib/require-active-user";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
export async function POST() {
  await prisma.product.create({ data: {} });
  const activeUser = await requireActiveAccess("/products");
  if (!activeUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({});
}`;

    expect(hasActiveAccessGuard(output, "/products")).toBe(false);
  });

  it("rejects a handler whose guard exists only inside a nested helper", () => {
    const output = `import { requireActiveAccess } from "@/lib/require-active-user";
import { NextResponse } from "next/server";
export async function POST() {
  async function authorize() {
    const activeUser = await requireActiveAccess("/products");
    if (!activeUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({});
}`;

    expect(hasActiveAccessGuard(output, "/products")).toBe(false);
  });

  it("rejects a guard with a different literal resource scope", () => {
    const output = `import { requireActiveAccess } from "@/lib/require-active-user";
import { NextResponse } from "next/server";
export async function POST() {
  const activeUser = await requireActiveAccess("/");
  if (!activeUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({});
}`;

    expect(hasActiveAccessGuard(output, "/products")).toBe(false);
  });

  it("rejects a guard-shaped template literal embedded in a parameter type", () => {
    const output = `import { prisma } from "@/lib/db";
import { requireActiveAccess } from "@/lib/require-active-user";
import { NextResponse } from "next/server";
export async function POST(request: \`) { const active = await requireActiveAccess("/products"); if (!active) return NextResponse.json({ error: "Forbidden" }, { status: 403 })\`) {
  await prisma.product.deleteMany();
  return NextResponse.json({ ok: true });
}`;

    expect(hasNoTopLevelSideEffects(output)).toBe(true);
    expect(hasActiveAccessGuard(output, "/products")).toBe(false);
  });

  it("rejects a body-local declaration that shadows the trusted guard import", () => {
    const output = `import { requireActiveAccess } from "@/lib/require-active-user";
import { NextResponse } from "next/server";
export async function POST() {
  const activeUser = await requireActiveAccess("/products");
  if (!activeUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({});
  function requireActiveAccess() { return { role: "admin" }; }
}`;

    expect(hasActiveAccessGuard(output, "/products")).toBe(false);
  });
});

describe("preservesExportedHttpMethods", () => {
  it("rejects an AI route that drops GET from a co-located GET and POST static route", () => {
    const existing = `export async function GET() {}\nexport async function POST() {}`;
    expect(preservesExportedHttpMethods(existing, "export async function POST() {}")).toBe(false);
  });

  it("rejects an AI route that drops PUT or DELETE from a shared detail target", () => {
    const existing = `export async function PUT() {}\nexport async function DELETE() {}`;
    expect(preservesExportedHttpMethods(existing, "export async function PUT() {}")).toBe(false);
    expect(preservesExportedHttpMethods(existing, "export async function PUT() {}\nexport async function DELETE() {}")).toBe(true);
  });

  it("does not count method names embedded in strings or types", () => {
    const existing = `export async function GET() {}\nexport async function POST() {}`;
    const generated = 'export async function GET() {}\nconst fake = "export async function POST() {}";';
    expect(preservesExportedHttpMethods(existing, generated)).toBe(false);
  });
});

describe("hasNoTopLevelSideEffects", () => {
  const guardedHandler = `export async function POST() {
  const activeUser = await requireActiveAccess("/products");
  if (!activeUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({});
}`;

  it("rejects a top-level Prisma mutation before guarded handlers", () => {
    expect(hasNoTopLevelSideEffects(`prisma.product.deleteMany();\n${guardedHandler}`)).toBe(false);
  });

  it("rejects other executable or side-effecting top-level initializers", () => {
    expect(hasNoTopLevelSideEffects(`await fetch("https://example.test");\n${guardedHandler}`)).toBe(false);
    expect(hasNoTopLevelSideEffects(`const db = process.env.DATABASE_URL;\n${guardedHandler}`)).toBe(false);
  });

  it("rejects a helper invocation that hides a module-load mutation", () => {
    const output = `import { prisma } from "@/lib/db";
function cleanup() { return prisma.product.deleteMany(); }
const started = cleanup();
${guardedHandler}`;

    expect(hasNoTopLevelSideEffects(output)).toBe(false);
  });

  it("rejects untrusted and side-effect-only imports", () => {
    expect(hasNoTopLevelSideEffects(`import "./startup";\n${guardedHandler}`)).toBe(false);
    expect(hasNoTopLevelSideEffects(`import { cleanup } from "./startup";\n${guardedHandler}`)).toBe(false);
  });

  it("rejects JavaScript escape hatches disguised as Zod chains", () => {
    const constructorEscape = `import { z } from "zod";
const started = z.constructor.constructor("return process")();
${guardedHandler}`;
    const eagerParse = `import { z } from "zod";
const started = z.string().transform(() => { throw new Error("ran"); }).parse("x");
${guardedHandler}`;

    expect(hasNoTopLevelSideEffects(constructorEscape)).toBe(false);
    expect(hasNoTopLevelSideEffects(eagerParse)).toBe(false);
  });

  it("rejects handler parameter defaults that execute before the access guard", () => {
    const output = `import { prisma } from "@/lib/db";
import { requireActiveAccess } from "@/lib/require-active-user";
import { NextResponse } from "next/server";
export async function POST(request: Request, destructive = prisma.product.deleteMany()) {
  const activeUser = await requireActiveAccess("/products");
  if (!activeUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({});
}`;

    expect(hasNoTopLevelSideEffects(output)).toBe(false);
  });

  it("allows imports, types, pure Zod schemas, helpers, and guarded handlers", () => {
    const output = `import { z } from "zod";
import { requireActiveAccess } from "@/lib/require-active-user";
import { NextResponse } from "next/server";
interface Input { title: string }
type Result = { id: number };
const inputSchema = z.object({ title: z.string() });
function normalize(input: Input): Result { return { id: input.title.length }; }
${guardedHandler}`;
    expect(hasNoTopLevelSideEffects(output)).toBe(true);
  });

  it("allows a conservative range of side-effect-free constant expressions", () => {
    const output = `import * as z from "zod";
const count = 2;
const label = \`item-\${count}\`;
const values = [count, -1, label] as const;
const options = { count, "label": label };
const selected = true ? z.string() : z.number();
const schema = z.object({ value: selected, options: z.array(z.string()) }).strict();
const normalize = (value: string) => value.trim();
function pair([first, , second]: [string, string, string]) { return [first, second]; }
${guardedHandler}`;

    expect(hasNoTopLevelSideEffects(output)).toBe(true);
  });
});

describe("generateRouteWithAi", () => {
  it("keeps the canonical static route path when using a fallback", async () => {
    const result = await generateRouteWithAi(makeInput({
      phpSource: "x".repeat(10_001),
      targetRoutePath: "app/api/catalog-items/route.ts",
      accessPath: "/catalog-items",
      existingRoute: "// guarded static route",
    }), {});

    expect(result.routePath).toBe("app/api/catalog-items/route.ts");
    expect(result.content).toBe("// guarded static route");
    expect(result.fallback).toBe(true);
  });

  it("reports an existing-route fallback as a generation failure", async () => {
    const input = makeInput({
      phpSource: "x".repeat(10_001),
      existingRoute: "export async function POST() { /* static fallback */ }",
    });
    const result = await generateRoutesWithAi([input], {});

    expect(result.results[0]?.fallback).toBe(true);
    expect(result.failures).toEqual(["insert.php"]);
  });
});

// ── Prompt building ──

describe("buildPrompt", () => {
  it("builds prompt with all required sections", () => {
    const input = makeInput();
    const prompt = buildPrompt(input);

    expect(prompt).toContain("PHP to Next.js migration expert");
    expect(prompt).toContain("## Rules");
    expect(prompt).toContain("## Static Analysis Results");
    expect(prompt).toContain("## PHP Source (insert.php)");
    expect(prompt).toContain("## Relevant Prisma Models");
    expect(prompt).toContain('requireActiveAccess("/products")');
    expect(prompt).toContain("app/api/products/route.ts");
    expect(prompt).toContain("Output ONLY TypeScript code");
  });

  it("includes static analysis data in prompt", () => {
    const input = makeInput({
      staticAnalysis: {
        dbOperations: [
          { type: "INSERT", table: "orders", columns: ["user_id", "total"] },
          { type: "SELECT", table: "users", columns: ["id", "name"] },
        ],
        inputParams: [
          { name: "user_id", source: "$_POST" },
          { name: "total", source: "$_POST" },
        ],
      },
    });
    const prompt = buildPrompt(input);

    expect(prompt).toContain('"table":"orders"');
    expect(prompt).toContain('"table":"users"');
    expect(prompt).toContain('"name":"user_id"');
    expect(prompt).toContain('"name":"total"');
  });

  it("includes prisma schema in prompt", () => {
    const schema = "model Order {\n  id Int @id\n  total Float\n}";
    const input = makeInput({ prismaSchema: schema });
    const prompt = buildPrompt(input);

    expect(prompt).toContain("model Order");
    expect(prompt).toContain("total Float");
  });

  it("masks credentials in PHP source within prompt", () => {
    const input = makeInput({
      phpSource: '$password = "s3cret"; $api_key = "sk-abc123";\n$stmt = $pdo->query("SELECT 1");',
    });
    const prompt = buildPrompt(input);

    expect(prompt).not.toContain("s3cret");
    expect(prompt).not.toContain("sk-abc123");
    expect(prompt).toContain("***MASKED***");
    expect(prompt).toContain("SELECT 1");
  });

  it("includes all 8 rules", () => {
    const prompt = buildPrompt(makeInput());
    expect(prompt).toContain("1. Define Zod validation schemas");
    expect(prompt).toContain("2. HTTP methods:");
    expect(prompt).toContain("3. DELETE operations");
    expect(prompt).toContain("4. Convert PHP foreach");
    expect(prompt).toContain("5. Use prisma.$transaction()");
    expect(prompt).toContain("6. Error handling:");
    expect(prompt).toContain("7. File uploads");
    expect(prompt).toContain("8. Import from");
  });
});
