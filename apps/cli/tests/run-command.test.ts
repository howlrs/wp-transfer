import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateDockerScaffold } from "@wp-transfer/analyzer";
import {
  createRunEnvironment,
  createNonSecretRunEnvironment,
  createComposeProjectName,
  generateCoverageReport,
  createRunSteps,
  runCommand,
  validateIsolatedDockerDatabase,
} from "../src/commands/run.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("run command", () => {
  it("is defined with correct meta", () => {
    expect(runCommand.meta?.name).toBe("run");
  });

  it("has required positional dir argument", () => {
    expect(runCommand.args?.dir).toBeDefined();
    expect(runCommand.args?.dir.type).toBe("positional");
  });

  it("has --no-docker flag", () => {
    expect(runCommand.args?.["no-docker"]).toBeDefined();
  });

  it("has --no-test flag", () => {
    expect(runCommand.args?.["no-test"]).toBeDefined();
  });

  it("has --open flag", () => {
    expect(runCommand.args?.open).toBeDefined();
  });

  it("requires explicit consent before accepting database data loss", () => {
    expect(runCommand.args?.["accept-data-loss"]).toBeDefined();
  });
});

describe("createRunSteps", () => {
  it("never mutates or seeds an existing database in --no-docker mode", () => {
    const steps = createRunSteps({
      noDocker: true,
      noTest: false,
      acceptDataLoss: true,
      hasPrismaSchema: true,
      hasPackageLock: false,
    });
    const enabledCommands = steps.filter((step) => !step.skip).map((step) => step.command);

    expect(enabledCommands).not.toContain("docker compose up -d --wait");
    expect(enabledCommands).not.toContain("npx prisma db push --accept-data-loss");
    expect(enabledCommands).not.toContain("npx prisma db seed");
    expect(enabledCommands).toContain("npx prisma generate");
    expect(enabledCommands).toContain("npx playwright install chromium");
  });

  it("does not accept data loss unless explicitly requested", () => {
    const safeSteps = createRunSteps({
      noDocker: false,
      noTest: true,
      acceptDataLoss: false,
      hasPrismaSchema: true,
      hasPackageLock: true,
    });
    const destructiveSteps = createRunSteps({
      noDocker: false,
      noTest: true,
      acceptDataLoss: true,
      hasPrismaSchema: true,
      hasPackageLock: true,
    });

    expect(safeSteps.find((step) => step.name.includes("database schema"))?.command)
      .toBe("npx prisma db push");
    expect(destructiveSteps.find((step) => step.name.includes("database schema"))?.command)
      .toBe("npx prisma db push --accept-data-loss");
    expect(safeSteps[0]?.command).toBe("npm ci");
  });

  it("skips Prisma and browser steps when they are not applicable", () => {
    const steps = createRunSteps({
      noDocker: false,
      noTest: true,
      acceptDataLoss: false,
      hasPrismaSchema: false,
      hasPackageLock: false,
    });

    expect(steps.filter((step) => !step.skip).map((step) => step.command)).toEqual([
      "npm install",
      "docker compose up -d --wait",
    ]);
  });

  it("only passes generated-project secrets to Docker, Prisma, seed, and test steps", () => {
    const steps = createRunSteps({
      noDocker: false,
      noTest: false,
      acceptDataLoss: false,
      hasPrismaSchema: true,
      hasPackageLock: false,
    });

    expect(steps.filter((step) => step.requiresProjectSecrets).map((step) => step.command)).toEqual([
      "docker compose up -d --wait",
      "npx prisma generate",
      "npx prisma db push",
      "npx prisma db seed",
      "npx playwright test",
    ]);
    expect(steps.filter((step) => !step.requiresProjectSecrets).map((step) => step.command)).toEqual([
      "npm install",
      "npx playwright install chromium",
    ]);
  });

  it("removes generated-project secrets from dependency and browser setup environments", () => {
    const environment = createNonSecretRunEnvironment({
      PATH: "/usr/bin",
      HOME: "/home/tester",
      HTTPS_PROXY: "https://proxy.example",
      NODE_EXTRA_CA_CERTS: "/tmp/ca.pem",
      DATABASE_URL: "mysql://appuser:secret@localhost:3306/example",
      DB_PASSWORD: "secret",
      AUTH_SECRET: "auth-secret",
      SEED_ADMIN_PASSWORD: "admin-secret",
      E2E_ADMIN_PASSWORD: "e2e-secret",
      GITHUB_TOKEN: "github-token",
      AWS_SECRET_ACCESS_KEY: "cloud-secret",
      SSH_AUTH_SOCK: "/tmp/agent.sock",
      NPM_TOKEN: "registry-token",
    });

    expect(environment).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/tester",
      HTTPS_PROXY: "https://proxy.example",
      NODE_EXTRA_CA_CERTS: "/tmp/ca.pem",
    });
  });
});

describe("createRunEnvironment", () => {
  it("uses .env values without changing the file", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);
    const envPath = join(directory, ".env");
    const original = [
      "DATABASE_URL=\"mysql://user:secret@db:3306/example\"",
      "AUTH_SECRET=test-only-secret",
      "",
    ].join("\n");
    writeFileSync(envPath, original);

    const environment = createRunEnvironment(directory, false, {});

    expect(environment.DATABASE_URL).toBe("mysql://user:secret@localhost:3306/example");
    expect(environment.AUTH_SECRET).toBe("test-only-secret");
    expect(environment.SEED_ADMIN_PASSWORD).toHaveLength(32);
    expect(environment.SEED_EDITOR_PASSWORD).toHaveLength(32);
    expect(environment.E2E_ADMIN_PASSWORD).toBe(environment.SEED_ADMIN_PASSWORD);
    expect(readFileSync(envPath, "utf8")).toBe(original);
  });

  it("does not rewrite an existing database URL in --no-docker mode", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, ".env.example"), "DATABASE_URL=mysql://user:secret@remote-db:3306/example\n");

    const environment = createRunEnvironment(directory, true, {});

    expect(environment.DATABASE_URL).toBe("mysql://user:secret@remote-db:3306/example");
  });

  it("prefers the generated project database over an inherited URL in Docker mode", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, ".env.example"), "DATABASE_URL=mysql://user:secret@db:3306/example\n");

    const environment = createRunEnvironment(directory, false, {
      DATABASE_URL: "mysql://admin:secret@production.example.com:3306/live",
    });

    expect(environment.DATABASE_URL).toBe("mysql://user:secret@localhost:3306/example");
  });

  it("replaces generated credential placeholders in memory", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, ".env.example"),
      [
        "DATABASE_URL=mysql://user:secret@db:3306/example",
        "AUTH_SECRET=change-me-before-use",
        "SEED_ADMIN_PASSWORD=",
        "SEED_EDITOR_PASSWORD=",
        "E2E_ADMIN_PASSWORD=",
      ].join("\n"),
    );

    const environment = createRunEnvironment(directory, false, {});

    expect(environment.AUTH_SECRET).not.toContain("change-me");
    expect(environment.SEED_ADMIN_PASSWORD).toHaveLength(32);
    expect(environment.SEED_EDITOR_PASSWORD).toHaveLength(32);
    expect(environment.E2E_ADMIN_PASSWORD).toBe(environment.SEED_ADMIN_PASSWORD);
  });

  it("generates ephemeral database credentials and expands the generated URL in memory", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);
    const envPath = join(directory, ".env.example");
    const original = [
      "DB_USER=appuser",
      "DB_PASSWORD=",
      "DB_ROOT_PASSWORD=",
      "DATABASE_URL=mysql://${DB_USER}:${DB_PASSWORD}@db:3306/example",
    ].join("\n");
    writeFileSync(envPath, original);

    const environment = createRunEnvironment(directory, false, {});

    expect(environment.DB_PASSWORD).toHaveLength(32);
    expect(environment.DB_ROOT_PASSWORD).toHaveLength(32);
    expect(environment.DATABASE_URL).toBe(
      `mysql://appuser:${environment.DB_PASSWORD}@localhost:3306/example`,
    );
    expect(readFileSync(envPath, "utf8")).toBe(original);
  });

  it("persists generated Docker credentials with owner-only permissions and reuses them", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, ".env.example"),
      [
        "DB_USER=appuser",
        "DB_PASSWORD=",
        "DB_ROOT_PASSWORD=",
        "DATABASE_URL=mysql://${DB_USER}:${DB_PASSWORD}@db:3306/example",
        "AUTH_SECRET=",
      ].join("\n"),
    );

    const first = createRunEnvironment(directory, false, {});
    const statePath = join(directory, ".wp-transfer", "verification.env");
    const second = createRunEnvironment(directory, false, {});

    expect(readFileSync(statePath, "utf8")).toContain(`DB_PASSWORD=${first.DB_PASSWORD}`);
    expect(statSync(statePath).mode & 0o777).toBe(0o600);
    expect(second.DB_PASSWORD).toBe(first.DB_PASSWORD);
    expect(second.DB_ROOT_PASSWORD).toBe(first.DB_ROOT_PASSWORD);
    expect(second.AUTH_SECRET).toBe(first.AUTH_SECRET);
  });

  it("fails safely when an explicit database password conflicts with persisted state", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, ".env.example"), "DATABASE_URL=mysql://appuser:@db:3306/example\n");
    createRunEnvironment(directory, false, {});
    writeFileSync(join(directory, ".env"), "DATABASE_URL=mysql://appuser:different-password@db:3306/example\n");

    expect(() => createRunEnvironment(directory, false, {})).toThrow("docker compose down -v");
  });

  it("fails safely when an explicit database user conflicts with persisted state", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, ".env.example"), "DATABASE_URL=mysql://appuser:@db:3306/example\n");
    createRunEnvironment(directory, false, {});
    writeFileSync(join(directory, ".env"), "DATABASE_URL=mysql://otheruser:@db:3306/example\n");

    expect(() => createRunEnvironment(directory, false, {})).toThrow("DB_USER differs");
  });

  it.each([
    ["SEED_ADMIN_PASSWORD", "first-admin-password", "second-admin-password"],
    ["SEED_EDITOR_PASSWORD", "first-editor-password", "second-editor-password"],
    ["E2E_ADMIN_USERNAME", "admin", "other-admin"],
    ["E2E_ADMIN_PASSWORD", "first-e2e-password", "second-e2e-password"],
    ["AUTH_SECRET", "first-auth-secret", "second-auth-secret"],
  ])("fails safely when %s conflicts with persisted verification state", (key, first, second) => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, ".env.example"),
      `DATABASE_URL=mysql://appuser:password@db:3306/example\n${key}=${first}\n`,
    );
    createRunEnvironment(directory, false, {});
    writeFileSync(
      join(directory, ".env"),
      `DATABASE_URL=mysql://appuser:password@db:3306/example\n${key}=${second}\n`,
    );

    expect(() => createRunEnvironment(directory, false, {})).toThrow(`${key} differs`);
    expect(() => createRunEnvironment(directory, false, {})).toThrow("docker compose down -v");
  });

  it("rejects database credentials with URL-reserved characters", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, ".env"),
      "DB_PASSWORD=contains:colon\nDATABASE_URL=mysql://appuser:${DB_PASSWORD}@db:3306/example\n",
    );

    expect(() => createRunEnvironment(directory, false, {})).toThrow("DB_PASSWORD must use only URL-safe");
  });

  it("does not write verification state in --no-docker mode", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, ".env.example"), "DATABASE_URL=mysql://appuser:secret@db:3306/example\n");

    const environment = createRunEnvironment(directory, true, {});

    expect(existsSync(join(directory, ".wp-transfer", "verification.env"))).toBe(false);
    expect(environment.COMPOSE_PROJECT_NAME).toBeUndefined();
  });

  it("uses a supplied database password when the URL contains it", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, ".env"),
      "DATABASE_URL=mysql://appuser:provided-secret@db:3306/example\n",
    );

    const environment = createRunEnvironment(directory, false, {});

    expect(environment.DB_USER).toBe("appuser");
    expect(environment.DB_PASSWORD).toBe("provided-secret");
    expect(environment.DATABASE_URL).toBe("mysql://appuser:provided-secret@localhost:3306/example");
  });

  it("replaces a URL password placeholder instead of reusing it", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, ".env.example"),
      "DATABASE_URL=mysql://appuser:change-me@db:3306/example\n",
    );

    const environment = createRunEnvironment(directory, false, {});

    expect(environment.DB_PASSWORD).toHaveLength(32);
    expect(environment.DB_PASSWORD).not.toBe("change-me");
    expect(environment.DATABASE_URL).toContain(`:${environment.DB_PASSWORD}@localhost:`);
  });

  it("keeps Docker and Prisma credentials aligned when DB_PASSWORD is explicit", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, ".env"),
      [
        "DB_PASSWORD=compose-secret",
        "DATABASE_URL=mysql://appuser:different-secret@db:3306/example",
      ].join("\n"),
    );

    const environment = createRunEnvironment(directory, false, {});

    expect(environment.DB_PASSWORD).toBe("compose-secret");
    expect(environment.DATABASE_URL).toBe("mysql://appuser:compose-secret@localhost:3306/example");
  });

  it("refuses a non-local database URL in Docker verification mode", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, ".env"),
      "DATABASE_URL=mysql://admin:secret@production.example.com:3306/live\n",
    );

    expect(() => createRunEnvironment(directory, false, {})).toThrow(
      "refuses non-local DATABASE_URL",
    );
  });

  it("requires an explicitly validated database URL in Docker verification mode", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-run-env-"));
    temporaryDirectories.push(directory);

    expect(() => createRunEnvironment(directory, false, {})).toThrow(
      "requires DATABASE_URL",
    );
  });
});

describe("createComposeProjectName", () => {
  it("isolates same-basename projects while remaining stable for repeated runs", () => {
    const root = mkdtempSync(join(tmpdir(), "wp-transfer-compose-name-"));
    temporaryDirectories.push(root);
    const first = join(root, "first", "site");
    const second = join(root, "second", "site");
    mkdirSync(first, { recursive: true });
    mkdirSync(second, { recursive: true });

    const firstName = createComposeProjectName(first);
    const secondName = createComposeProjectName(second);

    expect(createComposeProjectName(first)).toBe(firstName);
    expect(firstName).not.toBe(secondName);
    expect(firstName).toMatch(/^wp-transfer-site-[a-f0-9]{12}$/);
    expect(firstName.length).toBeLessThanOrEqual(63);
  });
});

describe("generateCoverageReport", () => {
  it("reports a complete verification with domain-level results", () => {
    const report = generateCoverageReport({
      phpScripts: 2,
      testsGenerated: 2,
      testsPassed: 2,
      testsFailed: 0,
      domains: [
        { name: "catalog", scripts: 1, tested: 1, passed: 1 },
        { name: "accounts", scripts: 1, tested: 1, passed: 1 },
      ],
    });

    expect(report).toContain("Tests Generated**: 2 (100%)");
    expect(report).toContain("| catalog | 1 | 1 | 1 | OK |");
    expect(report).toContain("COMPLETE");
  });

  it("reports incomplete verification without dividing by zero", () => {
    const report = generateCoverageReport({
      phpScripts: 3,
      testsGenerated: 0,
      testsPassed: 0,
      testsFailed: 1,
      domains: [{ name: "catalog", scripts: 3, tested: 0, passed: 0 }],
    });

    expect(report).toContain("Tests Passed**: 0 / 0 (0%)");
    expect(report).toContain("| catalog | 3 | 0 | 0 | NG |");
    expect(report).toContain("INCOMPLETE — Coverage 0%, Pass rate 0%");
  });
});

describe("validateIsolatedDockerDatabase", () => {
  function createGeneratedProject(provider: "mysql" | "postgresql"): string {
    const root = mkdtempSync(join(tmpdir(), "wp-transfer-compose-"));
    temporaryDirectories.push(root);
    const directory = join(root, "demo-site");
    mkdirSync(directory);
    const compose = generateDockerScaffold("demo-site", provider)
      .find((file) => file.path === "docker-compose.yml")!.content;
    writeFileSync(join(directory, "docker-compose.yml"), compose);
    return directory;
  }

  it.each([
    ["mysql", 3306, "demo_site", "mysql://user:password@localhost:3306/demo_site"],
    ["postgresql", 5432, "demo_site", "postgresql://user:password@127.0.0.1:5432/demo_site"],
  ] as const)("accepts the canonical generated %s database URL", (provider, port, database, url) => {
    const directory = createGeneratedProject(provider);

    expect(() => validateIsolatedDockerDatabase(directory, url)).not.toThrow();
  });

  it.each([
    ["alternate local port", "mysql://user:password@localhost:3307/demo_site", "port"],
    ["alternate local database", "mysql://user:password@localhost:3306/other_db", "database"],
    ["alternate protocol", "postgresql://user:password@localhost:3306/demo_site", "protocol"],
    ["socket query parameter", "mysql://user:password@localhost:3306/demo_site?socket=/tmp/other.sock", "must not include query parameters or fragments"],
    ["URL fragment", "mysql://user:password@localhost:3306/demo_site#other-target", "must not include query parameters or fragments"],
  ])("rejects an %s", (_description, url, reason) => {
    const directory = createGeneratedProject("mysql");

    expect(() => validateIsolatedDockerDatabase(directory, url)).toThrow(
      `isolated generated Docker DB: DATABASE_URL ${reason}`,
    );
  });

  it("fails closed for a compose file without the generated marker", () => {
    const directory = mkdtempSync(join(tmpdir(), "wp-transfer-compose-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, "docker-compose.yml"), "services:\n  db: {}\n");

    expect(() => validateIsolatedDockerDatabase(directory, "mysql://user:password@localhost:3306/demo_site"))
      .toThrow("isolated generated Docker DB: unrecognized docker-compose.yml");
  });

  it.each([
    ["an external named volume", "    volumes:\n      - external_db:/var/lib/mysql\n", "volumes:\n  external_db:\n    external: true\n"],
    ["a host bind mount", "    volumes:\n      - /host/database:/var/lib/mysql\n", ""],
  ])("rejects %s even when the marker and connection fields remain", (_description, dbVolume, volumeDefinition) => {
    const directory = createGeneratedProject("mysql");
    const composePath = join(directory, "docker-compose.yml");
    const original = readFileSync(composePath, "utf8");
    const modified = original
      .replace("    volumes:\n      - db_data:/var/lib/mysql\n", dbVolume)
      .replace("volumes:\n  db_data:\n", `volumes:\n${volumeDefinition}`);
    writeFileSync(composePath, modified);

    expect(() => validateIsolatedDockerDatabase(directory, "mysql://user:password@localhost:3306/demo_site"))
      .toThrow("canonical generated manifest");
  });
});
