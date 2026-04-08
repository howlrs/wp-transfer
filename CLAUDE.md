# CLAUDE.md

## Project

wp-transfer: WordPress to Next.js migration accelerator CLI tool.
pnpm monorepo with packages: core, wxr-parser, analyzer, cli.

## Behavioral Guidelines (Karpathy-Inspired)

### 1. Think Before Coding
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop and ask.

### 2. Simplicity First
- No features beyond what was asked.
- No abstractions for single-use code.
- No speculative "flexibility" or "configurability".
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

### 3. Surgical Changes
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style.
- Remove only imports/variables/functions YOUR changes made unused.
- Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
- Transform tasks into verifiable goals with success criteria.
- For multi-step tasks, state plan with verification checks.
- Loop until verified. Write tests first.

## Tech Stack
- TypeScript 6.0.2 strict, Node.js 20+ LTS, pnpm 10.33.0
- CLI: citty 0.2.2 + consola 3.4.2
- WXR: sax 1.6.0 (streaming, XXE-safe)
- REST: ofetch 1.5.1
- Schemas: zod 4.3.6
- Tests: vitest 4.1.3
- Portable Text: @portabletext/types 4.0.2

## Commands
- `npx vitest run` — run all tests
- `pnpm -r typecheck` — typecheck all packages
- `pnpm --filter wp-transfer-cli dev analyze <file.xml>` — run CLI
