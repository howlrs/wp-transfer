# Releasing wp-transfer

This runbook covers public pre-1.0 releases. It complements the contributor
[quality gates](../CONTRIBUTING.md) and the [security policy](../SECURITY.md).

## Prepare the release

1. Choose the version and update every package, documentation reference, and
   release artifact name so they agree. Confirm the Git tag will be `v<version>`.
2. Update [CHANGELOG.md](../CHANGELOG.md) with user-visible changes, security
   notes, and any breaking pre-1.0 caveats.
3. Start from a clean worktree and confirm CI is green for the exact commit.
4. Run the required local gates:

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

5. Build and inspect the package tarball. Confirm its version matches the tag
   and that it contains only the intended public CLI files.

Never print, commit, paste into CI logs, or put into release notes any secret,
token, credential, customer input, or private denylist value.

## Publish the GitHub release

1. Create and push the annotated `v<version>` tag for the verified commit.
2. Create a GitHub Release from that tag, attach the packed CLI artifact named
   `wp-transfer-<version>.tgz` and its `SHA256SUMS` file. Link the matching
   changelog entry and add generated commit notes.
3. Verify installation from the exact release URL in a clean temporary project:

   ```bash
   npm install --global https://github.com/howlrs/wp-transfer/releases/download/v<version>/wp-transfer-<version>.tgz
   wp-transfer --help
   ```

4. Verify the downloaded archive against `SHA256SUMS` and confirm the release
   notes link to the README limitations and security policy.

## Optional npm registry publication

Do not publish to npm until the publisher account, package ownership, and
trusted-publisher authentication have been verified for this repository. Once
verified, publish the already-inspected tarball using the approved release
workflow, then test the registry artifact in a clean environment. Until then,
the GitHub Release tarball is the installation path and documentation must not
claim npm availability.
