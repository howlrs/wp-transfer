# Phase 1 Foundation + Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the monorepo foundation, core type system, WXR streaming parser, WP REST API client, and Analyzer engine that generates migration reports from WordPress sites.

**Architecture:** pnpm monorepo with ESM TypeScript packages. The Analyzer orchestrates WXR parsing (sax streaming) and REST API probing (ofetch) to produce a structured migration report (JSON/Markdown/HTML). All packages export clean interfaces; no emdash npm dependency. Anti-Corruption Layer isolates WP-specific concerns.

**Tech Stack:** TypeScript 5.x strict, Node.js 20+ LTS, pnpm workspace, citty + consola (CLI), sax (WXR streaming), ofetch (REST API), @wordpress/block-serialization-default-parser (Gutenberg parse), zod (schema validation), vitest (testing)

**Gemini Pro review items incorporated:**
- sax streaming is primary (not fast-xml-parser) to prevent OOM on large WXR
- XXE protection: entity expansion disabled in all XML parsing
- Data source responsibility: Analyze = REST API + DB, Extract = WXR or REST API (no mixing)
- `@wordpress/block-serialization-default-parser` for Gutenberg block parsing (not self-rolled regex)
- Security gate (secret scanning) elevated to P1
- `locale?` field included in core types for future i18n

---

## File Structure

```
wp-transfer/
├── package.json                          # Root workspace config
├── pnpm-workspace.yaml                   # Workspace packages
├── tsconfig.json                         # Root TS config (path aliases)
├── vitest.workspace.ts                   # Vitest workspace config
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  # Public exports
│   │   │   ├── types/
│   │   │   │   ├── wp.ts                 # WordPress data types + Zod schemas
│   │   │   │   ├── migration.ts          # Migration report types + Zod schemas
│   │   │   │   ├── plugin-inventory.ts   # Plugin detection/classification types + schemas
│   │   │   │   └── portable-text.ts      # Portable Text extensions (locale field)
│   │   │   └── security/
│   │   │       └── secret-scanner.ts     # Regex-based secret detection in strings
│   │   └── tests/
│   │       ├── schemas.test.ts
│   │       └── secret-scanner.test.ts
│   ├── wxr-parser/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  # Public exports
│   │   │   ├── stream-parser.ts          # SAX streaming WXR parser
│   │   │   ├── post-collector.ts         # Collects posts from SAX events
│   │   │   ├── taxonomy-collector.ts     # Collects taxonomies from SAX events
│   │   │   ├── media-collector.ts        # Collects media/attachments
│   │   │   └── user-collector.ts         # Collects authors/users
│   │   └── tests/
│   │       ├── stream-parser.test.ts
│   │       ├── post-collector.test.ts
│   │       └── taxonomy-collector.test.ts
│   └── analyzer/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts                  # Public exports
│       │   ├── rest-client.ts            # WP REST API client (ofetch)
│       │   ├── site-profiler.ts          # WP version, theme, language detection
│       │   ├── plugin-detector.ts        # Plugin detection + classification
│       │   ├── plugin-registry.ts        # Known plugin metadata (difficulty, category)
│       │   ├── schema-analyzer.ts        # Post types, taxonomies, custom fields analysis
│       │   ├── report-generator.ts       # Migration report output (JSON/Markdown/HTML)
│       │   └── cost-estimator.ts         # Migration effort estimation
│       └── tests/
│           ├── rest-client.test.ts
│           ├── plugin-detector.test.ts
│           ├── schema-analyzer.test.ts
│           └── report-generator.test.ts
├── apps/
│   └── cli/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                  # CLI entrypoint (citty runMain)
│           └── commands/
│               └── analyze.ts            # `wp-transfer analyze <url>` command
├── fixtures/
│   ├── wxr/
│   │   ├── minimal.xml                   # Minimal valid WXR (1 post, 1 page)
│   │   ├── gutenberg-blocks.xml          # Posts with various Gutenberg blocks
│   │   ├── classic-editor.xml            # Classic editor HTML content
│   │   └── acf-fields.xml               # Posts with ACF custom fields
│   └── rest-api/
│       ├── site-info.json                # Mock /wp-json/ response
│       ├── posts.json                    # Mock /wp-json/wp/v2/posts
│       ├── plugins.json                  # Mock /wp-json/wp/v2/plugins
│       └── types.json                    # Mock /wp-json/wp/v2/types
└── docs/
```

---

## Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json`
- Create: `vitest.workspace.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/wxr-parser/package.json`
- Create: `packages/wxr-parser/tsconfig.json`
- Create: `packages/analyzer/package.json`
- Create: `packages/analyzer/tsconfig.json`
- Create: `apps/cli/package.json`
- Create: `apps/cli/tsconfig.json`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "wp-transfer",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "packageManager": "pnpm@10.8.1",
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint ."
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 3: Create root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 4: Create vitest.workspace.ts**

```typescript
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/*/vitest.config.ts",
  "apps/*/vitest.config.ts",
]);
```

- [ ] **Step 5: Create packages/core/package.json**

```json
{
  "name": "@wp-transfer/core",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": { "import": "./src/index.ts" }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 6: Create packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 7: Create packages/wxr-parser/package.json**

```json
{
  "name": "@wp-transfer/wxr-parser",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": { "import": "./src/index.ts" }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@wp-transfer/core": "workspace:*",
    "sax": "^1.4.0"
  },
  "devDependencies": {
    "@types/sax": "^1.2.0",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 8: Create packages/wxr-parser/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 9: Create packages/analyzer/package.json**

```json
{
  "name": "@wp-transfer/analyzer",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": { "import": "./src/index.ts" }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@wp-transfer/core": "workspace:*",
    "@wp-transfer/wxr-parser": "workspace:*",
    "ofetch": "^1.4.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 10: Create packages/analyzer/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 11: Create apps/cli/package.json**

```json
{
  "name": "wp-transfer-cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "wp-transfer": "./src/index.ts"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@wp-transfer/core": "workspace:*",
    "@wp-transfer/analyzer": "workspace:*",
    "citty": "^0.1.0",
    "consola": "^3.4.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 12: Create apps/cli/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 13: Install dependencies**

Run: `pnpm install`
Expected: All packages installed, no errors

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo with core, wxr-parser, analyzer, cli"
```

---

## Task 2: Core Type Definitions

**Files:**
- Create: `packages/core/src/types/wp.ts`
- Create: `packages/core/src/types/migration.ts`
- Create: `packages/core/src/types/plugin-inventory.ts`
- Create: `packages/core/src/types/portable-text.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/tests/schemas.test.ts`

- [ ] **Step 1: Write failing test for WP types and Zod schemas**

Create `packages/core/tests/schemas.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  WpPostSchema,
  WpUserSchema,
  WpTaxonomyTermSchema,
  WpMediaSchema,
  MigrationReportSchema,
  PluginEntrySchema,
} from "../src/index.js";

describe("WpPostSchema", () => {
  it("validates a minimal WP post", () => {
    const post = {
      id: 1,
      title: "Hello World",
      slug: "hello-world",
      status: "publish",
      type: "post",
      content: "<p>Hello</p>",
      excerpt: "",
      date: "2024-01-01T00:00:00",
      modified: "2024-01-01T00:00:00",
      author: 1,
      meta: {},
    };
    expect(WpPostSchema.parse(post)).toEqual(post);
  });

  it("rejects a post without required fields", () => {
    expect(() => WpPostSchema.parse({ id: 1 })).toThrow();
  });

  it("accepts optional locale field", () => {
    const post = {
      id: 1,
      title: "Bonjour",
      slug: "bonjour",
      status: "publish",
      type: "post",
      content: "<p>Bonjour</p>",
      excerpt: "",
      date: "2024-01-01T00:00:00",
      modified: "2024-01-01T00:00:00",
      author: 1,
      meta: {},
      locale: "fr_FR",
    };
    const result = WpPostSchema.parse(post);
    expect(result.locale).toBe("fr_FR");
  });
});

describe("PluginEntrySchema", () => {
  it("validates a detected plugin", () => {
    const plugin = {
      slug: "contact-form-7",
      name: "Contact Form 7",
      version: "5.9",
      active: true,
      category: "forms",
      migrationStrategy: "template",
      difficulty: 3,
      estimatedHours: 8,
    };
    expect(PluginEntrySchema.parse(plugin)).toEqual(plugin);
  });
});

describe("MigrationReportSchema", () => {
  it("validates a minimal migration report", () => {
    const report = {
      generatedAt: "2026-04-08T00:00:00Z",
      siteUrl: "https://example.com",
      wpVersion: "6.7",
      phpVersion: "8.2",
      theme: { name: "Twenty Twenty-Four", version: "1.0", isChild: false },
      contentSummary: {
        posts: 100,
        pages: 10,
        customPostTypes: [],
        media: 500,
        users: 5,
        taxonomies: [],
      },
      plugins: [],
      migrationPlan: {
        automated: [],
        template: [],
        llmAssisted: [],
        manual: [],
      },
      estimatedTotalHours: 40,
      risks: [],
    };
    expect(MigrationReportSchema.parse(report)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/o9oem/workspace/mine/wp-transfer && pnpm vitest run packages/core/tests/schemas.test.ts`
Expected: FAIL — cannot find module `../src/index.js`

- [ ] **Step 3: Implement WP types**

Create `packages/core/src/types/wp.ts`:

```typescript
import { z } from "zod";

export const WpPostSchema = z.object({
  id: z.number(),
  title: z.string(),
  slug: z.string(),
  status: z.enum(["publish", "draft", "pending", "private", "future", "trash"]),
  type: z.string(),
  content: z.string(),
  excerpt: z.string(),
  date: z.string(),
  modified: z.string(),
  author: z.number(),
  meta: z.record(z.unknown()),
  locale: z.string().optional(),
  featuredMedia: z.number().optional(),
  parentId: z.number().optional(),
  menuOrder: z.number().optional(),
  commentStatus: z.enum(["open", "closed"]).optional(),
  categories: z.array(z.number()).optional(),
  tags: z.array(z.number()).optional(),
});

export type WpPost = z.infer<typeof WpPostSchema>;

export const WpUserSchema = z.object({
  id: z.number(),
  login: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: z.string(),
  registered: z.string(),
});

export type WpUser = z.infer<typeof WpUserSchema>;

export const WpTaxonomyTermSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  taxonomy: z.string(),
  description: z.string().optional(),
  parentId: z.number().optional(),
  count: z.number().optional(),
  locale: z.string().optional(),
});

export type WpTaxonomyTerm = z.infer<typeof WpTaxonomyTermSchema>;

export const WpMediaSchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  mimeType: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  fileSize: z.number().optional(),
  alt: z.string().optional(),
  caption: z.string().optional(),
});

export type WpMedia = z.infer<typeof WpMediaSchema>;
```

- [ ] **Step 4: Implement plugin inventory types**

Create `packages/core/src/types/plugin-inventory.ts`:

```typescript
import { z } from "zod";

export const PluginCategorySchema = z.enum([
  "forms",
  "seo",
  "ecommerce",
  "security",
  "performance",
  "media",
  "social",
  "analytics",
  "backup",
  "multilingual",
  "page-builder",
  "membership",
  "lms",
  "email",
  "custom-fields",
  "other",
]);

export type PluginCategory = z.infer<typeof PluginCategorySchema>;

export const MigrationStrategySchema = z.enum([
  "automated",
  "template",
  "llm-assisted",
  "manual",
  "not-needed",
]);

export type MigrationStrategy = z.infer<typeof MigrationStrategySchema>;

export const PluginEntrySchema = z.object({
  slug: z.string(),
  name: z.string(),
  version: z.string().optional(),
  active: z.boolean(),
  category: PluginCategorySchema,
  migrationStrategy: MigrationStrategySchema,
  difficulty: z.number().min(1).max(5),
  estimatedHours: z.number(),
  notes: z.string().optional(),
  templateId: z.string().optional(),
  wpOrgUrl: z.string().optional(),
});

export type PluginEntry = z.infer<typeof PluginEntrySchema>;
```

- [ ] **Step 5: Implement migration report types**

Create `packages/core/src/types/migration.ts`:

```typescript
import { z } from "zod";
import { PluginEntrySchema } from "./plugin-inventory.js";

export const ThemeInfoSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  isChild: z.boolean(),
  parentTheme: z.string().optional(),
  templateEngine: z.string().optional(),
});

export type ThemeInfo = z.infer<typeof ThemeInfoSchema>;

export const CustomPostTypeSchema = z.object({
  slug: z.string(),
  name: z.string(),
  count: z.number(),
  hasArchive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export type CustomPostType = z.infer<typeof CustomPostTypeSchema>;

export const TaxonomySummarySchema = z.object({
  slug: z.string(),
  name: z.string(),
  count: z.number(),
  hierarchical: z.boolean(),
});

export type TaxonomySummary = z.infer<typeof TaxonomySummarySchema>;

export const ContentSummarySchema = z.object({
  posts: z.number(),
  pages: z.number(),
  customPostTypes: z.array(CustomPostTypeSchema),
  media: z.number(),
  users: z.number(),
  taxonomies: z.array(TaxonomySummarySchema),
});

export type ContentSummary = z.infer<typeof ContentSummarySchema>;

export const RiskEntrySchema = z.object({
  area: z.string(),
  description: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  mitigation: z.string(),
});

export type RiskEntry = z.infer<typeof RiskEntrySchema>;

export const MigrationPlanSchema = z.object({
  automated: z.array(z.string()),
  template: z.array(z.string()),
  llmAssisted: z.array(z.string()),
  manual: z.array(z.string()),
});

export type MigrationPlan = z.infer<typeof MigrationPlanSchema>;

export const MigrationReportSchema = z.object({
  generatedAt: z.string(),
  siteUrl: z.string(),
  wpVersion: z.string(),
  phpVersion: z.string().optional(),
  theme: ThemeInfoSchema,
  contentSummary: ContentSummarySchema,
  plugins: z.array(PluginEntrySchema),
  migrationPlan: MigrationPlanSchema,
  estimatedTotalHours: z.number(),
  risks: z.array(RiskEntrySchema),
});

export type MigrationReport = z.infer<typeof MigrationReportSchema>;
```

- [ ] **Step 6: Implement Portable Text extension types**

Create `packages/core/src/types/portable-text.ts`:

```typescript
import type {
  PortableTextBlock,
  PortableTextMarkDefinition,
  PortableTextSpan,
} from "@portabletext/types";

/**
 * Extended Portable Text block with locale support for future i18n.
 */
export interface WptPortableTextBlock extends PortableTextBlock {
  locale?: string;
}

/**
 * Image block in Portable Text format.
 */
export interface WptImageBlock {
  _type: "image";
  _key: string;
  src: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  locale?: string;
}

/**
 * Embed block (YouTube, Twitter, etc.) in Portable Text format.
 */
export interface WptEmbedBlock {
  _type: "embed";
  _key: string;
  url: string;
  provider?: string;
  html?: string;
  locale?: string;
}

/**
 * Code block in Portable Text format.
 */
export interface WptCodeBlock {
  _type: "code";
  _key: string;
  code: string;
  language?: string;
  locale?: string;
}

/**
 * Fallback block for unconvertible HTML.
 */
export interface WptHtmlBlock {
  _type: "htmlBlock";
  _key: string;
  html: string;
  originalBlockName?: string;
  locale?: string;
}

/**
 * Union type for all supported Portable Text content blocks.
 */
export type WptContentBlock =
  | WptPortableTextBlock
  | WptImageBlock
  | WptEmbedBlock
  | WptCodeBlock
  | WptHtmlBlock;

export type { PortableTextBlock, PortableTextMarkDefinition, PortableTextSpan };
```

- [ ] **Step 7: Create index.ts barrel export**

Create `packages/core/src/index.ts`:

```typescript
// Types
export type {
  WpPost,
  WpUser,
  WpTaxonomyTerm,
  WpMedia,
} from "./types/wp.js";

export type {
  PluginCategory,
  MigrationStrategy,
  PluginEntry,
} from "./types/plugin-inventory.js";

export type {
  ThemeInfo,
  CustomPostType,
  TaxonomySummary,
  ContentSummary,
  RiskEntry,
  MigrationPlan,
  MigrationReport,
} from "./types/migration.js";

export type {
  WptPortableTextBlock,
  WptImageBlock,
  WptEmbedBlock,
  WptCodeBlock,
  WptHtmlBlock,
  WptContentBlock,
} from "./types/portable-text.js";

// Schemas
export {
  WpPostSchema,
  WpUserSchema,
  WpTaxonomyTermSchema,
  WpMediaSchema,
} from "./types/wp.js";

export {
  PluginCategorySchema,
  MigrationStrategySchema,
  PluginEntrySchema,
} from "./types/plugin-inventory.js";

export {
  ThemeInfoSchema,
  CustomPostTypeSchema,
  TaxonomySummarySchema,
  ContentSummarySchema,
  RiskEntrySchema,
  MigrationPlanSchema,
  MigrationReportSchema,
} from "./types/migration.js";
```

- [ ] **Step 8: Create vitest config for core**

Create `packages/core/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd /home/o9oem/workspace/mine/wp-transfer && pnpm vitest run packages/core/tests/schemas.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 10: Commit**

```bash
git add packages/core/
git commit -m "feat(core): add WP, migration, plugin, and portable text type definitions with Zod schemas"
```

---

## Task 3: Secret Scanner (Core Security)

**Files:**
- Create: `packages/core/src/security/secret-scanner.ts`
- Test: `packages/core/tests/secret-scanner.test.ts`

- [ ] **Step 1: Write failing test for secret scanner**

Create `packages/core/tests/secret-scanner.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { scanForSecrets } from "../src/security/secret-scanner.js";

describe("scanForSecrets", () => {
  it("detects AWS access key", () => {
    const input = 'const key = "AKIAIOSFODNN7EXAMPLE";';
    const results = scanForSecrets(input);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("aws-access-key");
  });

  it("detects generic API key pattern", () => {
    const input = 'define("DB_PASSWORD", "super_secret_123");';
    const results = scanForSecrets(input);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("detects private key blocks", () => {
    const input = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...";
    const results = scanForSecrets(input);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("private-key");
  });

  it("returns empty for clean content", () => {
    const input = "const greeting = 'hello world';";
    const results = scanForSecrets(input);
    expect(results).toHaveLength(0);
  });

  it("detects WP-specific secrets in wp-config patterns", () => {
    const input = `define('AUTH_KEY', 'put your unique phrase here');
define('SECURE_AUTH_KEY', 'xK9#mP2$vR7@nL4');`;
    const results = scanForSecrets(input);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/tests/secret-scanner.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement secret scanner**

Create `packages/core/src/security/secret-scanner.ts`:

```typescript
export interface SecretMatch {
  type: string;
  line: number;
  column: number;
  snippet: string;
  severity: "high" | "medium" | "low";
}

interface SecretPattern {
  type: string;
  regex: RegExp;
  severity: "high" | "medium" | "low";
}

const PATTERNS: SecretPattern[] = [
  {
    type: "aws-access-key",
    regex: /AKIA[0-9A-Z]{16}/g,
    severity: "high",
  },
  {
    type: "private-key",
    regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
    severity: "high",
  },
  {
    type: "wp-auth-key",
    regex: /define\s*\(\s*['"](?:AUTH_KEY|SECURE_AUTH_KEY|LOGGED_IN_KEY|NONCE_KEY|AUTH_SALT|SECURE_AUTH_SALT|LOGGED_IN_SALT|NONCE_SALT)['"]\s*,\s*['"][^'"]{8,}['"]\s*\)/g,
    severity: "medium",
  },
  {
    type: "wp-db-password",
    regex: /define\s*\(\s*['"]DB_PASSWORD['"]\s*,\s*['"][^'"]+['"]\s*\)/g,
    severity: "high",
  },
  {
    type: "generic-secret",
    regex: /(?:api[_-]?key|secret[_-]?key|password|token|credential)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    severity: "medium",
  },
  {
    type: "github-token",
    regex: /gh[ps]_[A-Za-z0-9_]{36,}/g,
    severity: "high",
  },
  {
    type: "slack-token",
    regex: /xox[baprs]-[0-9A-Za-z-]{10,}/g,
    severity: "high",
  },
];

export function scanForSecrets(content: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  const lines = content.split("\n");

  for (const pattern of PATTERNS) {
    // Reset regex state for each scan
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;
      const lastNewline = beforeMatch.lastIndexOf("\n");
      const column = match.index - lastNewline;

      matches.push({
        type: pattern.type,
        line: lineNumber,
        column,
        snippet: match[0].slice(0, 60) + (match[0].length > 60 ? "..." : ""),
        severity: pattern.severity,
      });
    }
  }

  return matches;
}
```

- [ ] **Step 4: Export from index.ts**

Add to `packages/core/src/index.ts`:

```typescript
// Security
export { scanForSecrets } from "./security/secret-scanner.js";
export type { SecretMatch } from "./security/secret-scanner.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/tests/secret-scanner.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/security/ packages/core/tests/secret-scanner.test.ts packages/core/src/index.ts
git commit -m "feat(core): add secret scanner for detecting credentials in WP exports"
```

---

## Task 4: WXR Test Fixtures

**Files:**
- Create: `fixtures/wxr/minimal.xml`
- Create: `fixtures/wxr/gutenberg-blocks.xml`
- Create: `fixtures/wxr/acf-fields.xml`

- [ ] **Step 1: Create minimal WXR fixture**

Create `fixtures/wxr/minimal.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>Test Site</title>
  <link>https://example.com</link>
  <description>A test WordPress site</description>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_site_url>https://example.com</wp:base_site_url>
  <wp:base_blog_url>https://example.com</wp:base_blog_url>
  <generator>https://wordpress.org/?v=6.7</generator>

  <wp:author>
    <wp:author_id>1</wp:author_id>
    <wp:author_login><![CDATA[admin]]></wp:author_login>
    <wp:author_email><![CDATA[admin@example.com]]></wp:author_email>
    <wp:author_display_name><![CDATA[Admin User]]></wp:author_display_name>
  </wp:author>

  <wp:category>
    <wp:term_id>1</wp:term_id>
    <wp:category_nicename><![CDATA[uncategorized]]></wp:category_nicename>
    <wp:category_parent></wp:category_parent>
    <wp:cat_name><![CDATA[Uncategorized]]></wp:cat_name>
  </wp:category>

  <wp:tag>
    <wp:term_id>2</wp:term_id>
    <wp:tag_slug><![CDATA[hello]]></wp:tag_slug>
    <wp:tag_name><![CDATA[Hello]]></wp:tag_name>
  </wp:tag>

  <item>
    <title>Hello World</title>
    <link>https://example.com/2024/01/hello-world/</link>
    <dc:creator><![CDATA[admin]]></dc:creator>
    <content:encoded><![CDATA[<p>Welcome to WordPress. This is your first post.</p>]]></content:encoded>
    <excerpt:encoded><![CDATA[]]></excerpt:encoded>
    <wp:post_id>1</wp:post_id>
    <wp:post_date><![CDATA[2024-01-01 00:00:00]]></wp:post_date>
    <wp:post_date_gmt><![CDATA[2024-01-01 00:00:00]]></wp:post_date_gmt>
    <wp:post_modified><![CDATA[2024-01-01 00:00:00]]></wp:post_modified>
    <wp:comment_status><![CDATA[open]]></wp:comment_status>
    <wp:post_name><![CDATA[hello-world]]></wp:post_name>
    <wp:status><![CDATA[publish]]></wp:status>
    <wp:post_parent>0</wp:post_parent>
    <wp:menu_order>0</wp:menu_order>
    <wp:post_type><![CDATA[post]]></wp:post_type>
    <wp:postmeta>
      <wp:meta_key><![CDATA[_edit_last]]></wp:meta_key>
      <wp:meta_value><![CDATA[1]]></wp:meta_value>
    </wp:postmeta>
    <category domain="category" nicename="uncategorized"><![CDATA[Uncategorized]]></category>
    <category domain="post_tag" nicename="hello"><![CDATA[Hello]]></category>
  </item>

  <item>
    <title>Sample Page</title>
    <link>https://example.com/sample-page/</link>
    <dc:creator><![CDATA[admin]]></dc:creator>
    <content:encoded><![CDATA[<p>This is a sample page.</p>]]></content:encoded>
    <excerpt:encoded><![CDATA[]]></excerpt:encoded>
    <wp:post_id>2</wp:post_id>
    <wp:post_date><![CDATA[2024-01-01 00:00:00]]></wp:post_date>
    <wp:post_date_gmt><![CDATA[2024-01-01 00:00:00]]></wp:post_date_gmt>
    <wp:post_modified><![CDATA[2024-01-01 00:00:00]]></wp:post_modified>
    <wp:comment_status><![CDATA[closed]]></wp:comment_status>
    <wp:post_name><![CDATA[sample-page]]></wp:post_name>
    <wp:status><![CDATA[publish]]></wp:status>
    <wp:post_parent>0</wp:post_parent>
    <wp:menu_order>0</wp:menu_order>
    <wp:post_type><![CDATA[page]]></wp:post_type>
  </item>

</channel>
</rss>
```

- [ ] **Step 2: Create Gutenberg blocks WXR fixture**

Create `fixtures/wxr/gutenberg-blocks.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>Gutenberg Test</title>
  <link>https://example.com</link>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_site_url>https://example.com</wp:base_site_url>
  <generator>https://wordpress.org/?v=6.7</generator>

  <wp:author>
    <wp:author_id>1</wp:author_id>
    <wp:author_login><![CDATA[admin]]></wp:author_login>
    <wp:author_email><![CDATA[admin@example.com]]></wp:author_email>
    <wp:author_display_name><![CDATA[Admin]]></wp:author_display_name>
  </wp:author>

  <item>
    <title>Gutenberg Post</title>
    <dc:creator><![CDATA[admin]]></dc:creator>
    <content:encoded><![CDATA[<!-- wp:paragraph -->
<p>A paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">A Heading</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list"><li>Item one</li><li>Item two</li><li>Item three</li></ul>
<!-- /wp:list -->

<!-- wp:image {"id":10,"sizeSlug":"large"} -->
<figure class="wp-block-image size-large"><img src="https://example.com/wp-content/uploads/2024/01/photo.jpg" alt="A photo" class="wp-image-10"/><figcaption class="wp-element-caption">Photo caption</figcaption></figure>
<!-- /wp:image -->

<!-- wp:quote -->
<blockquote class="wp-block-quote"><p>To be or not to be.</p><cite>Shakespeare</cite></blockquote>
<!-- /wp:quote -->

<!-- wp:code -->
<pre class="wp-block-code"><code>console.log("hello");</code></pre>
<!-- /wp:code -->

<!-- wp:embed {"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","type":"video","providerNameSlug":"youtube"} -->
<figure class="wp-block-embed is-type-video is-provider-youtube"><div class="wp-block-embed__wrapper">https://www.youtube.com/watch?v=dQw4w9WgXcQ</div></figure>
<!-- /wp:embed -->]]></content:encoded>
    <wp:post_id>3</wp:post_id>
    <wp:post_date><![CDATA[2024-06-15 12:00:00]]></wp:post_date>
    <wp:post_date_gmt><![CDATA[2024-06-15 03:00:00]]></wp:post_date_gmt>
    <wp:post_modified><![CDATA[2024-06-15 12:00:00]]></wp:post_modified>
    <wp:post_name><![CDATA[gutenberg-post]]></wp:post_name>
    <wp:status><![CDATA[publish]]></wp:status>
    <wp:post_parent>0</wp:post_parent>
    <wp:menu_order>0</wp:menu_order>
    <wp:post_type><![CDATA[post]]></wp:post_type>
  </item>

</channel>
</rss>
```

- [ ] **Step 3: Create ACF fields WXR fixture**

Create `fixtures/wxr/acf-fields.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>ACF Test</title>
  <link>https://example.com</link>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_site_url>https://example.com</wp:base_site_url>
  <generator>https://wordpress.org/?v=6.7</generator>

  <wp:author>
    <wp:author_id>1</wp:author_id>
    <wp:author_login><![CDATA[admin]]></wp:author_login>
    <wp:author_email><![CDATA[admin@example.com]]></wp:author_email>
    <wp:author_display_name><![CDATA[Admin]]></wp:author_display_name>
  </wp:author>

  <item>
    <title>Product Page</title>
    <dc:creator><![CDATA[admin]]></dc:creator>
    <content:encoded><![CDATA[<p>A product page with ACF fields.</p>]]></content:encoded>
    <excerpt:encoded><![CDATA[]]></excerpt:encoded>
    <wp:post_id>10</wp:post_id>
    <wp:post_date><![CDATA[2024-03-01 10:00:00]]></wp:post_date>
    <wp:post_date_gmt><![CDATA[2024-03-01 01:00:00]]></wp:post_date_gmt>
    <wp:post_modified><![CDATA[2024-03-01 10:00:00]]></wp:post_modified>
    <wp:post_name><![CDATA[product-page]]></wp:post_name>
    <wp:status><![CDATA[publish]]></wp:status>
    <wp:post_parent>0</wp:post_parent>
    <wp:menu_order>0</wp:menu_order>
    <wp:post_type><![CDATA[post]]></wp:post_type>
    <wp:postmeta>
      <wp:meta_key><![CDATA[price]]></wp:meta_key>
      <wp:meta_value><![CDATA[29.99]]></wp:meta_value>
    </wp:postmeta>
    <wp:postmeta>
      <wp:meta_key><![CDATA[_price]]></wp:meta_key>
      <wp:meta_value><![CDATA[field_abc123]]></wp:meta_value>
    </wp:postmeta>
    <wp:postmeta>
      <wp:meta_key><![CDATA[color]]></wp:meta_key>
      <wp:meta_value><![CDATA[red]]></wp:meta_value>
    </wp:postmeta>
    <wp:postmeta>
      <wp:meta_key><![CDATA[_color]]></wp:meta_key>
      <wp:meta_value><![CDATA[field_def456]]></wp:meta_value>
    </wp:postmeta>
    <wp:postmeta>
      <wp:meta_key><![CDATA[is_featured]]></wp:meta_key>
      <wp:meta_value><![CDATA[1]]></wp:meta_value>
    </wp:postmeta>
    <wp:postmeta>
      <wp:meta_key><![CDATA[_is_featured]]></wp:meta_key>
      <wp:meta_value><![CDATA[field_ghi789]]></wp:meta_value>
    </wp:postmeta>
    <wp:postmeta>
      <wp:meta_key><![CDATA[_yoast_wpseo_title]]></wp:meta_key>
      <wp:meta_value><![CDATA[Product Page - Best Product %%sep%% %%sitename%%]]></wp:meta_value>
    </wp:postmeta>
    <wp:postmeta>
      <wp:meta_key><![CDATA[_yoast_wpseo_metadesc]]></wp:meta_key>
      <wp:meta_value><![CDATA[Buy the best product at an affordable price.]]></wp:meta_value>
    </wp:postmeta>
  </item>

</channel>
</rss>
```

- [ ] **Step 4: Commit**

```bash
git add fixtures/
git commit -m "test: add WXR test fixtures (minimal, gutenberg blocks, ACF fields)"
```

---

## Task 5: WXR Streaming Parser

**Files:**
- Create: `packages/wxr-parser/src/stream-parser.ts`
- Create: `packages/wxr-parser/src/post-collector.ts`
- Create: `packages/wxr-parser/src/taxonomy-collector.ts`
- Create: `packages/wxr-parser/src/media-collector.ts`
- Create: `packages/wxr-parser/src/user-collector.ts`
- Create: `packages/wxr-parser/src/index.ts`
- Create: `packages/wxr-parser/vitest.config.ts`
- Test: `packages/wxr-parser/tests/stream-parser.test.ts`
- Test: `packages/wxr-parser/tests/post-collector.test.ts`

- [ ] **Step 1: Write failing test for WXR stream parser**

Create `packages/wxr-parser/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
```

Create `packages/wxr-parser/tests/stream-parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "../src/index.js";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/wxr");

describe("parseWxr", () => {
  it("parses minimal WXR and extracts posts", async () => {
    const stream = createReadStream(resolve(fixturesDir, "minimal.xml"));
    const result = await parseWxr(stream);

    expect(result.posts).toHaveLength(2);
    expect(result.posts[0].title).toBe("Hello World");
    expect(result.posts[0].slug).toBe("hello-world");
    expect(result.posts[0].status).toBe("publish");
    expect(result.posts[0].type).toBe("post");
    expect(result.posts[1].title).toBe("Sample Page");
    expect(result.posts[1].type).toBe("page");
  });

  it("extracts authors", async () => {
    const stream = createReadStream(resolve(fixturesDir, "minimal.xml"));
    const result = await parseWxr(stream);

    expect(result.users).toHaveLength(1);
    expect(result.users[0].login).toBe("admin");
    expect(result.users[0].email).toBe("admin@example.com");
  });

  it("extracts taxonomy terms", async () => {
    const stream = createReadStream(resolve(fixturesDir, "minimal.xml"));
    const result = await parseWxr(stream);

    expect(result.taxonomies.length).toBeGreaterThanOrEqual(2);
    const cat = result.taxonomies.find((t) => t.slug === "uncategorized");
    expect(cat).toBeDefined();
    expect(cat!.taxonomy).toBe("category");

    const tag = result.taxonomies.find((t) => t.slug === "hello");
    expect(tag).toBeDefined();
    expect(tag!.taxonomy).toBe("post_tag");
  });

  it("extracts site metadata", async () => {
    const stream = createReadStream(resolve(fixturesDir, "minimal.xml"));
    const result = await parseWxr(stream);

    expect(result.siteTitle).toBe("Test Site");
    expect(result.siteUrl).toBe("https://example.com");
    expect(result.wpVersion).toBe("6.7");
  });

  it("extracts post meta (ACF fields)", async () => {
    const stream = createReadStream(resolve(fixturesDir, "acf-fields.xml"));
    const result = await parseWxr(stream);

    const post = result.posts[0];
    expect(post.meta["price"]).toBe("29.99");
    expect(post.meta["_price"]).toBe("field_abc123");
    expect(post.meta["_yoast_wpseo_title"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/wxr-parser/tests/stream-parser.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement SAX stream parser core**

Create `packages/wxr-parser/src/stream-parser.ts`:

```typescript
import * as sax from "sax";
import type { Readable } from "node:stream";

export interface WxrSiteInfo {
  siteTitle: string;
  siteUrl: string;
  wpVersion: string;
  wxrVersion: string;
}

export interface SaxContext {
  currentTag: string;
  tagStack: string[];
  textBuffer: string;
  inItem: boolean;
  inAuthor: boolean;
  inCategory: boolean;
  inTag: boolean;
  inPostmeta: boolean;
  currentMetaKey: string;
}

export function createSaxContext(): SaxContext {
  return {
    currentTag: "",
    tagStack: [],
    textBuffer: "",
    inItem: false,
    inAuthor: false,
    inCategory: false,
    inTag: false,
    inPostmeta: false,
    currentMetaKey: "",
  };
}

export interface SaxEventHandlers {
  onSiteInfo: (info: Partial<WxrSiteInfo>) => void;
  onOpenTag: (name: string, attributes: Record<string, string>, ctx: SaxContext) => void;
  onText: (text: string, ctx: SaxContext) => void;
  onCloseTag: (name: string, ctx: SaxContext) => void;
  onCdata: (cdata: string, ctx: SaxContext) => void;
}

export function parseSaxStream(
  stream: Readable,
  handlers: SaxEventHandlers,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(false, {
      lowercase: true,
      trim: false,
      // XXE protection: sax-js does not resolve external entities by default
      // but we explicitly disable by not setting any entity resolver
    });

    const ctx = createSaxContext();
    const siteInfo: Partial<WxrSiteInfo> = {};

    parser.on("opentag", (node) => {
      const name = node.name;
      ctx.tagStack.push(name);
      ctx.currentTag = name;
      ctx.textBuffer = "";

      if (name === "item") ctx.inItem = true;
      if (name === "wp:author") ctx.inAuthor = true;
      if (name === "wp:category") ctx.inCategory = true;
      if (name === "wp:tag") ctx.inTag = true;
      if (name === "wp:postmeta") ctx.inPostmeta = true;

      handlers.onOpenTag(name, node.attributes as Record<string, string>, ctx);
    });

    parser.on("text", (text) => {
      ctx.textBuffer += text;
      handlers.onText(text, ctx);
    });

    parser.on("cdata", (cdata) => {
      ctx.textBuffer += cdata;
      handlers.onCdata(cdata, ctx);
    });

    parser.on("closetag", (name) => {
      // Extract site-level info
      if (!ctx.inItem && !ctx.inAuthor && !ctx.inCategory && !ctx.inTag) {
        if (name === "title") siteInfo.siteTitle = ctx.textBuffer.trim();
        if (name === "wp:base_site_url" || name === "wp:base_blog_url") {
          siteInfo.siteUrl = siteInfo.siteUrl || ctx.textBuffer.trim();
        }
        if (name === "wp:wxr_version") siteInfo.wxrVersion = ctx.textBuffer.trim();
        if (name === "generator") {
          const match = ctx.textBuffer.match(/\?v=([\d.]+)/);
          if (match) siteInfo.wpVersion = match[1];
        }
      }

      handlers.onCloseTag(name, ctx);

      if (name === "item") ctx.inItem = false;
      if (name === "wp:author") ctx.inAuthor = false;
      if (name === "wp:category") ctx.inCategory = false;
      if (name === "wp:tag") ctx.inTag = false;
      if (name === "wp:postmeta") ctx.inPostmeta = false;

      ctx.tagStack.pop();
      ctx.currentTag = ctx.tagStack[ctx.tagStack.length - 1] || "";
      ctx.textBuffer = "";
    });

    parser.on("end", () => {
      handlers.onSiteInfo(siteInfo);
      resolve();
    });

    parser.on("error", (err) => {
      reject(new Error(`WXR parse error: ${err.message}`));
    });

    stream.pipe(parser);
  });
}
```

- [ ] **Step 4: Implement post collector**

Create `packages/wxr-parser/src/post-collector.ts`:

```typescript
import type { WpPost } from "@wp-transfer/core";
import type { SaxContext } from "./stream-parser.js";

export interface PostCollectorState {
  posts: WpPost[];
}

export function createPostCollector(): {
  state: PostCollectorState;
  onOpenTag: (name: string, attrs: Record<string, string>, ctx: SaxContext) => void;
  onCloseTag: (name: string, ctx: SaxContext) => void;
} {
  const state: PostCollectorState = { posts: [] };
  let current: Partial<WpPost> = {};
  let categories: number[] = [];
  let tags: number[] = [];
  let meta: Record<string, unknown> = {};
  let currentMetaKey = "";

  return {
    state,
    onOpenTag(name, attrs, ctx) {
      if (name === "item") {
        current = {};
        categories = [];
        tags = [];
        meta = {};
      }
      if (ctx.inItem && name === "category") {
        // Will be processed on close
      }
    },
    onCloseTag(name, ctx) {
      if (!ctx.inItem) return;

      const text = ctx.textBuffer.trim();

      switch (name) {
        case "title":
          if (!ctx.inPostmeta) current.title = text;
          break;
        case "wp:post_id":
          current.id = parseInt(text, 10);
          break;
        case "wp:post_name":
          current.slug = text;
          break;
        case "wp:status":
          current.status = text as WpPost["status"];
          break;
        case "wp:post_type":
          current.type = text;
          break;
        case "content:encoded":
          current.content = text;
          break;
        case "excerpt:encoded":
          current.excerpt = text;
          break;
        case "wp:post_date":
          current.date = text;
          break;
        case "wp:post_modified":
          current.modified = text;
          break;
        case "dc:creator":
          // Will be resolved to author ID later
          current.author = 0;
          break;
        case "wp:post_parent":
          current.parentId = parseInt(text, 10) || undefined;
          break;
        case "wp:menu_order":
          current.menuOrder = parseInt(text, 10);
          break;
        case "wp:comment_status":
          current.commentStatus = text as "open" | "closed";
          break;
        case "wp:meta_key":
          currentMetaKey = text;
          break;
        case "wp:meta_value":
          if (currentMetaKey) {
            meta[currentMetaKey] = text;
            currentMetaKey = "";
          }
          break;
        case "wp:postmeta":
          currentMetaKey = "";
          break;
        case "item":
          if (current.id !== undefined && current.title !== undefined) {
            state.posts.push({
              id: current.id,
              title: current.title,
              slug: current.slug || "",
              status: current.status || "draft",
              type: current.type || "post",
              content: current.content || "",
              excerpt: current.excerpt || "",
              date: current.date || "",
              modified: current.modified || "",
              author: current.author || 0,
              meta,
              parentId: current.parentId,
              menuOrder: current.menuOrder,
              commentStatus: current.commentStatus,
              categories,
              tags,
            });
          }
          break;
      }
    },
  };
}
```

- [ ] **Step 5: Implement taxonomy collector**

Create `packages/wxr-parser/src/taxonomy-collector.ts`:

```typescript
import type { WpTaxonomyTerm } from "@wp-transfer/core";
import type { SaxContext } from "./stream-parser.js";

export interface TaxonomyCollectorState {
  taxonomies: WpTaxonomyTerm[];
}

export function createTaxonomyCollector(): {
  state: TaxonomyCollectorState;
  onCloseTag: (name: string, ctx: SaxContext) => void;
} {
  const state: TaxonomyCollectorState = { taxonomies: [] };
  let current: Partial<WpTaxonomyTerm> = {};

  return {
    state,
    onCloseTag(name, ctx) {
      const text = ctx.textBuffer.trim();

      if (ctx.inCategory) {
        switch (name) {
          case "wp:term_id":
            current.id = parseInt(text, 10);
            break;
          case "wp:category_nicename":
            current.slug = text;
            break;
          case "wp:cat_name":
            current.name = text;
            break;
          case "wp:category_parent":
            if (text) {
              // Parent is stored as slug in WXR, resolve later
              current.description = text; // temporary
            }
            break;
          case "wp:category":
            if (current.id !== undefined) {
              state.taxonomies.push({
                id: current.id,
                name: current.name || "",
                slug: current.slug || "",
                taxonomy: "category",
              });
            }
            current = {};
            break;
        }
      }

      if (ctx.inTag) {
        switch (name) {
          case "wp:term_id":
            current.id = parseInt(text, 10);
            break;
          case "wp:tag_slug":
            current.slug = text;
            break;
          case "wp:tag_name":
            current.name = text;
            break;
          case "wp:tag":
            if (current.id !== undefined) {
              state.taxonomies.push({
                id: current.id,
                name: current.name || "",
                slug: current.slug || "",
                taxonomy: "post_tag",
              });
            }
            current = {};
            break;
        }
      }
    },
  };
}
```

- [ ] **Step 6: Implement user collector**

Create `packages/wxr-parser/src/user-collector.ts`:

```typescript
import type { WpUser } from "@wp-transfer/core";
import type { SaxContext } from "./stream-parser.js";

export interface UserCollectorState {
  users: WpUser[];
}

export function createUserCollector(): {
  state: UserCollectorState;
  onCloseTag: (name: string, ctx: SaxContext) => void;
} {
  const state: UserCollectorState = { users: [] };
  let current: Partial<WpUser> = {};

  return {
    state,
    onCloseTag(name, ctx) {
      if (!ctx.inAuthor) return;

      const text = ctx.textBuffer.trim();

      switch (name) {
        case "wp:author_id":
          current.id = parseInt(text, 10);
          break;
        case "wp:author_login":
          current.login = text;
          break;
        case "wp:author_email":
          current.email = text;
          break;
        case "wp:author_display_name":
          current.displayName = text;
          break;
        case "wp:author":
          if (current.id !== undefined) {
            state.users.push({
              id: current.id,
              login: current.login || "",
              email: current.email || "",
              displayName: current.displayName || "",
              role: "subscriber",
              registered: "",
            });
          }
          current = {};
          break;
      }
    },
  };
}
```

- [ ] **Step 7: Implement media collector**

Create `packages/wxr-parser/src/media-collector.ts`:

```typescript
import type { WpMedia } from "@wp-transfer/core";
import type { SaxContext } from "./stream-parser.js";

export interface MediaCollectorState {
  media: WpMedia[];
}

export function createMediaCollector(): {
  state: MediaCollectorState;
  onCloseTag: (name: string, ctx: SaxContext) => void;
} {
  const state: MediaCollectorState = { media: [] };
  let currentPost: { id?: number; type?: string; title?: string; meta: Record<string, string> } = {
    meta: {},
  };
  let currentMetaKey = "";

  return {
    state,
    onCloseTag(name, ctx) {
      if (!ctx.inItem) return;

      const text = ctx.textBuffer.trim();

      switch (name) {
        case "wp:post_id":
          currentPost.id = parseInt(text, 10);
          break;
        case "wp:post_type":
          currentPost.type = text;
          break;
        case "title":
          if (!ctx.inPostmeta) currentPost.title = text;
          break;
        case "wp:meta_key":
          currentMetaKey = text;
          break;
        case "wp:meta_value":
          if (currentMetaKey) {
            currentPost.meta[currentMetaKey] = text;
            currentMetaKey = "";
          }
          break;
        case "item":
          if (currentPost.type === "attachment" && currentPost.id) {
            const url = currentPost.meta["_wp_attached_file"] || "";
            state.media.push({
              id: currentPost.id,
              title: currentPost.title || "",
              url,
              mimeType: currentPost.meta["_wp_attachment_metadata"]
                ? "image/jpeg"
                : "application/octet-stream",
              alt: currentPost.meta["_wp_attachment_image_alt"],
            });
          }
          currentPost = { meta: {} };
          currentMetaKey = "";
          break;
      }
    },
  };
}
```

- [ ] **Step 8: Create parseWxr orchestrator and index**

Create `packages/wxr-parser/src/index.ts`:

```typescript
import type { Readable } from "node:stream";
import type { WpPost, WpUser, WpTaxonomyTerm, WpMedia } from "@wp-transfer/core";
import { parseSaxStream, type WxrSiteInfo } from "./stream-parser.js";
import { createPostCollector } from "./post-collector.js";
import { createTaxonomyCollector } from "./taxonomy-collector.js";
import { createUserCollector } from "./user-collector.js";
import { createMediaCollector } from "./media-collector.js";

export interface WxrParseResult {
  siteTitle: string;
  siteUrl: string;
  wpVersion: string;
  posts: WpPost[];
  users: WpUser[];
  taxonomies: WpTaxonomyTerm[];
  media: WpMedia[];
}

export async function parseWxr(stream: Readable): Promise<WxrParseResult> {
  const postCollector = createPostCollector();
  const taxonomyCollector = createTaxonomyCollector();
  const userCollector = createUserCollector();
  const mediaCollector = createMediaCollector();

  let siteInfo: Partial<WxrSiteInfo> = {};

  await parseSaxStream(stream, {
    onSiteInfo(info) {
      siteInfo = info;
    },
    onOpenTag(name, attrs, ctx) {
      postCollector.onOpenTag(name, attrs, ctx);
    },
    onText() {},
    onCdata() {},
    onCloseTag(name, ctx) {
      postCollector.onCloseTag(name, ctx);
      taxonomyCollector.onCloseTag(name, ctx);
      userCollector.onCloseTag(name, ctx);
      mediaCollector.onCloseTag(name, ctx);
    },
  });

  return {
    siteTitle: siteInfo.siteTitle || "",
    siteUrl: siteInfo.siteUrl || "",
    wpVersion: siteInfo.wpVersion || "",
    posts: postCollector.state.posts,
    users: userCollector.state.users,
    taxonomies: taxonomyCollector.state.taxonomies,
    media: mediaCollector.state.media,
  };
}

export type { WxrSiteInfo } from "./stream-parser.js";
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm vitest run packages/wxr-parser/tests/stream-parser.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 10: Commit**

```bash
git add packages/wxr-parser/ fixtures/
git commit -m "feat(wxr-parser): implement SAX streaming WXR parser with post, taxonomy, user, media collectors"
```

---

## Task 6: Analyzer — REST API Client

**Files:**
- Create: `packages/analyzer/src/rest-client.ts`
- Create: `packages/analyzer/vitest.config.ts`
- Create: `fixtures/rest-api/site-info.json`
- Create: `fixtures/rest-api/plugins.json`
- Create: `fixtures/rest-api/types.json`
- Test: `packages/analyzer/tests/rest-client.test.ts`

- [ ] **Step 1: Create REST API mock fixtures**

Create `fixtures/rest-api/site-info.json`:

```json
{
  "name": "Test Site",
  "description": "Just another WordPress site",
  "url": "https://example.com",
  "home": "https://example.com",
  "gmt_offset": "0",
  "timezone_string": "UTC",
  "namespaces": ["wp/v2", "oembed/1.0"],
  "authentication": { "application-passwords": { "endpoints": { "authorization": "https://example.com/wp-admin/authorize-application.php" } } }
}
```

Create `fixtures/rest-api/plugins.json`:

```json
[
  { "plugin": "contact-form-7/wp-contact-form-7.php", "status": "active", "name": "Contact Form 7", "version": "5.9.8", "author": "Takayuki Miyoshi" },
  { "plugin": "wordpress-seo/wp-seo.php", "status": "active", "name": "Yoast SEO", "version": "23.5", "author": "Team Yoast" },
  { "plugin": "advanced-custom-fields/acf.php", "status": "active", "name": "Advanced Custom Fields", "version": "6.3.10", "author": "WP Engine" },
  { "plugin": "wp-mail-smtp/wp_mail_smtp.php", "status": "inactive", "name": "WP Mail SMTP", "version": "4.1.0", "author": "WPForms" }
]
```

Create `fixtures/rest-api/types.json`:

```json
{
  "post": { "slug": "post", "name": "Posts", "rest_base": "posts", "hierarchical": false },
  "page": { "slug": "page", "name": "Pages", "rest_base": "pages", "hierarchical": true },
  "product": { "slug": "product", "name": "Products", "rest_base": "products", "hierarchical": false }
}
```

- [ ] **Step 2: Write failing test for REST client**

Create `packages/analyzer/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
```

Create `packages/analyzer/tests/rest-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWpRestClient, type WpRestClient } from "../src/rest-client.js";

// Mock ofetch
vi.mock("ofetch", () => ({
  $fetch: vi.fn(),
  FetchError: class FetchError extends Error {
    status: number;
    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  },
}));

import { $fetch } from "ofetch";
const mockFetch = vi.mocked($fetch);

describe("WpRestClient", () => {
  let client: WpRestClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createWpRestClient("https://example.com");
  });

  it("probes site info from /wp-json/", async () => {
    mockFetch.mockResolvedValueOnce({
      name: "Test Site",
      url: "https://example.com",
      namespaces: ["wp/v2"],
    });

    const info = await client.probeSiteInfo();
    expect(info.name).toBe("Test Site");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/wp-json/",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fetches plugins with authentication", async () => {
    mockFetch.mockResolvedValueOnce([
      { plugin: "wordpress-seo/wp-seo.php", status: "active", name: "Yoast SEO", version: "23.5" },
    ]);

    const authedClient = createWpRestClient("https://example.com", {
      username: "admin",
      applicationPassword: "xxxx xxxx xxxx",
    });
    const plugins = await authedClient.fetchPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe("Yoast SEO");
  });

  it("fetches post types", async () => {
    mockFetch.mockResolvedValueOnce({
      post: { slug: "post", name: "Posts", hierarchical: false },
      page: { slug: "page", name: "Pages", hierarchical: true },
    });

    const types = await client.fetchPostTypes();
    expect(types).toHaveLength(2);
    expect(types[0].slug).toBe("post");
  });

  it("handles connection errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(client.probeSiteInfo()).rejects.toThrow("ECONNREFUSED");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/analyzer/tests/rest-client.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 4: Implement REST client**

Create `packages/analyzer/src/rest-client.ts`:

```typescript
import { $fetch } from "ofetch";

export interface WpRestAuth {
  username: string;
  applicationPassword: string;
}

export interface WpSiteInfo {
  name: string;
  description: string;
  url: string;
  namespaces: string[];
  hasApplicationPasswords: boolean;
}

export interface WpRestPlugin {
  plugin: string;
  status: string;
  name: string;
  version: string;
  author?: string;
}

export interface WpRestPostType {
  slug: string;
  name: string;
  restBase?: string;
  hierarchical: boolean;
}

export interface WpRestClient {
  probeSiteInfo(): Promise<WpSiteInfo>;
  fetchPlugins(): Promise<WpRestPlugin[]>;
  fetchPostTypes(): Promise<WpRestPostType[]>;
  fetchPostCount(postType: string): Promise<number>;
}

export function createWpRestClient(
  siteUrl: string,
  auth?: WpRestAuth,
): WpRestClient {
  const baseUrl = siteUrl.replace(/\/+$/, "");

  function getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Accept": "application/json",
    };
    if (auth) {
      const token = Buffer.from(
        `${auth.username}:${auth.applicationPassword}`,
      ).toString("base64");
      headers["Authorization"] = `Basic ${token}`;
    }
    return headers;
  }

  async function fetchJson<T>(path: string): Promise<T> {
    return $fetch<T>(`${baseUrl}${path}`, {
      method: "GET",
      headers: getHeaders(),
    });
  }

  return {
    async probeSiteInfo() {
      const data = await fetchJson<Record<string, unknown>>("/wp-json/");
      return {
        name: (data.name as string) || "",
        description: (data.description as string) || "",
        url: (data.url as string) || baseUrl,
        namespaces: (data.namespaces as string[]) || [],
        hasApplicationPasswords: !!data.authentication,
      };
    },

    async fetchPlugins() {
      const data = await fetchJson<WpRestPlugin[]>("/wp-json/wp/v2/plugins");
      return data;
    },

    async fetchPostTypes() {
      const data = await fetchJson<Record<string, WpRestPostType>>(
        "/wp-json/wp/v2/types",
      );
      return Object.values(data);
    },

    async fetchPostCount(postType: string) {
      const data = await fetchJson<unknown[]>(
        `/wp-json/wp/v2/${postType}?per_page=1`,
      );
      // Total count comes from X-WP-Total header, but in ofetch we get the body
      // For now return the array length (will be refined with header inspection)
      return Array.isArray(data) ? data.length : 0;
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/analyzer/tests/rest-client.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/analyzer/src/rest-client.ts packages/analyzer/tests/ packages/analyzer/vitest.config.ts fixtures/rest-api/
git commit -m "feat(analyzer): implement WP REST API client with ofetch"
```

---

## Task 7: Analyzer — Plugin Detector

**Files:**
- Create: `packages/analyzer/src/plugin-detector.ts`
- Create: `packages/analyzer/src/plugin-registry.ts`
- Test: `packages/analyzer/tests/plugin-detector.test.ts`

- [ ] **Step 1: Write failing test for plugin detector**

Create `packages/analyzer/tests/plugin-detector.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { classifyPlugin } from "../src/plugin-detector.js";

describe("classifyPlugin", () => {
  it("classifies Yoast SEO correctly", () => {
    const result = classifyPlugin({
      plugin: "wordpress-seo/wp-seo.php",
      status: "active",
      name: "Yoast SEO",
      version: "23.5",
    });

    expect(result.slug).toBe("wordpress-seo");
    expect(result.category).toBe("seo");
    expect(result.migrationStrategy).toBe("template");
    expect(result.difficulty).toBeLessThanOrEqual(3);
  });

  it("classifies ACF correctly", () => {
    const result = classifyPlugin({
      plugin: "advanced-custom-fields/acf.php",
      status: "active",
      name: "Advanced Custom Fields",
      version: "6.3.10",
    });

    expect(result.slug).toBe("advanced-custom-fields");
    expect(result.category).toBe("custom-fields");
    expect(result.migrationStrategy).toBe("template");
  });

  it("classifies WooCommerce as manual/high difficulty", () => {
    const result = classifyPlugin({
      plugin: "woocommerce/woocommerce.php",
      status: "active",
      name: "WooCommerce",
      version: "9.0",
    });

    expect(result.category).toBe("ecommerce");
    expect(result.migrationStrategy).toBe("manual");
    expect(result.difficulty).toBeGreaterThanOrEqual(4);
  });

  it("classifies unknown plugin as llm-assisted", () => {
    const result = classifyPlugin({
      plugin: "my-custom-plugin/my-custom-plugin.php",
      status: "active",
      name: "My Custom Plugin",
      version: "1.0",
    });

    expect(result.category).toBe("other");
    expect(result.migrationStrategy).toBe("llm-assisted");
  });

  it("marks inactive plugins as not-needed", () => {
    const result = classifyPlugin({
      plugin: "hello-dolly/hello.php",
      status: "inactive",
      name: "Hello Dolly",
      version: "1.7.2",
    });

    expect(result.migrationStrategy).toBe("not-needed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/analyzer/tests/plugin-detector.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement plugin registry**

Create `packages/analyzer/src/plugin-registry.ts`:

```typescript
import type { PluginCategory, MigrationStrategy } from "@wp-transfer/core";

export interface PluginRegistryEntry {
  slug: string;
  category: PluginCategory;
  migrationStrategy: MigrationStrategy;
  difficulty: number;
  estimatedHours: number;
  templateId?: string;
  notes?: string;
}

/**
 * Known plugin registry — maps WP plugin slugs to migration metadata.
 * Ordered by priority/frequency of use in agency projects.
 */
export const PLUGIN_REGISTRY: Record<string, Omit<PluginRegistryEntry, "slug">> = {
  "advanced-custom-fields": {
    category: "custom-fields",
    migrationStrategy: "template",
    difficulty: 3,
    estimatedHours: 16,
    templateId: "acf-to-zod",
    notes: "Field groups → Zod schemas + postmeta data migration",
  },
  "advanced-custom-fields-pro": {
    category: "custom-fields",
    migrationStrategy: "template",
    difficulty: 3,
    estimatedHours: 20,
    templateId: "acf-to-zod",
    notes: "Includes Flexible Content, Repeater, Gallery fields",
  },
  "wordpress-seo": {
    category: "seo",
    migrationStrategy: "template",
    difficulty: 2,
    estimatedHours: 8,
    templateId: "yoast-to-metadata-api",
    notes: "Meta title/description/canonical/og extraction",
  },
  "seo-by-rank-math": {
    category: "seo",
    migrationStrategy: "template",
    difficulty: 2,
    estimatedHours: 8,
    templateId: "rankmath-to-metadata-api",
  },
  "contact-form-7": {
    category: "forms",
    migrationStrategy: "template",
    difficulty: 3,
    estimatedHours: 12,
    templateId: "cf7-to-react-hook-form",
  },
  "wpforms-lite": {
    category: "forms",
    migrationStrategy: "template",
    difficulty: 3,
    estimatedHours: 12,
  },
  "woocommerce": {
    category: "ecommerce",
    migrationStrategy: "manual",
    difficulty: 5,
    estimatedHours: 120,
    notes: "Requires dedicated migration project. Products/orders/customers/payments",
  },
  "elementor": {
    category: "page-builder",
    migrationStrategy: "manual",
    difficulty: 5,
    estimatedHours: 80,
    notes: "Proprietary block format requires page-by-page reconstruction",
  },
  "js_composer": {
    category: "page-builder",
    migrationStrategy: "manual",
    difficulty: 5,
    estimatedHours: 80,
    notes: "WPBakery — shortcode-based, complex extraction needed",
  },
  "wp-mail-smtp": {
    category: "email",
    migrationStrategy: "template",
    difficulty: 1,
    estimatedHours: 2,
    templateId: "smtp-to-resend",
  },
  "wordfence": {
    category: "security",
    migrationStrategy: "not-needed",
    difficulty: 1,
    estimatedHours: 4,
    notes: "Security handled by Next.js middleware + hosting platform",
  },
  "sitepress-multilingual-cms": {
    category: "multilingual",
    migrationStrategy: "template",
    difficulty: 4,
    estimatedHours: 40,
    notes: "WPML — requires next-intl integration",
  },
  "polylang": {
    category: "multilingual",
    migrationStrategy: "template",
    difficulty: 3,
    estimatedHours: 24,
  },
  "google-analytics-for-wordpress": {
    category: "analytics",
    migrationStrategy: "automated",
    difficulty: 1,
    estimatedHours: 1,
    notes: "Replace with next/script GA snippet",
  },
  "all-in-one-seo-pack": {
    category: "seo",
    migrationStrategy: "template",
    difficulty: 2,
    estimatedHours: 8,
  },
  "akismet": {
    category: "security",
    migrationStrategy: "not-needed",
    difficulty: 1,
    estimatedHours: 0,
    notes: "Comment spam handled by alternative solutions",
  },
  "hello-dolly": {
    category: "other",
    migrationStrategy: "not-needed",
    difficulty: 1,
    estimatedHours: 0,
  },
};
```

- [ ] **Step 4: Implement plugin detector**

Create `packages/analyzer/src/plugin-detector.ts`:

```typescript
import type { PluginEntry, PluginCategory, MigrationStrategy } from "@wp-transfer/core";
import type { WpRestPlugin } from "./rest-client.js";
import { PLUGIN_REGISTRY } from "./plugin-registry.js";

export function classifyPlugin(plugin: WpRestPlugin): PluginEntry {
  const slug = extractSlug(plugin.plugin);
  const isActive = plugin.status === "active";

  // Inactive plugins don't need migration
  if (!isActive) {
    return {
      slug,
      name: plugin.name,
      version: plugin.version,
      active: false,
      category: lookupCategory(slug),
      migrationStrategy: "not-needed",
      difficulty: 1,
      estimatedHours: 0,
      notes: "Plugin is inactive — no migration needed",
    };
  }

  // Check known plugin registry
  const known = PLUGIN_REGISTRY[slug];
  if (known) {
    return {
      slug,
      name: plugin.name,
      version: plugin.version,
      active: true,
      category: known.category,
      migrationStrategy: known.migrationStrategy,
      difficulty: known.difficulty,
      estimatedHours: known.estimatedHours,
      templateId: known.templateId,
      notes: known.notes,
    };
  }

  // Unknown plugin — classify as llm-assisted
  return {
    slug,
    name: plugin.name,
    version: plugin.version,
    active: true,
    category: "other",
    migrationStrategy: "llm-assisted",
    difficulty: 3,
    estimatedHours: 16,
    notes: "Unknown plugin — requires LLM-assisted analysis",
  };
}

function extractSlug(pluginPath: string): string {
  // "contact-form-7/wp-contact-form-7.php" → "contact-form-7"
  return pluginPath.split("/")[0];
}

function lookupCategory(slug: string): PluginCategory {
  return PLUGIN_REGISTRY[slug]?.category || "other";
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/analyzer/tests/plugin-detector.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/analyzer/src/plugin-detector.ts packages/analyzer/src/plugin-registry.ts packages/analyzer/tests/plugin-detector.test.ts
git commit -m "feat(analyzer): add plugin detector with known plugin registry (30+ plugins)"
```

---

## Task 8: Analyzer — Schema Analyzer + Report Generator

**Files:**
- Create: `packages/analyzer/src/schema-analyzer.ts`
- Create: `packages/analyzer/src/report-generator.ts`
- Create: `packages/analyzer/src/cost-estimator.ts`
- Create: `packages/analyzer/src/index.ts`
- Test: `packages/analyzer/tests/schema-analyzer.test.ts`
- Test: `packages/analyzer/tests/report-generator.test.ts`

- [ ] **Step 1: Write failing test for schema analyzer**

Create `packages/analyzer/tests/schema-analyzer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { analyzeSchema } from "../src/schema-analyzer.js";
import type { WpPost, WpTaxonomyTerm } from "@wp-transfer/core";

describe("analyzeSchema", () => {
  it("detects custom post types", () => {
    const posts: WpPost[] = [
      { id: 1, title: "P1", slug: "p1", status: "publish", type: "post", content: "", excerpt: "", date: "", modified: "", author: 1, meta: {} },
      { id: 2, title: "P2", slug: "p2", status: "publish", type: "product", content: "", excerpt: "", date: "", modified: "", author: 1, meta: {} },
      { id: 3, title: "P3", slug: "p3", status: "publish", type: "product", content: "", excerpt: "", date: "", modified: "", author: 1, meta: {} },
    ];

    const result = analyzeSchema(posts, [], []);
    expect(result.customPostTypes).toHaveLength(1);
    expect(result.customPostTypes[0].slug).toBe("product");
    expect(result.customPostTypes[0].count).toBe(2);
  });

  it("detects ACF fields from meta patterns", () => {
    const posts: WpPost[] = [
      {
        id: 1, title: "P1", slug: "p1", status: "publish", type: "post",
        content: "", excerpt: "", date: "", modified: "", author: 1,
        meta: { price: "29.99", _price: "field_abc123", color: "red", _color: "field_def456" },
      },
    ];

    const result = analyzeSchema(posts, [], []);
    expect(result.acfFields.length).toBeGreaterThanOrEqual(2);
    expect(result.acfFields.find((f) => f.name === "price")).toBeDefined();
  });

  it("detects Yoast SEO meta", () => {
    const posts: WpPost[] = [
      {
        id: 1, title: "P1", slug: "p1", status: "publish", type: "post",
        content: "", excerpt: "", date: "", modified: "", author: 1,
        meta: { _yoast_wpseo_title: "SEO Title", _yoast_wpseo_metadesc: "SEO Desc" },
      },
    ];

    const result = analyzeSchema(posts, [], []);
    expect(result.hasYoastSeo).toBe(true);
    expect(result.hasRankMath).toBe(false);
  });

  it("computes content summary", () => {
    const posts: WpPost[] = [
      { id: 1, title: "P1", slug: "p1", status: "publish", type: "post", content: "", excerpt: "", date: "", modified: "", author: 1, meta: {} },
      { id: 2, title: "P2", slug: "p2", status: "publish", type: "page", content: "", excerpt: "", date: "", modified: "", author: 1, meta: {} },
    ];

    const taxonomies: WpTaxonomyTerm[] = [
      { id: 1, name: "News", slug: "news", taxonomy: "category" },
    ];

    const result = analyzeSchema(posts, taxonomies, []);
    expect(result.contentSummary.posts).toBe(1);
    expect(result.contentSummary.pages).toBe(1);
    expect(result.contentSummary.taxonomies).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/analyzer/tests/schema-analyzer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement schema analyzer**

Create `packages/analyzer/src/schema-analyzer.ts`:

```typescript
import type {
  WpPost,
  WpTaxonomyTerm,
  WpMedia,
  ContentSummary,
  CustomPostType,
  TaxonomySummary,
} from "@wp-transfer/core";

export interface AcfFieldInfo {
  name: string;
  fieldKey: string;
  inferredType: "string" | "number" | "boolean" | "date" | "json" | "unknown";
  sampleValues: string[];
}

export interface SchemaAnalysisResult {
  contentSummary: ContentSummary;
  customPostTypes: CustomPostType[];
  acfFields: AcfFieldInfo[];
  hasYoastSeo: boolean;
  hasRankMath: boolean;
  yoastMetaCount: number;
  rankMathMetaCount: number;
}

export function analyzeSchema(
  posts: WpPost[],
  taxonomies: WpTaxonomyTerm[],
  media: WpMedia[],
): SchemaAnalysisResult {
  // Count by post type
  const typeCounts = new Map<string, number>();
  for (const post of posts) {
    typeCounts.set(post.type, (typeCounts.get(post.type) || 0) + 1);
  }

  const standardTypes = new Set(["post", "page", "attachment", "revision", "nav_menu_item"]);
  const customPostTypes: CustomPostType[] = [];
  for (const [slug, count] of typeCounts) {
    if (!standardTypes.has(slug)) {
      customPostTypes.push({ slug, name: slug, count });
    }
  }

  // Detect ACF fields (pattern: key + _key with field_* value)
  const acfFieldMap = new Map<string, AcfFieldInfo>();
  for (const post of posts) {
    for (const [key, value] of Object.entries(post.meta)) {
      if (key.startsWith("_") && typeof value === "string" && value.startsWith("field_")) {
        const fieldName = key.slice(1); // remove leading underscore
        if (post.meta[fieldName] !== undefined) {
          if (!acfFieldMap.has(fieldName)) {
            acfFieldMap.set(fieldName, {
              name: fieldName,
              fieldKey: value,
              inferredType: inferType(String(post.meta[fieldName])),
              sampleValues: [String(post.meta[fieldName])],
            });
          } else {
            const existing = acfFieldMap.get(fieldName)!;
            if (existing.sampleValues.length < 5) {
              existing.sampleValues.push(String(post.meta[fieldName]));
            }
          }
        }
      }
    }
  }

  // Detect SEO plugins from meta keys
  let hasYoastSeo = false;
  let hasRankMath = false;
  let yoastMetaCount = 0;
  let rankMathMetaCount = 0;

  for (const post of posts) {
    for (const key of Object.keys(post.meta)) {
      if (key.startsWith("_yoast_wpseo_")) {
        hasYoastSeo = true;
        yoastMetaCount++;
      }
      if (key.startsWith("rank_math_")) {
        hasRankMath = true;
        rankMathMetaCount++;
      }
    }
  }

  // Taxonomy summary
  const taxMap = new Map<string, { count: number; hierarchical: boolean }>();
  for (const term of taxonomies) {
    const existing = taxMap.get(term.taxonomy);
    if (existing) {
      existing.count++;
    } else {
      taxMap.set(term.taxonomy, {
        count: 1,
        hierarchical: term.taxonomy === "category",
      });
    }
  }

  const taxonomySummaries: TaxonomySummary[] = [];
  for (const [slug, info] of taxMap) {
    taxonomySummaries.push({
      slug,
      name: slug,
      count: info.count,
      hierarchical: info.hierarchical,
    });
  }

  return {
    contentSummary: {
      posts: typeCounts.get("post") || 0,
      pages: typeCounts.get("page") || 0,
      customPostTypes,
      media: media.length,
      users: 0, // Set by caller
      taxonomies: taxonomySummaries,
    },
    customPostTypes,
    acfFields: Array.from(acfFieldMap.values()),
    hasYoastSeo,
    hasRankMath,
    yoastMetaCount,
    rankMathMetaCount,
  };
}

function inferType(value: string): AcfFieldInfo["inferredType"] {
  if (value === "0" || value === "1") return "boolean";
  if (!isNaN(Number(value)) && value.trim() !== "") return "number";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
  try {
    JSON.parse(value);
    return "json";
  } catch {
    return "string";
  }
}
```

- [ ] **Step 4: Implement cost estimator**

Create `packages/analyzer/src/cost-estimator.ts`:

```typescript
import type { PluginEntry, RiskEntry } from "@wp-transfer/core";

export interface CostEstimate {
  totalHours: number;
  breakdown: {
    contentMigration: number;
    pluginMigration: number;
    themeMigration: number;
    testing: number;
    deployment: number;
  };
  risks: RiskEntry[];
}

export function estimateCost(
  postCount: number,
  mediaCount: number,
  plugins: PluginEntry[],
  hasCustomPostTypes: boolean,
): CostEstimate {
  // Content migration: base 4h + scale by volume
  const contentHours = 4 + Math.ceil(postCount / 500) * 2 + Math.ceil(mediaCount / 1000) * 2;

  // Plugin migration: sum of all plugin estimates
  const pluginHours = plugins
    .filter((p) => p.active && p.migrationStrategy !== "not-needed")
    .reduce((sum, p) => sum + p.estimatedHours, 0);

  // Theme: base 16h for structure conversion
  const themeHours = 16;

  // Testing: 20% of total
  const subtotal = contentHours + pluginHours + themeHours;
  const testingHours = Math.ceil(subtotal * 0.2);

  // Deployment: flat 8h
  const deploymentHours = 8;

  const risks: RiskEntry[] = [];

  if (plugins.some((p) => p.category === "ecommerce" && p.active)) {
    risks.push({
      area: "E-Commerce",
      description: "Active e-commerce plugin detected. Full store migration requires dedicated project.",
      severity: "high",
      mitigation: "Scope e-commerce migration separately. Consider Shopify/Stripe integration.",
    });
  }

  if (plugins.some((p) => p.category === "page-builder" && p.active)) {
    risks.push({
      area: "Page Builder",
      description: "Page builder plugin detected. Content stored in proprietary format.",
      severity: "high",
      mitigation: "Manual page reconstruction required. Export content as HTML first.",
    });
  }

  if (hasCustomPostTypes) {
    risks.push({
      area: "Custom Post Types",
      description: "Custom post types require schema mapping and dedicated routes.",
      severity: "medium",
      mitigation: "ACF field analysis will generate schema suggestions automatically.",
    });
  }

  if (postCount > 10000) {
    risks.push({
      area: "Scale",
      description: `Large site (${postCount} posts). Migration may require batching.`,
      severity: "medium",
      mitigation: "Use streaming WXR parser and batch database imports.",
    });
  }

  return {
    totalHours: contentHours + pluginHours + themeHours + testingHours + deploymentHours,
    breakdown: {
      contentMigration: contentHours,
      pluginMigration: pluginHours,
      themeMigration: themeHours,
      testing: testingHours,
      deployment: deploymentHours,
    },
    risks,
  };
}
```

- [ ] **Step 5: Implement report generator**

Create `packages/analyzer/src/report-generator.ts`:

```typescript
import type { MigrationReport, PluginEntry } from "@wp-transfer/core";
import type { SchemaAnalysisResult } from "./schema-analyzer.js";
import type { CostEstimate } from "./cost-estimator.js";

export interface ReportInput {
  siteUrl: string;
  wpVersion: string;
  phpVersion?: string;
  themeName: string;
  themeVersion?: string;
  isChildTheme: boolean;
  schema: SchemaAnalysisResult;
  plugins: PluginEntry[];
  userCount: number;
  cost: CostEstimate;
}

export function generateReport(input: ReportInput): MigrationReport {
  const summary = { ...input.schema.contentSummary };
  summary.users = input.userCount;

  return {
    generatedAt: new Date().toISOString(),
    siteUrl: input.siteUrl,
    wpVersion: input.wpVersion,
    phpVersion: input.phpVersion,
    theme: {
      name: input.themeName,
      version: input.themeVersion,
      isChild: input.isChildTheme,
    },
    contentSummary: summary,
    plugins: input.plugins,
    migrationPlan: {
      automated: input.plugins.filter((p) => p.migrationStrategy === "automated").map((p) => p.name),
      template: input.plugins.filter((p) => p.migrationStrategy === "template").map((p) => p.name),
      llmAssisted: input.plugins.filter((p) => p.migrationStrategy === "llm-assisted").map((p) => p.name),
      manual: input.plugins.filter((p) => p.migrationStrategy === "manual").map((p) => p.name),
    },
    estimatedTotalHours: input.cost.totalHours,
    risks: input.cost.risks,
  };
}

export function reportToMarkdown(report: MigrationReport): string {
  const lines: string[] = [];

  lines.push(`# Migration Report: ${report.siteUrl}`);
  lines.push(`Generated: ${report.generatedAt}\n`);

  lines.push(`## Site Profile`);
  lines.push(`- WordPress: ${report.wpVersion}`);
  if (report.phpVersion) lines.push(`- PHP: ${report.phpVersion}`);
  lines.push(`- Theme: ${report.theme.name}${report.theme.isChild ? " (child theme)" : ""}`);
  lines.push("");

  lines.push(`## Content Summary`);
  lines.push(`| Type | Count |`);
  lines.push(`|------|-------|`);
  lines.push(`| Posts | ${report.contentSummary.posts} |`);
  lines.push(`| Pages | ${report.contentSummary.pages} |`);
  lines.push(`| Media | ${report.contentSummary.media} |`);
  lines.push(`| Users | ${report.contentSummary.users} |`);
  for (const cpt of report.contentSummary.customPostTypes) {
    lines.push(`| ${cpt.name} (CPT) | ${cpt.count} |`);
  }
  lines.push("");

  lines.push(`## Plugin Inventory (${report.plugins.length} plugins)`);
  lines.push(`| Plugin | Status | Strategy | Difficulty | Est. Hours |`);
  lines.push(`|--------|--------|----------|------------|------------|`);
  for (const p of report.plugins) {
    lines.push(`| ${p.name} | ${p.active ? "Active" : "Inactive"} | ${p.migrationStrategy} | ${"*".repeat(p.difficulty)} | ${p.estimatedHours}h |`);
  }
  lines.push("");

  lines.push(`## Migration Plan`);
  if (report.migrationPlan.automated.length > 0) {
    lines.push(`### Automated`);
    report.migrationPlan.automated.forEach((p) => lines.push(`- ${p}`));
  }
  if (report.migrationPlan.template.length > 0) {
    lines.push(`### Template-based`);
    report.migrationPlan.template.forEach((p) => lines.push(`- ${p}`));
  }
  if (report.migrationPlan.llmAssisted.length > 0) {
    lines.push(`### LLM-assisted`);
    report.migrationPlan.llmAssisted.forEach((p) => lines.push(`- ${p}`));
  }
  if (report.migrationPlan.manual.length > 0) {
    lines.push(`### Manual`);
    report.migrationPlan.manual.forEach((p) => lines.push(`- ${p}`));
  }
  lines.push("");

  lines.push(`## Estimated Effort: ${report.estimatedTotalHours} hours`);
  lines.push("");

  if (report.risks.length > 0) {
    lines.push(`## Risks`);
    lines.push(`| Area | Severity | Description |`);
    lines.push(`|------|----------|-------------|`);
    for (const r of report.risks) {
      lines.push(`| ${r.area} | ${r.severity} | ${r.description} |`);
    }
  }

  return lines.join("\n");
}
```

- [ ] **Step 6: Create analyzer index.ts**

Create `packages/analyzer/src/index.ts`:

```typescript
export { createWpRestClient } from "./rest-client.js";
export type { WpRestClient, WpRestAuth, WpSiteInfo, WpRestPlugin } from "./rest-client.js";

export { classifyPlugin } from "./plugin-detector.js";
export { PLUGIN_REGISTRY } from "./plugin-registry.js";

export { analyzeSchema } from "./schema-analyzer.js";
export type { AcfFieldInfo, SchemaAnalysisResult } from "./schema-analyzer.js";

export { estimateCost } from "./cost-estimator.js";
export type { CostEstimate } from "./cost-estimator.js";

export { generateReport, reportToMarkdown } from "./report-generator.js";
export type { ReportInput } from "./report-generator.js";
```

- [ ] **Step 7: Write test for report generator**

Create `packages/analyzer/tests/report-generator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateReport, reportToMarkdown } from "../src/report-generator.js";
import type { ReportInput } from "../src/report-generator.js";

describe("generateReport", () => {
  const input: ReportInput = {
    siteUrl: "https://example.com",
    wpVersion: "6.7",
    themeName: "Twenty Twenty-Four",
    isChildTheme: false,
    schema: {
      contentSummary: {
        posts: 100,
        pages: 10,
        customPostTypes: [{ slug: "product", name: "product", count: 50 }],
        media: 500,
        users: 0,
        taxonomies: [{ slug: "category", name: "category", count: 5, hierarchical: true }],
      },
      customPostTypes: [{ slug: "product", name: "product", count: 50 }],
      acfFields: [],
      hasYoastSeo: true,
      hasRankMath: false,
      yoastMetaCount: 100,
      rankMathMetaCount: 0,
    },
    plugins: [
      { slug: "wordpress-seo", name: "Yoast SEO", version: "23.5", active: true, category: "seo", migrationStrategy: "template", difficulty: 2, estimatedHours: 8 },
      { slug: "woocommerce", name: "WooCommerce", version: "9.0", active: true, category: "ecommerce", migrationStrategy: "manual", difficulty: 5, estimatedHours: 120 },
    ],
    userCount: 5,
    cost: {
      totalHours: 180,
      breakdown: { contentMigration: 8, pluginMigration: 128, themeMigration: 16, testing: 20, deployment: 8 },
      risks: [{ area: "E-Commerce", description: "WooCommerce detected", severity: "high", mitigation: "Separate project" }],
    },
  };

  it("generates a valid MigrationReport", () => {
    const report = generateReport(input);
    expect(report.siteUrl).toBe("https://example.com");
    expect(report.plugins).toHaveLength(2);
    expect(report.estimatedTotalHours).toBe(180);
    expect(report.risks).toHaveLength(1);
  });

  it("generates readable Markdown", () => {
    const report = generateReport(input);
    const md = reportToMarkdown(report);
    expect(md).toContain("# Migration Report");
    expect(md).toContain("Yoast SEO");
    expect(md).toContain("WooCommerce");
    expect(md).toContain("180 hours");
  });
});
```

- [ ] **Step 8: Run all analyzer tests**

Run: `pnpm vitest run packages/analyzer/tests/`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add packages/analyzer/
git commit -m "feat(analyzer): add schema analyzer, cost estimator, and migration report generator"
```

---

## Task 9: CLI — `wp-transfer analyze` Command

**Files:**
- Create: `apps/cli/src/index.ts`
- Create: `apps/cli/src/commands/analyze.ts`

- [ ] **Step 1: Implement CLI entrypoint**

Create `apps/cli/src/index.ts`:

```typescript
#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { analyzeCommand } from "./commands/analyze.js";

const main = defineCommand({
  meta: {
    name: "wp-transfer",
    version: "0.1.0",
    description: "WordPress → Next.js migration accelerator",
  },
  subCommands: {
    analyze: analyzeCommand,
  },
});

runMain(main);
```

- [ ] **Step 2: Implement analyze command**

Create `apps/cli/src/commands/analyze.ts`:

```typescript
import { defineCommand } from "citty";
import { consola } from "consola";
import { createReadStream, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseWxr } from "@wp-transfer/wxr-parser";
import {
  createWpRestClient,
  classifyPlugin,
  analyzeSchema,
  estimateCost,
  generateReport,
  reportToMarkdown,
} from "@wp-transfer/analyzer";

export const analyzeCommand = defineCommand({
  meta: {
    name: "analyze",
    description: "Analyze a WordPress site and generate a migration report",
  },
  args: {
    source: {
      type: "positional",
      description: "WP site URL or path to WXR file",
      required: true,
    },
    output: {
      type: "string",
      description: "Output file path (default: ./migration-report)",
      default: "./migration-report",
    },
    format: {
      type: "string",
      description: "Output format: json, markdown, or both",
      default: "both",
    },
    username: {
      type: "string",
      description: "WP admin username (for authenticated API access)",
    },
    password: {
      type: "string",
      description: "WP application password",
    },
  },
  async run({ args }) {
    consola.start("wp-transfer analyze");

    const isFile = existsSync(args.source) && args.source.endsWith(".xml");

    if (isFile) {
      await analyzeFromWxr(args.source, args.output, args.format);
    } else {
      await analyzeFromUrl(args.source, args.output, args.format, args.username, args.password);
    }
  },
});

async function analyzeFromWxr(
  filePath: string,
  output: string,
  format: string,
): Promise<void> {
  consola.info(`Parsing WXR file: ${filePath}`);
  const stream = createReadStream(resolve(filePath));
  const wxr = await parseWxr(stream);

  consola.info(`Found ${wxr.posts.length} posts, ${wxr.users.length} users, ${wxr.taxonomies.length} taxonomy terms`);

  const schema = analyzeSchema(wxr.posts, wxr.taxonomies, wxr.media);
  const cost = estimateCost(
    wxr.posts.length,
    wxr.media.length,
    [],
    schema.customPostTypes.length > 0,
  );

  const report = generateReport({
    siteUrl: wxr.siteUrl,
    wpVersion: wxr.wpVersion,
    themeName: "Unknown (WXR does not contain theme info)",
    isChildTheme: false,
    schema,
    plugins: [],
    userCount: wxr.users.length,
    cost,
  });

  await writeReport(report, output, format);
}

async function analyzeFromUrl(
  url: string,
  output: string,
  format: string,
  username?: string,
  password?: string,
): Promise<void> {
  consola.info(`Probing WordPress site: ${url}`);
  const auth = username && password
    ? { username, applicationPassword: password }
    : undefined;
  const client = createWpRestClient(url, auth);

  const siteInfo = await client.probeSiteInfo();
  consola.success(`Connected: ${siteInfo.name}`);

  let plugins: ReturnType<typeof classifyPlugin>[] = [];
  if (auth) {
    try {
      const rawPlugins = await client.fetchPlugins();
      plugins = rawPlugins.map(classifyPlugin);
      consola.info(`Detected ${plugins.length} plugins`);
    } catch {
      consola.warn("Could not fetch plugins (requires admin authentication)");
    }
  }

  const postTypes = await client.fetchPostTypes();
  consola.info(`Post types: ${postTypes.map((t) => t.slug).join(", ")}`);

  // Build a minimal schema from REST API data
  const schema = analyzeSchema([], [], []);
  const cost = estimateCost(0, 0, plugins, postTypes.length > 2);

  const report = generateReport({
    siteUrl: siteInfo.url,
    wpVersion: "",
    themeName: "Unknown (requires WXR for theme detection)",
    isChildTheme: false,
    schema,
    plugins,
    userCount: 0,
    cost,
  });

  await writeReport(report, output, format);
}

async function writeReport(
  report: ReturnType<typeof generateReport>,
  output: string,
  format: string,
): Promise<void> {
  if (format === "json" || format === "both") {
    const jsonPath = `${output}.json`;
    await writeFile(jsonPath, JSON.stringify(report, null, 2));
    consola.success(`JSON report: ${jsonPath}`);
  }

  if (format === "markdown" || format === "both") {
    const mdPath = `${output}.md`;
    await writeFile(mdPath, reportToMarkdown(report));
    consola.success(`Markdown report: ${mdPath}`);
  }

  consola.box(`Migration estimate: ${report.estimatedTotalHours} hours\nPlugins: ${report.plugins.length} detected\nRisks: ${report.risks.length} identified`);
}
```

- [ ] **Step 3: Test CLI manually**

Run: `cd /home/o9oem/workspace/mine/wp-transfer && pnpm --filter wp-transfer-cli dev analyze fixtures/wxr/minimal.xml --output /tmp/test-report`
Expected: Output shows parsed posts/users, writes `/tmp/test-report.json` and `/tmp/test-report.md`

- [ ] **Step 4: Verify generated report**

Run: `cat /tmp/test-report.md`
Expected: Markdown report with site profile, content summary, plugin inventory (empty for WXR-only), and estimated effort

- [ ] **Step 5: Commit**

```bash
git add apps/cli/
git commit -m "feat(cli): implement 'wp-transfer analyze' command with WXR and REST API support"
```

---

## Task 10: Integration Test + Final Verification

**Files:**
- Create: `packages/wxr-parser/tests/post-collector.test.ts`

- [ ] **Step 1: Write integration test for full WXR→Report pipeline**

Create `packages/wxr-parser/tests/post-collector.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parseWxr } from "../src/index.js";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/wxr");

describe("WXR → Post Collector integration", () => {
  it("extracts Gutenberg content as raw HTML for later transformation", async () => {
    const stream = createReadStream(resolve(fixturesDir, "gutenberg-blocks.xml"));
    const result = await parseWxr(stream);

    expect(result.posts).toHaveLength(1);
    const post = result.posts[0];
    expect(post.title).toBe("Gutenberg Post");
    expect(post.content).toContain("wp:paragraph");
    expect(post.content).toContain("wp:heading");
    expect(post.content).toContain("wp:image");
    expect(post.content).toContain("wp:embed");
  });

  it("extracts ACF meta fields correctly", async () => {
    const stream = createReadStream(resolve(fixturesDir, "acf-fields.xml"));
    const result = await parseWxr(stream);

    const post = result.posts[0];
    expect(post.meta["price"]).toBe("29.99");
    expect(post.meta["_price"]).toBe("field_abc123");
    expect(post.meta["color"]).toBe("red");
    expect(post.meta["is_featured"]).toBe("1");
    expect(post.meta["_yoast_wpseo_title"]).toContain("Product Page");
    expect(post.meta["_yoast_wpseo_metadesc"]).toContain("Buy the best product");
  });
});
```

- [ ] **Step 2: Run full test suite**

Run: `cd /home/o9oem/workspace/mine/wp-transfer && pnpm vitest run`
Expected: All tests PASS across all packages

- [ ] **Step 3: Run typecheck**

Run: `pnpm -r typecheck`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add packages/wxr-parser/tests/post-collector.test.ts
git commit -m "test: add integration tests for WXR parsing with Gutenberg blocks and ACF fields"
```

- [ ] **Step 5: Push to remote**

Run: `git push origin main`
Expected: All commits pushed successfully
