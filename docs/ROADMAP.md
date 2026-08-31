# v1.0.0 readiness roadmap

`v0.4.1` is a public pre-1.0 migration accelerator. This roadmap defines the
work that must be complete, verified, and documented before calling a release
`1.0.0`. It is a completion checklist, not a delivery-date commitment.

All fixtures, examples, and acceptance environments must use independently
authored synthetic data. Never use customer exports, credentials, or generated
application state to satisfy these items.

## P0 — required for 1.0.0

### 1. Complete the multisite production path

- Implement tenant identification for both subpath and subdomain deployments.
- Enforce tenant-scoped authorization and data isolation in generated routes,
  admin pages, and data access.
- Add end-to-end acceptance tests for cross-tenant denial, tenant routing, and
  import behavior.
- Document the supported deployment topology and the operational setup.

### 2. Complete the commerce workflow or narrow it decisively

- Implement and test an explicit checkout/payment integration boundary, order
  persistence, and post-payment state handling; or remove checkout claims and
  make catalog-only support the documented 1.0 scope.
- Define the handling of taxes, shipping, refunds, subscriptions, and customer
  migration as supported, delegated, or out of scope.
- Add isolated end-to-end tests for every supported commerce path.

### 3. Make generated application behavior a supported contract

- Replace placeholder/TODO implementations in generated authentication,
  authorization, API, admin, and detail-route paths with supported behavior or
  explicit generated extension points.
- Support the documented primary-key and route shapes, or reject them during
  analysis with an actionable report before generation.
- Add generated-project integration tests that exercise the supported contract
  from analysis through Docker-backed verification.

### 4. Turn verification results into release-quality evidence

- Eliminate silent verification skips for supported schemas. A non-verifiable
  supported operation must fail with a remediation checklist, not look passed.
- Publish a machine-readable verification summary distinguishing pass, fail,
  unsupported, and manual-review-required outcomes.
- Add regression fixtures for ambiguous schemas, composite keys, uploads,
  authorization, and destructive-schema protections.

### 5. Complete the supported CLI workflows

- Expose the WXR blog scaffold generator through a documented CLI workflow, or
  remove it from the public feature set.
- Either support configuration files consistently for WXR, REST, and PHP modes
  or document configuration as PHP-only and remove generic configuration
  claims.
- Add command-level tests for all supported configuration, precedence, and
  error-exit behavior.

### 6. Establish a defensible compatibility contract

- Define supported WordPress export, REST, PHP-source, database, plugin, and
  deployment boundaries from repeatable fixtures and acceptance tests.
- Exercise each claimed compatibility path with independently authored
  synthetic fixtures and publish the resulting support matrix.
- Keep unsupported plugins and transformations visible in the migration report
  with actionable manual-mapping guidance.

## P1 — required for a complete public distribution story

### 7. Decide and implement registry distribution

- Either publish `wp-transfer` to npm using a verified trusted publisher and
  provenance, with a clean-install smoke test, or explicitly retain GitHub
  Release tarballs as the sole supported distribution channel.
- Document the decision, ownership, upgrade path, and rollback procedure.

### 8. Strengthen public-project operations

- Add issue and pull-request templates, a code of conduct with a maintained
  contact path, and a support policy.
- Add dependency-update automation and a documented security-response SLA.
- Add artifact provenance/attestation if the selected distribution channel
  supports it, and verify it in the release workflow.

## 1.0.0 exit gate

Do not create `v1.0.0` until every P0 item has passing automated evidence,
manual acceptance evidence where appropriate, and matching public
documentation. Re-run the full release gate on the exact tagged commit, verify
the downloaded public artifact in a clean environment, and record any
intentionally unsupported behavior in the compatibility documentation.
