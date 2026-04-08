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
- **Blog scaffold from WXR** -- Post pages, archive, category, 404, Portable Text renderer
- **Playwright verify scaffold** -- Smoke tests for generated pages
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

npx vitest run          # 329 tests
pnpm -r typecheck       # typecheck all packages
```

## License

MIT

## Status

**v0.1.0-alpha** -- Phase 1 (core analysis and scaffold generation) is complete. Phases B, C, and D are planned. See [Issues](https://github.com/howlrs/wp-transfer/issues) and `HANDOFF.md` for details.
