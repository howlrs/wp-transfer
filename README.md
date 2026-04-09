# wp-transfer

> WordPress to Next.js migration accelerator CLI

A CLI tool that gives agencies and development teams a head start on WordPress-to-Next.js migrations. It analyzes WP sites, generates scaffolding, and produces migration reports -- but does not perform fully automatic migration. You still write the final application.

## Features

- **WXR streaming parser** -- SAX-based, XXE-safe, supports WP 4.1 through 6.x
- **Gutenberg block conversion** -- Block AST to Portable Text to React components
- **Plugin detection** -- Registry of 17+ known plugins with migration guidance
- **ACF field detection** -- Typed Zod schema generation from Advanced Custom Fields
- **Yoast SEO extraction** -- Metadata mapped to Next.js Metadata API
- **PHP to Prisma schema** -- Relation auto-detection from PHP source and DB schema
- **Next.js API route stubs** -- Zod validation, transactions, file upload handling
- **Admin, auth, Docker scaffolds** -- NextAuth v5 + RBAC, admin pages, Docker Compose
- **WooCommerce migration** -- Product catalog extraction (simple/variable/grouped/external), Prisma schema, Next.js EC scaffold with cart stub
- **WooCommerce orders/customers** -- REST API client for order and customer data migration
- **WordPress Multisite** -- Multi-site WXR directory input, network detection (subdomain/subdirectory), user deduplication, media path normalization, cross-site URL rewriting, multi-tenant Next.js scaffold
- **i18n / WPML / Polylang** -- Language detection from WXR metadata, Next.js App Router `[locale]` routing scaffold
- **ACF Pro support** -- Field definition extraction from WXR, Flexible Content, Group, Clone, Nested Repeater Zod schema generation
- **Meta Box / Pods detection** -- Custom field detection with type inference, Pods table storage warning
- **Page builder migration guide** -- Elementor, Divi, WPBakery detection with component mapping guide
- **AI-assisted generation** -- `--ai-assist` flag uses Claude API for high-quality API route generation from PHP
- **Interactive mode** -- `--interactive` flag for guided analysis setup
- **Template customization** -- `--templates` flag for scaffold template overrides
- **Blog scaffold from WXR** -- Post pages, archive, category, 404, Portable Text renderer
- **Elementor conversion** -- Elementor JSON to React JSX (8 widget types) + migration guidance for complex widgets
- **Playwright verify scaffold** -- Smoke, API, Auth, Admin test generation with HTML + JUnit reporters
- **Migration dashboard** -- Standalone HTML report with metrics, CRUD coverage, security issues
- **Pre-flight checks** -- Node.js version, source/output validation, Docker availability
- **Migration config** -- JSON config file support with `${ENV_VAR}` expansion
- **ACF Options extractor** -- REST API extraction of site-level ACF Options Page data
- **Large-site streaming** -- BatchCollector for memory-safe processing of 100K+ posts
- **One-command verification** -- `run` command: npm ci → Docker → migrate → seed → Playwright test
- **Secret scanner** -- Detects AWS keys, GitHub tokens, Stripe keys, WP salts
- **Security hardened** -- SSRF defense, credential protection, input sanitization, path traversal protection

## Quick Start

```bash
# Install
pnpm add -g wp-transfer   # or: npx wp-transfer

# Analyze a WXR export file
wp-transfer analyze ./export.xml

# Analyze a live site via REST API
wp-transfer analyze https://example.com --username admin --password app-pass

# Analyze PHP source and generate a full Next.js project
wp-transfer analyze-php ./wp-content/themes/mytheme --schema ./database.md --output ./output

# AI-assisted generation (higher quality API routes using Claude)
export ANTHROPIC_API_KEY=sk-ant-...
wp-transfer analyze-php ./wp-content/themes/mytheme --schema ./database.md --output ./output --ai-assist

# Analyze a WordPress Multisite network (directory of WXR files)
wp-transfer analyze ./wxr-exports/ --multisite --multisite-mode subpath
```

## Commands

### `analyze <url|file.xml>`

Analyze a WordPress site from a WXR export file or live REST API endpoint. Produces a migration report (JSON and Markdown) covering:

- Content inventory (posts, pages, custom post types, taxonomies, media)
- Gutenberg block usage and conversion mapping
- Plugin inventory with known migration paths
- ACF field definitions with generated Zod schemas
- Yoast SEO metadata summary
- Cost and effort estimate
- Risk assessment

Options:

| Flag | Description |
|------|-------------|
| `--username` | WP REST API username (basic auth / application password) |
| `--password` | WP REST API password |
| `--output` | Output directory (default: `./wp-transfer-output`) |
| `--format` | Output format: `json`, `markdown`, or `both` (default: `both`) |
| `--multisite` | Enable multisite analysis (source must be a directory of WXR files) |
| `--multisite-mode` | Scaffold mode: `subpath` or `subdomain` (auto-detected if omitted) |

### `analyze-php <dir>`

Analyze PHP source code directly and generate a complete Next.js project scaffold:

- Prisma schema derived from PHP models and optional DB schema doc
- API route stubs with Zod request validation
- Admin page scaffold
- Auth scaffold (NextAuth v5 with role-based access)
- Docker Compose configuration
- Playwright smoke tests

Options:

| Flag | Description |
|------|-------------|
| `--schema` | Path to database schema doc (Markdown) for enriched Prisma output |
| `--output` | Output directory (default: `./wp-transfer-output`) |
| `--ai-assist` | Use Claude API for high-quality route generation |
| `--ai-model` | Claude model to use (default: `claude-sonnet-4`) |
| `--interactive` | Guided setup wizard |
| `--templates` | Custom template directory for scaffold overrides |

### `run <project-dir>`

Run a generated Next.js project end-to-end: install dependencies, start Docker, run migrations, seed data, and execute Playwright tests.

```bash
# Full pipeline
wp-transfer run output/jra-tokyo

# Without Docker (use existing database)
wp-transfer run output/jra-tokyo --no-docker

# Open HTML report after tests
wp-transfer run output/jra-tokyo --open
```

Options:

| Flag | Description |
|------|-------------|
| `--no-docker` | Skip Docker Compose (use existing database) |
| `--no-test` | Skip Playwright tests |
| `--open` | Open test report in browser after completion |

## Architecture

```
wp-transfer/
├── apps/
│   └── cli/              # CLI entry point (citty + consola)
├── packages/
│   ├── core/             # Shared types, schemas, utilities
│   ├── wxr-parser/       # SAX streaming WXR parser
│   └── analyzer/         # Analysis engines and scaffold generators
├── package.json          # Workspace root
└── pnpm-workspace.yaml
```

**Tech stack:** TypeScript 6.0.2, Node.js 20+, pnpm 10.33.0, citty, consola, sax, ofetch, zod 4.3.6, @portabletext/types, vitest 4.1.3

## Security

- **SSRF defense** -- URL validation and protocol allowlisting for REST API calls
- **Credential protection** -- Secrets are never written to output files; scanner flags leaked credentials in source
- **Input sanitization** -- All user-supplied strings (field names, URLs, file paths) are sanitized before use in codegen
- **Path traversal protection** -- Output file writer rejects paths that escape the output directory
- **XXE prevention** -- SAX parser configured to reject external entity expansion

## Development

```bash
git clone https://github.com/howlrs/wp-transfer.git
cd wp-transfer
pnpm install

npx vitest run          # 901 tests
pnpm -r typecheck       # typecheck all packages
```

## License

MIT

## Status

**v0.4.0-alpha** -- All phases complete plus 6 PDCA improvement cycles. 901 tests (66 files), 38 issues closed. New in v0.4: Elementor conversion, one-command `run`, migration dashboard, pre-flight checks, enhanced Playwright test generation (API/Auth/Admin), soft-delete detection, loop/batch processing, schema-driven GET endpoints, full CLI integration (preflight + config + dashboard + verify specs). JRA Tokyo full-pipeline integration test (69 cases) proves end-to-end completeness. See `HANDOFF.md` for details.
