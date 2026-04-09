import { describe, it, expect } from "vitest";
import {
  maskCredentials,
  stripMarkdown,
  validateRouteOutput,
  buildPrompt,
} from "../src/ai-route-generator.js";
import type { AiRouteInput } from "../src/ai-route-generator.js";

// ── Helpers ──

function makeInput(overrides?: Partial<AiRouteInput>): AiRouteInput {
  return {
    phpSource: '<?php\n$stmt = $pdo->prepare("INSERT INTO events (title) VALUES (?)");\n',
    phpFilePath: "insert.php",
    prismaSchema: "model Event {\n  id Int @id @default(autoincrement())\n  title String\n}",
    staticAnalysis: {
      dbOperations: [{ type: "INSERT", table: "events", columns: ["title"] }],
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
    const php = `$stmt = $pdo->prepare("INSERT INTO events (title) VALUES (?)");\n$stmt->execute([$_POST["title"]]);`;
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
