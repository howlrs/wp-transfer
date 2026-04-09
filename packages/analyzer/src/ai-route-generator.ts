/**
 * AI-assisted Next.js API route generator using Claude API.
 *
 * Sends PHP source + static analysis context to Claude to produce
 * higher-quality App Router API routes with proper Zod schemas,
 * Prisma operations, and error handling.
 */

// ── Types ──

export interface AiRouteGeneratorOptions {
  apiKey: string;
  model?: string;
  concurrency?: number;
}

export interface AiRouteInput {
  phpSource: string;
  phpFilePath: string;
  prismaSchema: string;
  staticAnalysis: {
    dbOperations: { type: string; table: string; columns: string[] }[];
    inputParams: { name: string; source: string }[];
  };
  existingRoute?: string;
}

export interface AiRouteOutput {
  routePath: string;
  content: string;
  method: string;
  tokensUsed?: number;
}

// ── Constants ──

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const MAX_PHP_LENGTH = 10_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// ── Credential masking ──

const PASSWORD_PATTERNS = [
  /(\$password\s*=\s*)(["'])(?:(?!\2).)*\2/gi,
  /(\$db_?pass(?:word)?\s*=\s*)(["'])(?:(?!\2).)*\2/gi,
  /(["']password["']\s*(?:=>|:)\s*)(["'])(?:(?!\2).)*\2/gi,
];

const API_KEY_PATTERNS = [
  /(\$api_?key\s*=\s*)(["'])(?:(?!\2).)*\2/gi,
  /(\$secret_?key\s*=\s*)(["'])(?:(?!\2).)*\2/gi,
  /(\$access_?token\s*=\s*)(["'])(?:(?!\2).)*\2/gi,
  /(["'](?:api[_-]?key|secret[_-]?key|access[_-]?token)["']\s*(?:=>|:)\s*)(["'])(?:(?!\2).)*\2/gi,
];

export function maskCredentials(source: string): string {
  let masked = source;
  for (const re of PASSWORD_PATTERNS) {
    masked = masked.replace(re, '$1"***MASKED***"');
  }
  for (const re of API_KEY_PATTERNS) {
    masked = masked.replace(re, '$1"***MASKED***"');
  }
  return masked;
}

// ── Markdown stripping ──

export function stripMarkdown(output: string): string {
  let result = output.trim();
  // Strip opening ```typescript or ```ts or ```
  result = result.replace(/^```(?:typescript|ts)?\s*\n?/, "");
  // Strip closing ```
  result = result.replace(/\n?```\s*$/, "");
  return result.trim();
}

// ── Output validation ──

export function validateRouteOutput(output: string): boolean {
  return /export\s+async\s+function\s+/.test(output);
}

// ── Prompt building ──

export function buildPrompt(input: AiRouteInput): string {
  return `You are a PHP to Next.js migration expert. Convert this PHP file to a Next.js App Router API route.

## Rules
1. Define Zod validation schemas for ALL input parameters
2. HTTP methods: GET=read, POST=create, PUT=full update, PATCH=partial update, DELETE=delete
3. DELETE operations use prisma.model.delete() (only use .update() for explicit soft-deletes)
4. Convert PHP foreach DB loops to Prisma createMany or for...of + await
5. Use prisma.$transaction() for multi-table operations
6. Error handling: ZodError->400, NotFound->404, other->500
7. File uploads use FormData API
8. Import from "@/lib/db" for prisma, "next/server" for NextRequest/NextResponse, "zod" for z

## Static Analysis Results
DB Operations: ${JSON.stringify(input.staticAnalysis.dbOperations)}
Input Parameters: ${JSON.stringify(input.staticAnalysis.inputParams)}

## PHP Source (${input.phpFilePath})
${maskCredentials(input.phpSource)}

## Relevant Prisma Models
${input.prismaSchema}

Output ONLY TypeScript code. No markdown, no explanations.`;
}

// ── HTTP method inference ──

function inferMethod(
  dbOps: { type: string }[],
  filePath: string,
): string {
  const primary = dbOps[0]?.type?.toUpperCase();
  if (primary === "INSERT") return "POST";
  if (primary === "UPDATE") return "PUT";
  if (primary === "DELETE") return "DELETE";
  if (primary === "SELECT") return "GET";

  const lower = filePath.toLowerCase();
  if (lower.includes("delete")) return "DELETE";
  if (lower.includes("update")) return "PUT";
  if (lower.includes("insert") || lower.includes("create")) return "POST";
  return "POST";
}

// ── Route path inference ──

function inferRoutePath(filePath: string): string {
  const base = filePath
    .replace(/^.*[\\/]/, "")
    .replace(/\.php$/, "");

  const slug = base
    .replace(/_/g, "-")
    .toLowerCase();

  return `app/api/${slug}/route.ts`;
}

// ── Semaphore for concurrency control ──

class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;

  constructor(private limit: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) {
      this.active++;
      next();
    }
  }
}

// ── API call with retry ──

async function callClaudeApi(
  prompt: string,
  options: AiRouteGeneratorOptions,
): Promise<{ content: string; tokensUsed: number }> {
  const model = options.model ?? DEFAULT_MODEL;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": options.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>;
        usage?: { input_tokens: number; output_tokens: number };
      };
      const text = data.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      const tokensUsed =
        (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
      return { content: text, tokensUsed };
    }

    const status = response.status;
    if (status === 429 || status >= 500) {
      if (attempt < MAX_RETRIES - 1) {
        const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
    }

    throw new Error(
      `Claude API error: ${status} ${response.statusText}`,
    );
  }

  throw new Error("Claude API: max retries exceeded");
}

// ── Public API ──

export async function generateRouteWithAi(
  input: AiRouteInput,
  options: AiRouteGeneratorOptions,
): Promise<AiRouteOutput> {
  const method = inferMethod(
    input.staticAnalysis.dbOperations,
    input.phpFilePath,
  );
  const routePath = inferRoutePath(input.phpFilePath);

  // Large file guard
  if (input.phpSource.length > MAX_PHP_LENGTH) {
    console.warn(
      `[ai-route-generator] ${input.phpFilePath} exceeds ${MAX_PHP_LENGTH} chars, using static fallback`,
    );
    return {
      routePath,
      content: input.existingRoute ?? "// Static fallback: file too large for AI generation",
      method,
    };
  }

  const prompt = buildPrompt(input);

  try {
    const { content: raw, tokensUsed } = await callClaudeApi(prompt, options);
    const content = stripMarkdown(raw);

    if (!validateRouteOutput(content)) {
      console.warn(
        `[ai-route-generator] Invalid LLM output for ${input.phpFilePath}, using fallback`,
      );
      return {
        routePath,
        content: input.existingRoute ?? "// Fallback: AI output did not contain valid export",
        method,
      };
    }

    return { routePath, content, method, tokensUsed };
  } catch (error) {
    console.warn(
      `[ai-route-generator] API call failed for ${input.phpFilePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      routePath,
      content: input.existingRoute ?? "// Fallback: AI generation failed",
      method,
    };
  }
}

export async function generateRoutesWithAi(
  inputs: AiRouteInput[],
  options: AiRouteGeneratorOptions,
): Promise<{ results: AiRouteOutput[]; totalTokens: number; failures: string[] }> {
  const concurrency = options.concurrency ?? 5;
  const semaphore = new Semaphore(concurrency);
  const failures: string[] = [];
  let totalTokens = 0;

  const tasks = inputs.map(async (input) => {
    await semaphore.acquire();
    try {
      const result = await generateRouteWithAi(input, options);
      if (result.tokensUsed) {
        totalTokens += result.tokensUsed;
      } else {
        failures.push(input.phpFilePath);
      }
      return result;
    } finally {
      semaphore.release();
    }
  });

  const results = await Promise.all(tasks);
  return { results, totalTokens, failures };
}
