# wp-transfer

> WordPress to Next.js migration accelerator CLI

A CLI tool that gives agencies and development teams a head start on WordPress-to-Next.js migrations. It analyzes WP sites, generates scaffolding, and produces migration reports -- but does not perform fully automatic migration. You still write the final application.

## Features

- **WXR streaming parser** -- SAX-based and XXE-safe, with WXR 1.2 fixtures
- **Gutenberg block conversion** -- Block AST to Portable Text to React components
- **Plugin detection** -- Registry of 17+ known plugins with migration guidance
- **ACF field detection** -- Typed Zod schema generation from Advanced Custom Fields
- **Yoast SEO extraction** -- Metadata mapped to Next.js Metadata API
- **PHP to Prisma schema** -- Relation auto-detection from PHP source and DB schema
- **Next.js API route stubs** -- Zod validation, transactions, file upload handling
- **Admin, auth, Docker scaffolds** -- NextAuth v5 + RBAC, admin pages, Docker Compose
- **WooCommerce migration** -- Product catalog extraction (simple/variable/grouped/external), Prisma schema, Next.js EC scaffold with cart stub
- **WooCommerce orders/customers** -- Optional REST inventory and Prisma order schema; data import remains project work
- **WordPress Multisite** -- Multi-site WXR directory analysis and a multi-tenant scaffold; tenant resolution and UI require completion
- **i18n / WPML / Polylang** -- Language detection from WXR metadata, Next.js App Router `[locale]` routing scaffold
- **ACF Pro support** -- Field definition extraction from WXR, Flexible Content, Group, Clone, Nested Repeater Zod schema generation
- **Meta Box / Pods detection** -- Custom field detection with type inference, Pods table storage warning
- **Page builder migration guide** -- Elementor, Divi, WPBakery detection with component mapping guide
- **AI-assisted generation** -- `--ai-assist` uses the Claude CLI or Anthropic API for API route generation from PHP
- **Interactive mode** -- `--interactive` flag for guided analysis setup
- **Template customization** -- `--templates` flag for scaffold template overrides
- **Blog scaffold generator** -- Post pages, archive, category, 404, Portable Text renderer (library API; CLI integration pending)
- **Elementor conversion** -- Elementor JSON to React JSX (8 widget types) + migration guidance for complex widgets
- **Playwright verify scaffold** -- Smoke, API, Auth, Admin test generation with HTML + JUnit reporters
- **Migration dashboard** -- Standalone HTML report with metrics, CRUD coverage, security issues
- **Pre-flight checks** -- Node.js version, source/output validation, Docker availability
- **Migration config** -- JSON config file support with `${ENV_VAR}` expansion
- **ACF Options extractor** -- REST API extraction of site-level ACF Options Page data
- **Large-site streaming** -- BatchCollector-based processing that avoids retaining every post in memory
- **One-command verification** -- `run` command: install → isolated Docker database → Prisma → Playwright
- **Secret scanner** -- Detects AWS keys, GitHub tokens, Stripe keys, WP salts
- **Security hardened** -- SSRF defense, credential protection, input sanitization, path traversal protection

## Requirements

- Node.js 20 or newer
- pnpm 10.33.0 when building from source
- Docker with Compose for the isolated `run` workflow

## Release status

**v0.4.1 is a usable pre-1.0 stabilization release.** Its supported workflows
are suitable for a reviewed, isolated migration project; it is not an automatic
production-migration system.
Pre-1.0 releases may introduce breaking changes. See the [v0.4.1 release
notes](CHANGELOG.md#041---2026-08-31) and [known limitations](#known-limitations)
before adopting it.

The package is not yet published to the npm registry. Registry publication is
pending npm authentication and trusted-publisher setup; do not assume that
`npx wp-transfer` resolves to this project until that publication is announced.

## Quick Start

```bash
# Install the v0.4.1 GitHub Release tarball
npm install --global https://github.com/howlrs/wp-transfer/releases/download/v0.4.1/wp-transfer-0.4.1.tgz

# Or build v0.4.1 from source
git clone --branch v0.4.1 https://github.com/howlrs/wp-transfer.git
cd wp-transfer
pnpm install --frozen-lockfile
pnpm build

# Analyze a WXR export with the built CLI
node apps/cli/dist/index.js analyze ./export.xml

# The default outputs are ./migration-report.json and ./migration-report.md
```

The release tarball is the supported installation artifact for v0.4.1. To
exercise the exact consumer artifact from a source checkout, create and install
a local tarball:

```bash
mkdir -p release
pnpm --dir apps/cli pack --pack-destination ../../release
npm install --global ./release/wp-transfer-0.4.1.tgz
wp-transfer analyze ./export.xml
```

The repository also runs this pack/install/analyze flow in an isolated temporary project with `pnpm test:package`.

Additional workflows:

```bash
# Discover site, plugin, post-type, and content-count metadata via the REST API
wp-transfer analyze https://example.com --username admin --password app-pass

# Prefer a WordPress application password, never the account password.
# CLI arguments may be visible in process listings and shell history.

# Analyze PHP source and generate a full Next.js project
wp-transfer analyze-php ./wp-content/themes/mytheme --schema ./database.md --output ./output

# AI-assisted generation (sends migration context to Claude after secret scanning)
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

WXR input provides content-level analysis. Live REST input provides site, plugin, post-type, and REST-exposed content counts; it does not download post bodies or custom-field values.

Options:

| Flag | Description |
|------|-------------|
| `--username` | WP REST API username (basic auth / application password) |
| `--password` | WP REST API password |
| `--output` | Output path prefix without extension (default: `./migration-report`) |
| `--format` | Output format: `json`, `markdown`, or `both` (default: `both`) |
| `--multisite` | Enable multisite analysis (source must be a directory of WXR files) |
| `--multisite-mode` | Scaffold mode: `subpath` or `subdomain` (auto-detected if omitted) |

### `analyze-php [dir]`

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
| `--output` | Output directory (default: `./output/php-analysis`) |
| `--ai-assist` | Use the Claude CLI or Anthropic API for route generation |
| `--ai-model` | Claude model to use (default: `claude-sonnet-4-20250514`) |
| `--templates` | Custom template directory for scaffold overrides |
| `--config` | JSON config for PHP source, schema, output, templates, and AI settings |
| `--skip-preflight` | Skip environment and path pre-flight checks |

When `--schema` is omitted, the CLI infers a conservative local Prisma schema from detected PHP database operations. All inferred column types and constraints must be reviewed before production use.

The positional directory may be omitted when `config.source.path` is present.
See the package [CLI reference](apps/cli/README.md) for the config shape, path
resolution, environment expansion, and CLI precedence rules.

`--ai-assist` uses an installed Claude CLI first and the Anthropic API as a
fallback. It sends the PHP source after best-effort credential masking, static
analysis results, and the relevant Prisma schema to that provider. Do not use
it with confidential migration inputs unless that external processing is
approved, and review the masked input and generated route before production.

### `run <project-dir>`

Run a generated Next.js project end-to-end: install dependencies, start Docker, run migrations, seed data, and execute Playwright tests.

```bash
# Full pipeline against the generated Docker database
wp-transfer run ./output/my-site

# Allow a destructive Prisma schema change only when explicitly intended
wp-transfer run ./output/my-site --accept-data-loss

# Use an existing database without schema push or seed
# Generated tests may still write application data; never point this at production.
wp-transfer run ./output/my-site --no-docker

# Open the HTML report after tests
wp-transfer run ./output/my-site --open
```

The Docker workflow stores generated local verification credentials in
`.wp-transfer/verification.env` with owner-only permissions. The directory is
gitignored and lets repeated runs reuse the same named database volume safely.
If supplied credentials differ from that state, the command stops and prints
the exact project-specific `docker compose down -v` command needed for an
intentional reset; after running it, remove `.wp-transfer/verification.env` and
run again. Database usernames and passwords supplied to this workflow must use
URL-safe letters, numbers, underscores, or hyphens.

Dependency and browser setup receive only a minimal execution, cache, proxy,
and certificate environment to reduce accidental inheritance of developer
credentials. This is not a sandbox or an on-disk credential boundary: npm
lifecycle hooks can execute arbitrary code from the local project. Run `run`
only for generated projects and dependencies you trust.

Options:

| Flag | Description |
|------|-------------|
| `--no-docker` | Skip Docker, schema push, and seed; tests may still write application data |
| `--accept-data-loss` | Allow Prisma destructive schema changes in the Docker workflow |
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

## Supported workflows

- Analyze a WXR export and produce JSON/Markdown migration reports, including
  content inventory, Gutenberg mapping, plugin guidance, ACF and Yoast metadata
  summaries, estimates, and risks.
- Inspect the WordPress REST API for site, plugin, post-type, and exposed
  content-count metadata. Use an application password over HTTPS; this is
  metadata discovery, not a full content export.
- Analyze PHP source, optionally enrich it with a database-schema document, and
  generate a reviewable Next.js/Prisma/API/admin/auth/Docker/Playwright
  scaffold. Schema inference is deliberately conservative.
- Run a generated project against its isolated Docker database to install,
  migrate, seed, and run Playwright checks, with explicit acknowledgement for
  destructive schema changes.

The WXR blog scaffold generator is available as a library API, but its command
line integration is still pending. See the package [CLI reference](apps/cli/README.md)
for the command surface and [releasing guide](docs/RELEASING.md) for maintainers.

## Known limitations

- Generated code, inferred schemas, authentication/RBAC, API routes, and tests
  require project-specific review before production use.
- WooCommerce catalog scaffolding includes a cart/checkout shell only; payment
  and checkout integration are intentionally stubs.
- Multisite analysis and generated pages are incomplete for real tenant
  resolution. Complete tenant lookup, authorization, and data isolation before
  deployment.
- Unsupported, ambiguous, or composite-primary-key detail routes may return
  HTTP 501 rather than guessing an unsafe implementation.
- Verification can skip CRUD checks it cannot construct safely from the inferred
  schema; treat a skipped check as work to complete, not as proof of coverage.
- `analyze-php --config` supports its PHP source, schema, output, templates, and
  AI settings; configuration for the WXR and REST analysis modes is not yet
  exposed through their CLI command.

## Security

- **SSRF defense** -- URL/protocol validation plus a guarded Undici socket lookup on every connection. Private, loopback, link-local, ULA, mapped, and reserved DNS answers are rejected at connect time; approved public addresses are pinned for the socket while the original Host and HTTPS certificate verification remain intact.
- **Credential protection** -- REST credentials are not included in reports. Before PHP analysis generates files or sends content to AI assistance, high- and medium-severity secret matches abort the run with file/type/line metadata only; source values are never printed.
- **Input sanitization** -- All user-supplied strings (field names, URLs, file paths) are sanitized before use in codegen
- **Path traversal protection** -- Output file writer rejects paths that escape the output directory
- **XXE prevention** -- SAX parser configured to reject external entity expansion
- **Repository hygiene** -- Customer work directories, generated projects, credentials, and authentication state are ignored; CI rejects sensitive paths and likely literal credentials in committable text files without printing matched values. An optional private denylist is also enforced when `WP_TRANSFER_FORBIDDEN_TERMS` is supplied to the check

Only independently authored synthetic data belongs in tests and examples. Keep real migration inputs under an ignored local directory such as `migration-input/`, and keep generated applications under `output/`.

The isolated `run` workflow intentionally persists generated local verification
credentials in the ignored `.wp-transfer/verification.env` file described
above. Those credentials are owner-readable only and are not source or
production credentials.

## Development

```bash
git clone https://github.com/howlrs/wp-transfer.git
cd wp-transfer
pnpm install --frozen-lockfile

pnpm check:hygiene     # reject sensitive paths, private terms, and likely literal credentials in committable text
pnpm test              # unit and integration tests
pnpm typecheck         # typecheck all packages
pnpm build             # build all packages and the bundled CLI
pnpm test:package      # pack, install, and run the CLI outside the monorepo
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution and quality-gate
requirements, and [SECURITY.md](SECURITY.md) for private vulnerability reports.

For an additional private denylist during local or CI checks, set a
comma-separated `WP_TRANSFER_FORBIDDEN_TERMS` environment variable. Keep those
terms in the environment rather than committing customer identifiers here.

## License

MIT

## Status

**v0.4.1 pre-1.0 stabilization release.** The WXR analyzer, PHP analyzer,
generators, and verification workflow are usable migration accelerators, not an
automatic production migration. Generated authentication, commerce, multisite,
API, and test scaffolds require review and project-specific completion. Validate
output in an isolated environment, keep a source backup, and never run generated
tests or schema operations against production data. See [the release
notes](CHANGELOG.md) and [known limitations](#known-limitations).
