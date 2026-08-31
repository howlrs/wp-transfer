import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateDockerScaffold } from "../src/docker-scaffold-generator.js";
import type { DockerScaffoldFile } from "../src/docker-scaffold-generator.js";

// ── Helpers ──

function findFile(files: DockerScaffoldFile[], pathPattern: string): DockerScaffoldFile | undefined {
  return files.find((f) => f.path === pathPattern);
}

async function runVerifyValidation(
  databaseUrl: string,
  user = "appuser",
  password = ["safe", "-password"].join(""),
  mutateCompose?: (content: string) => string,
  projectDirectory?: string,
): Promise<{ stderr: string; setupEnvironment: string }> {
  const temporaryRoot = projectDirectory ? undefined : await mkdtemp(join(tmpdir(), "wp-transfer-verify-"));
  const dir = projectDirectory ?? temporaryRoot!;
  const generatedFiles = generateDockerScaffold("sample-site", "mysql");
  const script = findFile(generatedFiles, "scripts/verify.sh")!;
  const compose = findFile(generatedFiles, "docker-compose.yml")!;
  const binDir = join(dir, "bin");
  const setupLog = join(dir, "setup-env.log");
  try {
    await writeFile(join(dir, "verify.sh"), script.content, "utf8");
    await writeFile(join(dir, "docker-compose.yml"), mutateCompose ? mutateCompose(compose.content) : compose.content, "utf8");
    await mkdir(binDir, { recursive: true });
    await writeFile(join(dir, "bin", "npm"), `#!/bin/bash
printf 'npm DATABASE_URL=%s AUTH_SECRET=%s SEED_ADMIN_PASSWORD=%s E2E_ADMIN_PASSWORD=%s GITHUB_TOKEN=%s AWS_SECRET_ACCESS_KEY=%s SSH_AUTH_SOCK=%s\\n' "\${DATABASE_URL-}" "\${AUTH_SECRET-}" "\${SEED_ADMIN_PASSWORD-}" "\${E2E_ADMIN_PASSWORD-}" "\${GITHUB_TOKEN-}" "\${AWS_SECRET_ACCESS_KEY-}" "\${SSH_AUTH_SOCK-}" >> "${setupLog}"
`, "utf8");
    await writeFile(join(dir, "bin", "npx"), `#!/bin/bash
printf 'npx DATABASE_URL=%s AUTH_SECRET=%s SEED_ADMIN_PASSWORD=%s E2E_ADMIN_PASSWORD=%s GITHUB_TOKEN=%s AWS_SECRET_ACCESS_KEY=%s SSH_AUTH_SOCK=%s\\n' "\${DATABASE_URL-}" "\${AUTH_SECRET-}" "\${SEED_ADMIN_PASSWORD-}" "\${E2E_ADMIN_PASSWORD-}" "\${GITHUB_TOKEN-}" "\${AWS_SECRET_ACCESS_KEY-}" "\${SSH_AUTH_SOCK-}" >> "${setupLog}"
`, "utf8");
    await writeFile(join(dir, "bin", "docker"), `#!/bin/bash
printf 'docker COMPOSE_PROJECT_NAME=%s\\n' "\${COMPOSE_PROJECT_NAME-}" >> "${setupLog}"
exit 1
`, "utf8");
    await chmod(join(dir, "bin", "npm"), 0o755);
    await chmod(join(dir, "bin", "npx"), 0o755);
    await chmod(join(dir, "bin", "docker"), 0o755);
    await writeFile(join(dir, ".env"), [
      "AUTH_SECRET=local-auth-secret",
      `DB_USER=${user}`,
      `DB_PASSWORD=${password}`,
      "DB_ROOT_PASSWORD=local-root-password",
      `DATABASE_URL=${databaseUrl}`,
      "SEED_ADMIN_PASSWORD=seed-admin-password",
      "SEED_EDITOR_PASSWORD=seed-editor-password",
      "E2E_ADMIN_PASSWORD=e2e-admin-password",
    ].join("\n"), "utf8");
    try {
      execFileSync("bash", ["verify.sh"], {
        cwd: dir,
        encoding: "utf8",
        stdio: "pipe",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          GITHUB_TOKEN: "developer-token",
          AWS_SECRET_ACCESS_KEY: "developer-cloud-secret",
          SSH_AUTH_SOCK: "/tmp/developer-agent.sock",
        },
      });
      throw new Error("verify.sh unexpectedly continued past database validation");
    } catch (error) {
      const result = error as { stderr?: string };
      return {
        stderr: result.stderr ?? "",
        setupEnvironment: await readFile(setupLog, "utf8").catch(() => ""),
      };
    }
  } finally {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  }
}

// ── Tests ──

describe("Docker Scaffold Generator", () => {
  describe("file generation", () => {
    it("generates 7 files (docker-compose, Dockerfile, .env.example, .gitignore, .dockerignore, health endpoint, verify.sh)", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      expect(files).toHaveLength(7);
    });

    it("generates docker-compose.yml", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const compose = findFile(files, "docker-compose.yml");
      expect(compose).toBeDefined();
    });

    it("generates Dockerfile", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const dockerfile = findFile(files, "Dockerfile");
      expect(dockerfile).toBeDefined();
    });

    it("does NOT generate .env (security: no hardcoded secrets)", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envFile = findFile(files, ".env");
      expect(envFile).toBeUndefined();
    });

    it("generates .env.example", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envExample = findFile(files, ".env.example");
      expect(envExample).toBeDefined();
    });

    it("generates .gitignore", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const gitignore = findFile(files, ".gitignore");
      expect(gitignore).toBeDefined();
    });

    it("generates .dockerignore with node_modules", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const dockerignore = findFile(files, ".dockerignore");
      expect(dockerignore).toBeDefined();
      expect(dockerignore!.content).toContain("node_modules");
      expect(dockerignore!.content).toContain(".wp-transfer");
      expect(dockerignore!.content).toContain("e2e/.auth");
      expect(dockerignore!.content).toContain(".env*");
      expect(dockerignore!.content).toContain("!.env.example");
    });

    it("generates app/api/health/route.ts", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const health = findFile(files, "app/api/health/route.ts");
      expect(health).toBeDefined();
      expect(health!.content).toContain("NextResponse");
    });

    it("generates scripts/verify.sh", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const verify = findFile(files, "scripts/verify.sh");
      expect(verify).toBeDefined();
      expect(verify!.content).toContain("#!/bin/bash");
      expect(verify!.content).toContain("npm ci");
      expect(verify!.content).toContain("npm install");
      expect(verify!.content).toContain("prisma db push");
      expect(verify!.content).toContain("playwright test");
      expect(verify!.content).toContain("DB_PASSWORD:?Set DB_PASSWORD");
      expect(verify!.content).toContain("must use only URL-safe letters");
      expect(verify!.content).toContain("trap cleanup EXIT");
      expect(verify!.content).toContain("source .env");
      expect(verify!.content).toContain("@db:/@localhost:");
      expect(verify!.content).toContain("new URL(databaseUrl)");
      expect(verify!.content).toContain("Refusing verification before Docker/schema operations");
      expect(verify!.content).not.toContain("Docker not available, skipping");
      expect(verify!.content).not.toContain("Seed failed (non-critical)");
    });

    it("refuses a remote DATABASE_URL before Docker or schema operations", async () => {
      const result = await runVerifyValidation("mysql://appuser:safe-password@database.example:3306/sample_site");
      expect(result.stderr).toContain("DATABASE_URL must target localhost");
      expect(result.stderr).toContain("before Docker/schema operations");
      expect(result.setupEnvironment).toBe("");
    });

    it("refuses a local URL whose credentials differ from DB_USER and DB_PASSWORD", async () => {
      const result = await runVerifyValidation("mysql://other:safe-password@localhost:3306/sample_site");
      expect(result.stderr).toContain("DATABASE_URL credentials must match DB_USER and DB_PASSWORD");
    });

    it.each([
      ["a socket query", "mysql://appuser:safe-password@localhost:3306/sample_site?socket=/tmp/other.sock", "query parameters or fragments"],
      ["a fragment", "mysql://appuser:safe-password@localhost:3306/sample_site#other-target", "query parameters or fragments"],
      ["another database", "mysql://appuser:safe-password@localhost:3306/other_database", "generated Docker database name"],
    ])("refuses %s before setup or schema operations", async (_description, databaseUrl, message) => {
      const result = await runVerifyValidation(databaseUrl);
      expect(result.stderr).toContain(message);
      expect(result.setupEnvironment).toBe("");
    });

    it("refuses a marker-preserving external volume manifest before setup", async () => {
      const result = await runVerifyValidation(
        "mysql://appuser:safe-password@localhost:3306/sample_site",
        "appuser",
        "safe-password",
        (compose) => compose
          .replace("    volumes:\n      - db_data:/var/lib/mysql\n", "    volumes:\n      - external_db:/var/lib/mysql\n")
          .replace("volumes:\n  db_data:\n", "volumes:\n  external_db:\n    external: true\n"),
      );
      expect(result.stderr).toContain("canonical generated manifest");
      expect(result.setupEnvironment).toBe("");
    });

    it("scrubs project secrets from npm and Playwright setup environments", async () => {
      const result = await runVerifyValidation("mysql://appuser:safe-password@localhost:3306/sample_site");
      expect(result.setupEnvironment).toContain("npm DATABASE_URL= AUTH_SECRET= SEED_ADMIN_PASSWORD= E2E_ADMIN_PASSWORD=");
      expect(result.setupEnvironment).toContain("npx DATABASE_URL= AUTH_SECRET= SEED_ADMIN_PASSWORD= E2E_ADMIN_PASSWORD=");
      expect(result.setupEnvironment).toContain("GITHUB_TOKEN= AWS_SECRET_ACCESS_KEY= SSH_AUTH_SOCK=");
    });

    it("uses stable, distinct Compose namespaces for same-basename projects", async () => {
      const root = await mkdtemp(join(tmpdir(), "wp-transfer-verify-namespace-"));
      const first = join(root, "first", "same-site");
      const second = join(root, "second", "same-site");
      await mkdir(first, { recursive: true });
      await mkdir(second, { recursive: true });
      try {
        const firstRun = await runVerifyValidation(
          "mysql://appuser:safe-password@localhost:3306/sample_site",
          "appuser", "safe-password", undefined, first,
        );
        const repeatRun = await runVerifyValidation(
          "mysql://appuser:safe-password@localhost:3306/sample_site",
          "appuser", "safe-password", undefined, first,
        );
        const secondRun = await runVerifyValidation(
          "mysql://appuser:safe-password@localhost:3306/sample_site",
          "appuser", "safe-password", undefined, second,
        );
        const composeName = (result: { setupEnvironment: string }) =>
          /docker COMPOSE_PROJECT_NAME=([^\n]+)/.exec(result.setupEnvironment)?.[1];

        expect(composeName(firstRun)).toMatch(/^wp-transfer-same-site-[a-f0-9]{12}$/);
        expect(composeName(repeatRun)).toBe(composeName(firstRun));
        expect(composeName(secondRun)).not.toBe(composeName(firstRun));
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });

  describe("MySQL configuration", () => {
    it("uses mysql:8.0 image", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("mysql:8.0");
    });

    it("binds port 3306 to localhost only", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("127.0.0.1:3306:3306");
    });

    it("binds the generated application to localhost only", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("127.0.0.1:3000:3000");
    });

    it("uses mysql connection string in .env.example", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envExample = findFile(files, ".env.example")!;
      expect(envExample.content).toContain("mysql://");
      expect(envExample.content).toContain("my_project");
    });

    it("uses mysql healthcheck", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("mysqladmin");
    });
  });

  describe("PostgreSQL configuration", () => {
    it("uses postgres:16 image", () => {
      const files = generateDockerScaffold("my-project", "postgresql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("postgres:16");
    });

    it("binds port 5432 to localhost only", () => {
      const files = generateDockerScaffold("my-project", "postgresql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("127.0.0.1:5432:5432");
    });

    it("uses postgresql connection string in .env.example", () => {
      const files = generateDockerScaffold("my-project", "postgresql");
      const envExample = findFile(files, ".env.example")!;
      expect(envExample.content).toContain("postgresql://");
      expect(envExample.content).toContain("my_project");
    });

    it("uses pg_isready healthcheck", () => {
      const files = generateDockerScaffold("my-project", "postgresql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("pg_isready");
    });
  });

  describe("project name substitution", () => {
    it("uses project name in database configuration", () => {
      const files = generateDockerScaffold("sample-site", "mysql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("sample_site");
    });

    it("uses project name in .env.example", () => {
      const files = generateDockerScaffold("sample-site", "mysql");
      const envExample = findFile(files, ".env.example")!;
      expect(envExample.content).toContain("sample_site");
    });

    it("sanitizes unsafe project-name characters in database configuration", () => {
      const files = generateDockerScaffold("Demo Site: 2026", "mysql");
      const compose = findFile(files, "docker-compose.yml")!;

      expect(compose.content).toContain("MYSQL_DATABASE: demo_site_2026");
      expect(compose.content).not.toContain("Demo Site: 2026");
    });
  });

  describe("Dockerfile content", () => {
    it("uses node:20-slim base image", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const dockerfile = findFile(files, "Dockerfile")!;
      expect(dockerfile.content).toContain("node:20-slim");
    });

    it("uses npm (not pnpm) for package management", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const dockerfile = findFile(files, "Dockerfile")!;
      expect(dockerfile.content).toContain("npm ci");
      expect(dockerfile.content).toContain("if [ -f package-lock.json ]; then npm ci; else npm install; fi");
      expect(dockerfile.content).toContain("npm run build");
      expect(dockerfile.content).not.toContain("pnpm");
      expect(dockerfile.content).not.toContain("corepack");
    });

    it("includes prisma generate step", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const dockerfile = findFile(files, "Dockerfile")!;
      expect(dockerfile.content).toContain("prisma generate");
    });

    it("uses multi-stage build", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const dockerfile = findFile(files, "Dockerfile")!;
      expect(dockerfile.content).toContain("AS deps");
      expect(dockerfile.content).toContain("AS builder");
      expect(dockerfile.content).toContain("AS runner");
    });
  });

  describe(".env.example", () => {
    it("contains setup comments including openssl rand", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envExample = findFile(files, ".env.example")!;
      expect(envExample.content).toContain("openssl rand -base64 32");
    });

    it("contains AUTH_SECRET", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envExample = findFile(files, ".env.example")!;
      expect(envExample.content).toContain("AUTH_SECRET=");
    });

    it("leaves local seed and verification credentials unset", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envExample = findFile(files, ".env.example")!;

      expect(envExample.content).toContain('SEED_ADMIN_PASSWORD=""');
      expect(envExample.content).toContain('SEED_EDITOR_PASSWORD=""');
      expect(envExample.content).toContain('E2E_ADMIN_PASSWORD=""');
    });

    it("requires an auth secret in Docker Compose", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const compose = findFile(files, "docker-compose.yml")!;

      expect(compose.content).toContain("AUTH_SECRET=${AUTH_SECRET:?");
      expect(compose.content).not.toContain("change-me-generate");
    });

    it("requires database credentials rather than embedding fixed passwords", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envExample = findFile(files, ".env.example")!;
      const compose = findFile(files, "docker-compose.yml")!;

      expect(envExample.content).toContain('DB_PASSWORD=""');
      expect(envExample.content).toContain('DB_ROOT_PASSWORD=""');
      expect(envExample.content).toContain("${DB_USER}:${DB_PASSWORD}@db:");
      expect(compose.content).toContain("DB_PASSWORD:?Set DB_PASSWORD");
      expect(compose.content).toContain("DB_ROOT_PASSWORD:?Set DB_ROOT_PASSWORD");
      expect(compose.content).not.toContain("apppassword");
    });
  });

  describe(".gitignore", () => {
    it("includes .env", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const gitignore = findFile(files, ".gitignore")!;
      expect(gitignore.content).toContain(".env");
    });

    it("ignores all environment files except the safe example", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const gitignore = findFile(files, ".gitignore")!;
      const dockerignore = findFile(files, ".dockerignore")!;

      for (const content of [gitignore.content, dockerignore.content]) {
        expect(content).toContain(".env*");
        expect(content).toContain("!.env.example");
        expect(content.indexOf(".env*")).toBeLessThan(content.indexOf("!.env.example"));
        expect(content).not.toContain(".env.production\n!");
      }
    });

    it("ignores generated credentials, reports, and uploads", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const gitignore = findFile(files, ".gitignore")!;

      expect(gitignore.content).toContain("e2e/.auth/");
      expect(gitignore.content).toContain(".wp-transfer/");
      expect(gitignore.content).toContain("test-results/");
      expect(gitignore.content).toContain("playwright-report/");
      expect(gitignore.content).toContain("public/uploads/*");
    });

    it("includes node_modules/ and .next/", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const gitignore = findFile(files, ".gitignore")!;
      expect(gitignore.content).toContain("node_modules/");
      expect(gitignore.content).toContain(".next/");
    });
  });

  describe("docker-compose DX", () => {
    it("healthcheck uses /api/health", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("/api/health");
      expect(compose.content).not.toContain("/api/auth/session");
    });

    it("app command starts server directly", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("server.js");
    });
  });
});
