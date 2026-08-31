# Changelog

Public release milestones are summarized here. This project follows semantic
versioning while it is pre-1.0: minor versions can contain breaking changes.

## [0.4.1] - 2026-08-31

### Release status

v0.4.1 is a pre-1.0 stabilization release of the WordPress-to-Next.js migration
accelerator. It supports reviewed, isolated migration work; it does not promise
fully automatic or production-ready migrations.

### Highlights

- Generalized the repository and its fixtures to use independently authored
  synthetic data only.
- Added repository hygiene checks for sensitive paths, likely literal
  credentials, and optional private denylist terms.
- Hardened PHP analysis and project generation with secret scanning, safer
  output handling, route validation, schema inference safeguards, and explicit
  handling for unsupported detail routes.
- Strengthened generated authentication/RBAC, Docker verification isolation,
  credential persistence, REST-client SSRF protections, uploads, and BigInt
  serialization.
- Added consumer package smoke tests and CI quality gates.
- Connected `analyze-php --config` to its source, schema, output, template, and
  AI settings, with explicit command-line values taking precedence.

### Breaking and pre-1.0 caveats

- This is **not** a 1.0 release. Interfaces, generated project structure, and
  configuration may change before 1.0.
- The npm registry package is not published. Install the GitHub Release tarball
  or build from source; registry publication awaits verified npm authentication
  and trusted-publisher setup.
- Review [supported workflows and limitations](README.md#known-limitations)
  before use. In particular, generated code needs project-specific completion,
  commerce payment/checkout is stubbed, multisite tenant resolution is
  incomplete, and WXR/REST config-file integration is not exposed by the CLI.

## [0.4.0] - 2026-04-10

- Integrated the PHP analyzer modules into the generated-project workflow.
- Added one-command isolated verification, a migration dashboard, pre-flight
  checks, configuration parsing, and broader generator integration coverage.

## [0.3.1-alpha] - 2026-04-09

- Preferred installed Claude CLI authentication for AI assistance, with the
  Anthropic API as a fallback.

## [0.3.0-alpha] - 2026-04-09

- Added opt-in AI route generation, WooCommerce order/customer REST helpers,
  and additional custom-field and page-builder analysis.

## [0.2.0-alpha] - 2026-04-09

- Added WooCommerce catalog, WordPress multisite, and internationalization
  analyzers and scaffold generators.
- Expanded end-to-end, performance, security, and generator test coverage.

## [0.1.0-alpha] - 2026-04-08

Initial internal WXR/analyzer/generator baseline. It was not a public npm
publication.
