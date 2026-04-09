# Design: JRA Tokyo Dogfooding Quality Improvements

**Date:** 2026-04-09
**Scope:** wp-transfer analyze-php generator improvements (B-range: structural + HIGH issues)
**Origin:** JRA Tokyo PHP→Next.js migration dogfooding report

---

## Background

JRA Tokyo event management system (39 PHP files, 21 DB tables) was migrated using `analyze-php`.
Prisma schema generation scored A (production-ready), but API route generation scored C with
6 CRITICAL bugs (now fixed in Issue #13/#18/#19) and multiple HIGH/structural issues remaining.

This design addresses the remaining gaps to bring API route generation from "scaffold quality"
to "minimal manual intervention" quality.

## Expert Panel (12 members, generator-focused)

| # | Name | Expertise | Primary Issues |
|---|------|-----------|---------------|
| 1 | Dr. Elena Vasquez | Compiler / code generation theory | #20 CRUD completeness |
| 2 | Marcus Chen | PHP→TypeScript AST transformation | #23 Loop detection |
| 3 | Prof. Yuki Tanaka | Prisma / ORM design patterns | #20, #22 |
| 4 | Sarah Mitchell | Next.js App Router / API design | #20, #21 |
| 5 | Dr. Raj Patel | REST API design / OpenAPI | #20, #22 HTTP methods |
| 6 | Lena Kowalski | Zod validation / type systems | #21 Zod schemas |
| 7 | James O'Brien | Security engineering | #24 Security |
| 8 | Dr. Aisha Rahman | Static analysis / pattern matching | #23 Loop detection |
| 9 | Tom Nakamura | Docker / DevOps / DX | #25 Docker/DX |
| 10 | Prof. Maria Santos | Test strategy / QA automation | All (test strategy) |
| 11 | Alex Kim | CLI / DX design | #25, integration |
| 12 | Dr. Felix Weber | Database schema migration | #20, #22 DB patterns |

## 6 Issues

### Issue #20: API Route CRUD Completeness
- GET endpoint auto-generation (findMany list + findUnique detail)
- CRUD coverage gaps: Lottery (no CREATE/READ/DELETE), User (no CREATE/READ)
- Multi-slot event creation (foreach → createMany in parent-child transaction)

### Issue #21: Zod Schema Auto-Generation Improvements
- UPDATE schemas via `.partial()` from POST schema
- Remove irrelevant fields (e.g., winners_limit in event-restoration)
- Add initialization fields (slot_time_disp, ticket_counter)

### Issue #22: Accurate DELETE Code Generation
- Soft-delete detection (UPDATE with status/flag column) vs hard-delete (DELETE FROM)
- PHP pattern analysis: if PHP uses UPDATE to "delete", generate `.update()` with status field
- If PHP uses DELETE FROM, generate `.delete()`

### Issue #23: Loop/Batch Processing Detection
- Detect PHP foreach patterns with DB operations inside
- Generate `createMany` / `Promise.all` / transaction loops
- Integration with php-analyzer.ts for pattern extraction

### Issue #24: Generated Code Security Hardening
- .env should NOT contain real secrets — only .env.example with placeholders
- AUTH_SECRET generation should use `openssl rand -base64 32` instruction, not Math.random()
- .gitignore must include .env
- Security best practices comments in generated auth code

### Issue #25: Docker/DX Improvements
- seed.ts inclusion in runner stage for `prisma db seed`
- Package manager consistency (npm throughout)
- .dockerignore generation
- healthcheck improvement
- dev script with `prisma migrate dev && next dev`

## Dependencies

```
#23 (loop detection) — independent
#24 (security) — independent
#25 (docker/dx) — independent
#20 (CRUD) → #21 (Zod) depends on GET route structure
#22 (DELETE) — parallel with #21, shares schema generation logic
```

Recommended order: #23, #24, #25 (parallel) → #20 → #21, #22 (parallel)
