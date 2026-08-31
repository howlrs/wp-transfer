# Contributing to wp-transfer

Thanks for contributing. v0.4.1 is a pre-1.0 stabilization release, so changes
must preserve its safety boundaries and documented limitations.

## Data and privacy

Use independently authored synthetic data only in tests, fixtures, examples,
issues, pull requests, and documentation. Do not commit customer migration
inputs, real WordPress exports, credentials, access tokens, databases, generated
applications, or authentication state. Keep local inputs in ignored directories
such as `migration-input/` or `output/`.

Report vulnerabilities privately under the [security policy](SECURITY.md), not
in public issues.

## Local quality gates

Install Node.js 20+ and pnpm 10.33.0, then run every required gate before
opening a pull request:

```bash
pnpm install --frozen-lockfile
pnpm check:hygiene
pnpm typecheck
pnpm test
pnpm exec vitest run --coverage --config vitest.config.ts
pnpm audit
pnpm build
pnpm test:package
```

Explain any intentional generated-output change and add or update tests for
behavioral changes. Keep public docs and [CHANGELOG.md](CHANGELOG.md) accurate,
including pre-1.0 limitations.

## Scope of contributions

Generated code is reviewed output, not an authority to weaken safeguards.
Preserve explicit failures for unsafe or ambiguous input, and do not turn a
skipped verification check into a false success. Read the [README](README.md)
and [release runbook](docs/RELEASING.md) before preparing a release.
