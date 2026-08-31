/**
 * Run Command — one-command migration verification
 *
 * Runs a generated Next.js project end-to-end:
 * npm install → docker compose up → prisma generate → prisma db push → seed → playwright test
 */
import { defineCommand } from "citty";
import { consola } from "consola";
import { generateDockerScaffold } from "@wp-transfer/analyzer";
import { execFileSync, execSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

/* ── Task 12: Error Recovery Guidance ── */

const ERROR_GUIDANCE: Record<string, string> = {
  "EADDRINUSE": "Port already in use. Run: docker compose down && docker compose up -d --wait",
  "P1001": "Database connection failed. Check: docker compose ps, verify DB is healthy",
  "P3009": "Migration failed. Run: npx prisma migrate reset (WARNING: drops data)",
  "ENOENT": "Command not found. Run: npm ci to install dependencies",
  "ENOMEM": "Out of memory. Increase Docker memory limit in Docker Desktop settings",
};

function getErrorGuidance(error: Error): string | undefined {
  const msg = error.message;
  for (const [pattern, guidance] of Object.entries(ERROR_GUIDANCE)) {
    if (msg.includes(pattern)) return guidance;
  }
  return undefined;
}

function runStep(
  name: string,
  command: string,
  cwd: string,
  environment: NodeJS.ProcessEnv,
  optional = false,
  timeoutMs = 300_000,
): boolean {
  consola.start(name);
  try {
    execSync(command, { cwd, env: environment, stdio: "inherit", timeout: timeoutMs });
    consola.success(name);
    return true;
  } catch (error) {
    if (optional) {
      consola.warn(`${name} (skipped: ${(error as Error).message})`);
      return true;
    }
    const guidance = getErrorGuidance(error as Error);
    if (guidance) {
      consola.info(`Recovery hint: ${guidance}`);
    }
    consola.fail(name);
    return false;
  }
}

export interface RunStep {
  name: string;
  command: string;
  optional?: boolean;
  skip?: boolean;
  timeoutMs?: number;
  /** Only commands that operate the generated application receive its secrets. */
  requiresProjectSecrets?: boolean;
}

export interface RunStepOptions {
  noDocker: boolean;
  noTest: boolean;
  acceptDataLoss: boolean;
  hasPrismaSchema: boolean;
  hasPackageLock: boolean;
}

export function createRunSteps(options: RunStepOptions): RunStep[] {
  const skipDatabaseSetup = options.noDocker || !options.hasPrismaSchema;
  const databasePush = options.acceptDataLoss
    ? "npx prisma db push --accept-data-loss"
    : "npx prisma db push";

  return [
    {
      name: "[1/7] Installing dependencies...",
      command: options.hasPackageLock ? "npm ci" : "npm install",
      timeoutMs: 600_000,
    },
    {
      name: "[2/7] Starting Docker services...",
      command: "docker compose up -d --wait",
      skip: options.noDocker,
      timeoutMs: 1_200_000,
      requiresProjectSecrets: true,
    },
    {
      name: "[3/7] Generating Prisma client...",
      command: "npx prisma generate",
      skip: !options.hasPrismaSchema,
      requiresProjectSecrets: true,
    },
    {
      name: "[4/7] Pushing database schema...",
      command: databasePush,
      skip: skipDatabaseSetup,
      requiresProjectSecrets: true,
    },
    {
      name: "[5/7] Seeding test data...",
      command: "npx prisma db seed",
      skip: skipDatabaseSetup,
      requiresProjectSecrets: true,
    },
    {
      name: "[6/7] Installing Playwright Chromium...",
      command: "npx playwright install chromium",
      skip: options.noTest,
      timeoutMs: 600_000,
    },
    {
      name: "[7/7] Running tests...",
      command: "npx playwright test",
      skip: options.noTest,
      timeoutMs: 900_000,
      requiresProjectSecrets: true,
    },
  ];
}

function parseEnv(content: string): NodeJS.ProcessEnv {
  const parsed: NodeJS.ProcessEnv = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    let value = match[2] ?? "";
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    parsed[match[1]!] = value;
  }

  return parsed;
}

function isMissingOrPlaceholder(value: string | undefined): boolean {
  return !value
    || /^change-me(?:$|[-_])/.test(value)
    || /^__[^_].*__$/.test(value);
}

function expandEnvironmentReferences(value: string, environment: NodeJS.ProcessEnv): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_match, key: string, fallback?: string) => {
    return environment[key] || fallback || "";
  });
}

const VERIFICATION_STATE_DIRECTORY = ".wp-transfer";
const VERIFICATION_STATE_FILE = "verification.env";
const GENERATED_COMPOSE_MARKER = "# wp-transfer-generated-compose: v1";
const PERSISTED_VERIFICATION_KEYS = [
  "DB_USER",
  "DB_PASSWORD",
  "DB_ROOT_PASSWORD",
  "AUTH_SECRET",
  "SEED_ADMIN_PASSWORD",
  "SEED_EDITOR_PASSWORD",
  "E2E_ADMIN_USERNAME",
  "E2E_ADMIN_PASSWORD",
] as const;

function isUrlSafeCredential(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function requireUrlSafeCredential(name: string, value: string): void {
  if (!isUrlSafeCredential(value)) {
    throw new Error(`${name} must use only URL-safe letters, numbers, underscores, or hyphens`);
  }
}

function selectPersistedValue(
  suppliedValue: string | undefined,
  persistedValue: string | undefined,
  fallback: () => string,
): string {
  return isMissingOrPlaceholder(suppliedValue)
    ? isMissingOrPlaceholder(persistedValue) ? fallback() : persistedValue!
    : suppliedValue!;
}

/** Compose-safe, stable namespace derived from the project's canonical path. */
export function createComposeProjectName(projectDir: string): string {
  const canonicalPath = realpathSync(projectDir);
  const readableName = basename(canonicalPath)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .slice(0, 32) || "project";
  const suffix = createHash("sha256").update(canonicalPath).digest("hex").slice(0, 12);
  return `wp-transfer-${readableName}-${suffix}`;
}

function resetVerificationStateInstructions(projectDir: string): string {
  const composeProjectName = createComposeProjectName(projectDir);
  return `To intentionally replace the named database volume, run: COMPOSE_PROJECT_NAME=${composeProjectName} docker compose down -v, `
    + "then remove .wp-transfer/verification.env and run again.";
}

function rejectPersistedCredentialConflict(
  projectDir: string,
  name: string,
  suppliedValue: string | undefined,
  persistedValue: string | undefined,
): void {
  if (
    !isMissingOrPlaceholder(suppliedValue)
    && !isMissingOrPlaceholder(persistedValue)
    && suppliedValue !== persistedValue
  ) {
    throw new Error(
      `${name} differs from the persisted Docker verification state. ${resetVerificationStateInstructions(projectDir)}`,
    );
  }
}

const SETUP_ENVIRONMENT_KEYS = [
  "PATH", "HOME", "TMPDIR", "TMP", "TEMP", "XDG_CACHE_HOME",
  "NPM_CONFIG_CACHE", "npm_config_cache", "PLAYWRIGHT_BROWSERS_PATH",
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY",
  "http_proxy", "https_proxy", "no_proxy", "all_proxy",
  "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR",
] as const;

/**
 * Setup commands receive only execution, cache, proxy, and certificate state.
 * This reduces accidental credential inheritance; it is not a sandbox for
 * package lifecycle scripts or a boundary around credentials on disk.
 */
export function createNonSecretRunEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const safeEnvironment: NodeJS.ProcessEnv = {};
  for (const key of SETUP_ENVIRONMENT_KEYS) {
    const value = environment[key];
    if (value !== undefined) {
      safeEnvironment[key] = value;
    }
  }
  return safeEnvironment;
}

function verificationStatePath(projectDir: string): string {
  return resolve(projectDir, VERIFICATION_STATE_DIRECTORY, VERIFICATION_STATE_FILE);
}

interface IsolatedDockerDatabase {
  protocol: "mysql:" | "postgresql:";
  hostPort: string;
  databaseName: string;
}

function isolatedDatabaseError(reason: string): Error {
  return new Error(`Docker verification only permits the isolated generated Docker DB: ${reason}`);
}

/**
 * Verify the full, security-relevant Compose manifest before extracting its
 * DB connection. A marker alone is forgeable; exact canonical generation also
 * rejects external volumes, bind mounts, extra DB commands, and environment
 * overrides before destructive Prisma operations can run.
 */
function readIsolatedDockerDatabase(projectDir: string): IsolatedDockerDatabase {
  const composePath = resolve(projectDir, "docker-compose.yml");
  if (!existsSync(composePath)) {
    throw isolatedDatabaseError("docker-compose.yml generated by wp-transfer is required");
  }
  const compose = readFileSync(composePath, "utf8");
  if (!compose.startsWith(`${GENERATED_COMPOSE_MARKER}\n`)) {
    throw isolatedDatabaseError("unrecognized docker-compose.yml (missing wp-transfer generation marker)");
  }

  const dbBlock = /^  db:\n([\s\S]*?)^  app:/m.exec(compose)?.[1];
  if (!dbBlock) {
    throw isolatedDatabaseError("unrecognized generated database service");
  }
  const mysql = /^    image: mysql:[^\n]+$/m.test(dbBlock);
  const postgresql = /^    image: postgres:[^\n]+$/m.test(dbBlock);
  if (mysql === postgresql) {
    throw isolatedDatabaseError("database provider is missing or ambiguous");
  }
  const provider = mysql ? "mysql" : "postgresql";
  const generatedCompose = generateDockerScaffold(basename(projectDir), provider)
    .find((file) => file.path === "docker-compose.yml")?.content;
  if (!generatedCompose || compose !== generatedCompose) {
    throw isolatedDatabaseError(
      "docker-compose.yml does not match the canonical generated manifest; only the isolated generated Docker DB is allowed",
    );
  }
  const internalPort = mysql ? "3306" : "5432";
  const port = new RegExp(`^      - "127\\.0\\.0\\.1:(\\d+):${internalPort}"$`, "m").exec(dbBlock)?.[1];
  const databaseVariable = mysql ? "MYSQL_DATABASE" : "POSTGRES_DB";
  const databaseName = new RegExp(`^      ${databaseVariable}: ([A-Za-z0-9_]+)$`, "m").exec(dbBlock)?.[1];
  if (!port || !databaseName) {
    throw isolatedDatabaseError("generated database port or name cannot be verified");
  }
  return {
    protocol: mysql ? "mysql:" : "postgresql:",
    hostPort: port,
    databaseName,
  };
}

/** Verify the host Prisma URL is exactly the generated Compose database. */
export function validateIsolatedDockerDatabase(projectDir: string, databaseUrlValue: string): void {
  const expected = readIsolatedDockerDatabase(projectDir);
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(databaseUrlValue);
  } catch {
    throw isolatedDatabaseError("DATABASE_URL is invalid");
  }
  if (databaseUrl.search || databaseUrl.hash) {
    throw isolatedDatabaseError("DATABASE_URL must not include query parameters or fragments");
  }
  if (databaseUrl.protocol !== expected.protocol) {
    throw isolatedDatabaseError(`DATABASE_URL protocol must be ${expected.protocol}`);
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname)) {
    throw isolatedDatabaseError("DATABASE_URL must target localhost");
  }
  if (databaseUrl.port !== expected.hostPort) {
    throw isolatedDatabaseError(`DATABASE_URL port must be the published Compose port ${expected.hostPort}`);
  }
  if (databaseUrl.pathname !== `/${expected.databaseName}`) {
    throw isolatedDatabaseError(`DATABASE_URL database must be ${expected.databaseName}`);
  }
}

function writeVerificationState(projectDir: string, environment: NodeJS.ProcessEnv): void {
  const stateDirectory = resolve(projectDir, VERIFICATION_STATE_DIRECTORY);
  mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  chmodSync(stateDirectory, 0o700);

  const content = PERSISTED_VERIFICATION_KEYS
    .map((key) => `${key}=${environment[key] ?? ""}`)
    .join("\n") + "\n";
  const statePath = verificationStatePath(projectDir);
  writeFileSync(statePath, content, { encoding: "utf8", mode: 0o600 });
  chmodSync(statePath, 0o600);
}

export function createRunEnvironment(
  projectDir: string,
  noDocker: boolean,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const envPath = resolve(projectDir, ".env");
  const envExamplePath = resolve(projectDir, ".env.example");
  const sourcePath = existsSync(envPath)
    ? envPath
    : existsSync(envExamplePath)
      ? envExamplePath
      : undefined;
  const fileEnvironment = sourcePath
    ? parseEnv(readFileSync(sourcePath, "utf8"))
    : {};
  const environment = noDocker
    ? { ...fileEnvironment, ...baseEnvironment }
    : { ...baseEnvironment, ...fileEnvironment };

  if (!noDocker) {
    if (!environment.DATABASE_URL) {
      throw new Error("Docker verification requires DATABASE_URL in .env, .env.example, or the process environment");
    }

    const initialDatabaseUrl = expandEnvironmentReferences(environment.DATABASE_URL, environment)
      .replace(/@db(?=:\d+|\/)/, "@localhost");
    let initialUrl: URL;
    try {
      initialUrl = new URL(initialDatabaseUrl);
    } catch {
      throw new Error("Docker verification received an invalid DATABASE_URL");
    }

    const statePath = verificationStatePath(projectDir);
    const persistedEnvironment = existsSync(statePath)
      ? parseEnv(readFileSync(statePath, "utf8"))
      : {};
    const urlUsername = decodeURIComponent(initialUrl.username);
    const urlPassword = decodeURIComponent(initialUrl.password);
    const suppliedDatabaseUser = isMissingOrPlaceholder(environment.DB_USER)
      ? urlUsername
      : environment.DB_USER;
    const suppliedDatabasePassword = isMissingOrPlaceholder(environment.DB_PASSWORD)
      ? urlPassword
      : environment.DB_PASSWORD;
    const persistedDatabaseUser = persistedEnvironment.DB_USER;
    const persistedDatabasePassword = persistedEnvironment.DB_PASSWORD;
    rejectPersistedCredentialConflict(projectDir, "DB_USER", suppliedDatabaseUser, persistedDatabaseUser);
    rejectPersistedCredentialConflict(projectDir, "DB_PASSWORD", suppliedDatabasePassword, persistedDatabasePassword);

    const databaseUser = selectPersistedValue(
      suppliedDatabaseUser,
      persistedEnvironment.DB_USER,
      () => urlUsername || "appuser",
    );
    const databasePassword = selectPersistedValue(
      suppliedDatabasePassword,
      persistedDatabasePassword,
      () => randomBytes(24).toString("base64url"),
    );
    environment.DB_USER = databaseUser;
    environment.DB_PASSWORD = databasePassword;
    environment.DB_ROOT_PASSWORD = selectPersistedValue(
      environment.DB_ROOT_PASSWORD,
      persistedEnvironment.DB_ROOT_PASSWORD,
      () => randomBytes(24).toString("base64url"),
    );
    requireUrlSafeCredential("DB_USER", databaseUser);
    requireUrlSafeCredential("DB_PASSWORD", databasePassword);

    const expandedDatabaseUrl = expandEnvironmentReferences(environment.DATABASE_URL, environment)
      .replace(/@db(?=:\d+|\/)/, "@localhost");
    let databaseUrl: URL;
    try {
      databaseUrl = new URL(expandedDatabaseUrl);
    } catch {
      throw new Error("Docker verification received an invalid DATABASE_URL");
    }
    if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)) {
      throw new Error("Docker verification refuses non-local DATABASE_URL");
    }
    databaseUrl.username = databaseUser;
    databaseUrl.password = databasePassword;
    environment.DATABASE_URL = databaseUrl.toString();
    // Compose reads this standard variable for every invocation, isolating
    // same-basename generated directories and their named volumes.
    environment.COMPOSE_PROJECT_NAME = createComposeProjectName(projectDir);

    for (const key of [
      "SEED_ADMIN_PASSWORD",
      "SEED_EDITOR_PASSWORD",
      "E2E_ADMIN_USERNAME",
      "E2E_ADMIN_PASSWORD",
      "AUTH_SECRET",
    ] as const) {
      rejectPersistedCredentialConflict(projectDir, key, environment[key], persistedEnvironment[key]);
    }

    const adminPassword = selectPersistedValue(
      environment.SEED_ADMIN_PASSWORD,
      persistedEnvironment.SEED_ADMIN_PASSWORD,
      () => randomBytes(24).toString("base64url"),
    );
    environment.SEED_ADMIN_PASSWORD = adminPassword;
    environment.SEED_EDITOR_PASSWORD = selectPersistedValue(
      environment.SEED_EDITOR_PASSWORD,
      persistedEnvironment.SEED_EDITOR_PASSWORD,
      () => randomBytes(24).toString("base64url"),
    );
    environment.E2E_ADMIN_USERNAME = selectPersistedValue(
      environment.E2E_ADMIN_USERNAME,
      persistedEnvironment.E2E_ADMIN_USERNAME,
      () => "admin",
    );
    environment.E2E_ADMIN_PASSWORD = selectPersistedValue(
      environment.E2E_ADMIN_PASSWORD,
      persistedEnvironment.E2E_ADMIN_PASSWORD,
      () => adminPassword,
    );
    environment.AUTH_SECRET = selectPersistedValue(
      environment.AUTH_SECRET,
      persistedEnvironment.AUTH_SECRET,
      () => randomBytes(32).toString("base64url"),
    );
    writeVerificationState(projectDir, environment);
  }

  return environment;
}

/* ── Task 11: Migration Coverage Report ── */

export interface CoverageInput {
  phpScripts: number;
  testsGenerated: number;
  testsPassed: number;
  testsFailed: number;
  domains: Array<{
    name: string;
    scripts: number;
    tested: number;
    passed: number;
  }>;
}

export function generateCoverageReport(input: CoverageInput): string {
  const coverage = Math.round((input.testsGenerated / input.phpScripts) * 100);
  const passRate = input.testsGenerated > 0
    ? Math.round((input.testsPassed / input.testsGenerated) * 100)
    : 0;

  const domainRows = input.domains
    .map((d) => `| ${d.name} | ${d.scripts} | ${d.tested} | ${d.passed} | ${d.scripts === d.passed ? "OK" : "NG"} |`)
    .join("\n");

  return `# Migration Coverage Report

## Summary
- **PHP Scripts**: ${input.phpScripts}
- **Tests Generated**: ${input.testsGenerated} (${coverage}%)
- **Tests Passed**: ${input.testsPassed} / ${input.testsGenerated} (${passRate}%)
- **Tests Failed**: ${input.testsFailed}

## Domain Breakdown

| Domain | Scripts | Tested | Passed | Status |
|--------|---------|--------|--------|--------|
${domainRows}

## Verdict
${coverage >= 100 && passRate >= 100 ? "COMPLETE — All scripts tested and passing" : `INCOMPLETE — Coverage ${coverage}%, Pass rate ${passRate}%`}
`;
}

export const runCommand = defineCommand({
  meta: {
    name: "run",
    description: "Run a generated project in an isolated Docker verification environment",
  },
  args: {
    dir: {
      type: "positional",
      description: "Path to generated project directory",
      required: true,
    },
    "no-docker": {
      type: "boolean",
      description: "Skip Docker and all database setup (tests may still write application data)",
      default: false,
    },
    "accept-data-loss": {
      type: "boolean",
      description: "Allow Prisma to apply destructive schema changes to the Docker database",
      default: false,
    },
    "no-test": {
      type: "boolean",
      description: "Skip Playwright tests",
      default: false,
    },
    open: {
      type: "boolean",
      description: "Open test report in browser after completion",
      default: false,
    },
  },
  run: async ({ args }) => {
    const projectDir = resolve(args.dir);

    if (!existsSync(projectDir)) {
      consola.error(`Directory not found: ${projectDir}`);
      process.exit(1);
    }

    if (!existsSync(resolve(projectDir, "package.json"))) {
      consola.error(`No package.json found in ${projectDir}. Run analyze-php first.`);
      process.exit(1);
    }

    consola.box(`wp-transfer run\n${projectDir}`);

    const noDocker = args["no-docker"] as boolean;
    const noTest = args["no-test"] as boolean;
    const hasPrismaSchema = existsSync(resolve(projectDir, "prisma/schema.prisma"));
    const environment = createRunEnvironment(projectDir, noDocker);

    if (!noDocker) {
      // This happens before any Docker, Prisma, or seed command.  The state
      // file may be refreshed above, but no database connection is made until
      // this exact generated Compose target has been verified.
      validateIsolatedDockerDatabase(projectDir, environment.DATABASE_URL!);
    }

    if (environment.DATABASE_URL) {
      consola.info("Database connection configured (credentials hidden).");
    }
    if (noDocker) {
      consola.warn("External database mode: schema push and seed are disabled. Generated tests may still write application data.");
    }
    if (!hasPrismaSchema) {
      consola.warn("No prisma/schema.prisma found; Prisma setup steps will be skipped.");
    }

    const steps = createRunSteps({
      noDocker,
      noTest,
      acceptDataLoss: args["accept-data-loss"] as boolean,
      hasPrismaSchema,
      hasPackageLock: existsSync(resolve(projectDir, "package-lock.json")),
    });

    let passed = 0;
    let failed = 0;

    for (const step of steps) {
      if (step.skip) {
        consola.info(`${step.name} (skipped)`);
        continue;
      }
      const stepEnvironment = step.requiresProjectSecrets
        ? environment
        : createNonSecretRunEnvironment(environment);
      const ok = runStep(step.name, step.command, projectDir, stepEnvironment, step.optional, step.timeoutMs);
      if (ok) passed++;
      else {
        failed++;
        consola.error(`Failed at: ${step.name}`);
        consola.error("Fix the issue and re-run.");
        process.exit(1);
      }
    }

    consola.box([
      "=== Migration Verification Complete ===",
      `Steps: ${passed} passed, ${failed} failed`,
      `Report: ${projectDir}/test-results/index.html`,
      noDocker ? "" : `Docker: http://localhost:3000 (running)`,
    ].filter(Boolean).join("\n"));

    if (args.open && !noTest) {
      try {
        execFileSync("npx", ["playwright", "show-report", resolve(projectDir, "test-results")], {
          cwd: projectDir,
          env: environment,
          stdio: "inherit",
        });
      } catch {
        // show-report may not be available
      }
    }
  },
});
