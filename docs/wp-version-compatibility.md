# WordPress compatibility and release limitations

This document states the scope verified for the `0.4.1` release. `wp-transfer` is a migration analysis and scaffold generator; its output requires application-specific review, data import work, and acceptance testing before production use.

## Supported input modes

| Mode | What is implemented | Release status |
| --- | --- | --- |
| `analyze <export.xml>` | Parses a WXR file and reports site/content metadata. It preserves posts, terms, users, media references, and post metadata available in the export. | Supported for the tested fixtures below. |
| `analyze <https-url>` | Reads public WordPress REST metadata and content-count endpoints after URL safety validation. Authenticated endpoints can be supplied with WordPress application-password credentials. | Supported for metadata/content analysis; it is not a complete backup or database extractor. |
| `analyze --multisite <directory>` | Reads top-level `.xml` WXR files, detects a network shape, and emits a multi-site Prisma/Next.js scaffold. | Scaffold only. The generated tenant resolution and UI need review and completion before use as a multi-tenant application. |
| `analyze-php <directory>` | Scans PHP files and optional database documentation to infer tables, routes, access guards, and scaffold files. | Heuristic static analysis; see PHP limitations. |

## WordPress and WXR evidence

The parser is not tied to a WordPress runtime version. It accepts WXR XML and obtains the reported WordPress version from the export's `<generator>` metadata when present. It does not validate that field against a running site.

| Evidence | Verified coverage | Notes |
| --- | --- | --- |
| WXR version | 1.2 fixtures | The release test suite contains WXR 1.2 exports. Other WXR revisions are not a compatibility guarantee. |
| WordPress export metadata | 4.7.28, 6.0.9, and 6.7 fixture values | These are parser fixtures, not an end-to-end migration certification for all WordPress releases between them. |
| Classic editor content | 4.7.28 fixture | Stored as source content. |
| Gutenberg/FSE-shaped content | 6.0.9 and 6.7 fixtures | Gutenberg blocks can be parsed and converted to the project’s portable representation. FSE templates are retained as exported post types; no equivalent Next.js theme/template conversion is promised. |

For any WordPress, plugin, or hosting version outside those fixtures, run `analyze` against a representative export and inspect the generated report before selecting this tool for the migration.

## Plugin and commerce scope

Plugin detection is based on available WXR metadata, REST metadata, and source-code heuristics. It is not a guarantee that a plugin's configuration, runtime behavior, licensed features, or third-party integrations will be migrated.

| Area | Current behavior | Release status |
| --- | --- | --- |
| ACF, SEO, forms, page builders, and role plugins | Can be detected or represented in reports/scaffold inputs when their data is present. | Manual mapping and verification required. No plugin-version compatibility matrix is claimed. |
| WooCommerce data | Product-oriented WXR analysis and an EC scaffold are available. With explicit REST credentials, the CLI can inventory orders/customers and emit an order-oriented Prisma schema. | Scaffold/manual import work required. Persisting order/customer records, payments, taxes, shipping, subscriptions, and operational integrations are out of scope. |
| WPML/Polylang-like signals | Language-related source metadata can be detected and an i18n scaffold can be emitted. | Manual review and translation/content validation required. |

## PHP source analysis limitations

`analyze-php` is regex- and pattern-based static analysis. It does not parse PHP into a complete syntax tree, execute source code, resolve framework/plugin behavior, or prove that a detected route is reachable or authorized at runtime.

It is intended to surface likely schema, route, and access-control candidates for human review. Treat all generated API, admin, and authentication code as a scaffold. In particular, dynamic includes, generated SQL, reflection, arbitrary dispatch, custom query builders, and syntax not covered by the heuristics may be missed or misclassified.

PHP version labels are therefore not a compatibility promise. The analyzer may recognize selected modern language patterns, but it does not certify PHP 5.x, 7.x, 8.x, or future PHP source as fully supported.

## Database and generated application scope

| Area | Current behavior | Release status |
| --- | --- | --- |
| `analyze-php` CLI output | Emits a Prisma schema with the MySQL provider and generates the MySQL Docker flow by default. | Supported default path; validate against a disposable MySQL instance. |
| PostgreSQL generators | The analyzer library has PostgreSQL-capable generator functions, including the multi-site schema/scaffold helpers. | Library/scaffold capability only. The `analyze-php` CLI does not currently emit a PostgreSQL project. |
| SQLite and other source databases | No direct source-database migration is implemented. | Bring an export or schema documentation and perform conversion/import work separately. |

The generated Docker configuration is for local verification. It is not a production deployment configuration, backup plan, or managed-database setup.

## Multisite limitations

The multisite command accepts a directory of WXR files and generates network-oriented artifacts. The output is a starting point, not a finished multi-tenant system: tenant identification, route coverage, authorization boundaries, data import, domain/DNS setup, and operational isolation must be designed and tested for the target deployment.

## General limitations

- WXR only contains what the exporter includes. Validate users, media, revisions, plugin data, and private/custom content against the source system.
- REST analysis is a metadata/content discovery path, not a replacement for a backup. Endpoint availability varies by site configuration and permissions.
- The tool never makes a production deployment decision. Review the report, generated source, credentials, data transforms, and security controls before publishing a migrated application.
- Use a staging copy and a reversible import process for migration validation, especially for large sites and media-heavy exports.
