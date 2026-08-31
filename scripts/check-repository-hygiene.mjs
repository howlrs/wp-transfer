import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localForbiddenTerms = (process.env.WP_TRANSFER_FORBIDDEN_TERMS ?? "")
  .split(",")
  .map((term) => term.trim().toLowerCase())
  .filter(Boolean);

// These tests intentionally exercise literal assignment detection. Specific
// provider/key patterns are never exempt, even in these fixture sources.
const genericSecretFixturePaths = new Set([
  "apps/cli/tests/analyze-php-secret-scan.test.ts",
  "packages/core/tests/secret-scanner.test.ts",
]);

// Keep this list in parity with packages/core/src/security/secret-scanner.ts.
// Findings intentionally report only a pattern type, never the matched value.
const likelySecretPatterns = [
  { type: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/g },
  { type: "private-key", pattern: /-----BEGIN\s[\w\s]*PRIVATE KEY-----/g },
  {
    type: "wp-auth-key",
    pattern: /define\(\s*'(?:AUTH_KEY|SECURE_AUTH_KEY|LOGGED_IN_KEY|NONCE_KEY|AUTH_SALT|SECURE_AUTH_SALT|LOGGED_IN_SALT|NONCE_SALT)'\s*,\s*'[^']+'\s*\)/g,
  },
  { type: "wp-db-password", pattern: /define\(\s*'DB_PASSWORD'\s*,\s*'[^']+'\s*\)/g },
  { type: "github-token", pattern: /gh[ps]_[A-Za-z0-9_]{36,}/g },
  { type: "slack-token", pattern: /xox[baprs]-[A-Za-z0-9\-]+/g },
  { type: "google-api-key", pattern: /AIzaSy[A-Za-z0-9_-]{33}/g },
  { type: "stripe-key", pattern: /[sr]k_live_[A-Za-z0-9]{24,}/g },
  { type: "sendgrid-key", pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g },
  {
    type: "generic-secret",
    pattern: /(?:^|[^$A-Za-z0-9_])(?:api_key|secret_key|password|token)\s*=\s*(?:"[^"\r\n]{8,}"|'[^'\r\n]{8,}'|(?=[A-Za-z0-9_-]{16,}(?:\s|;|$))(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{16,}(?=\s|;|$))/gim,
  },
];

function repositoryFiles() {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: workspaceRoot, encoding: "utf8" },
  );

  return output.split("\0").filter(Boolean);
}

function isSensitivePath(relativePath) {
  const normalized = relativePath.toLowerCase();
  const segments = normalized.split("/");
  const filename = basename(normalized);

  if (localForbiddenTerms.some((term) => normalized.includes(term))) {
    return true;
  }

  if (
    segments.includes("output")
    || segments.includes(".auth")
    || segments.includes(".wp-transfer")
    || segments.includes("migration-input")
    || segments.includes("private-fixtures")
  ) {
    return true;
  }
  if (filename === ".env" || (filename.startsWith(".env.") && filename !== ".env.example")) {
    return true;
  }
  if (filename.endsWith(".local.sql") || filename.endsWith(".local.wxr")) {
    return true;
  }
  return segments.some((segment) => /^(?:client|customer)[-_].+$/i.test(segment));
}

function likelySecretTypes(content, relativePath) {
  return likelySecretPatterns
    .filter(({ type, pattern }) =>
      !(type === "generic-secret" && genericSecretFixturePaths.has(relativePath))
      && new RegExp(pattern.source, pattern.flags).test(content),
    )
    .map(({ type }) => type);
}

const findings = [];

for (const relativePath of repositoryFiles()) {
  const absolutePath = resolve(workspaceRoot, relativePath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    continue;
  }

  if (isSensitivePath(relativePath)) {
    findings.push(`${relativePath}: prohibited path`);
    continue;
  }

  const bytes = readFileSync(absolutePath);
  // Binary assets are not text input and can contain arbitrary byte sequences.
  if (bytes.includes(0)) continue;

  const content = bytes.toString("utf8");
  if (localForbiddenTerms.some((term) => content.toLowerCase().includes(term))) {
    findings.push(`${relativePath}: prohibited content`);
  }
  const secretTypes = likelySecretTypes(content, relativePath);
  if (secretTypes.length > 0) {
    findings.push(`${relativePath}: likely credential (${secretTypes.join(", ")})`);
  }
}

if (findings.length > 0) {
  process.stderr.write(`Repository hygiene check failed:\n${findings.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Repository hygiene check passed.\n");
}
