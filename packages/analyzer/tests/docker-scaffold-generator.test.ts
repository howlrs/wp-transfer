import { describe, it, expect } from "vitest";
import { generateDockerScaffold } from "../src/docker-scaffold-generator.js";
import type { DockerScaffoldFile } from "../src/docker-scaffold-generator.js";

// ── Helpers ──

function findFile(files: DockerScaffoldFile[], pathPattern: string): DockerScaffoldFile | undefined {
  return files.find((f) => f.path === pathPattern);
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
      expect(verify!.content).toContain("prisma migrate deploy");
      expect(verify!.content).toContain("playwright test");
    });
  });

  describe("MySQL configuration", () => {
    it("uses mysql:8.0 image", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("mysql:8.0");
    });

    it("uses port 3306", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("3306:3306");
    });

    it("uses mysql connection string in .env.example", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envExample = findFile(files, ".env.example")!;
      expect(envExample.content).toContain("mysql://");
      expect(envExample.content).toContain("my-project");
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

    it("uses port 5432", () => {
      const files = generateDockerScaffold("my-project", "postgresql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("5432:5432");
    });

    it("uses postgresql connection string in .env.example", () => {
      const files = generateDockerScaffold("my-project", "postgresql");
      const envExample = findFile(files, ".env.example")!;
      expect(envExample.content).toContain("postgresql://");
      expect(envExample.content).toContain("my-project");
    });

    it("uses pg_isready healthcheck", () => {
      const files = generateDockerScaffold("my-project", "postgresql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("pg_isready");
    });
  });

  describe("project name substitution", () => {
    it("uses project name in database configuration", () => {
      const files = generateDockerScaffold("jra-tokyo", "mysql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("jra-tokyo");
    });

    it("uses project name in .env.example", () => {
      const files = generateDockerScaffold("jra-tokyo", "mysql");
      const envExample = findFile(files, ".env.example")!;
      expect(envExample.content).toContain("jra-tokyo");
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

    it("contains placeholder AUTH_SECRET", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envExample = findFile(files, ".env.example")!;
      expect(envExample.content).toContain('AUTH_SECRET="your-secret-here"');
    });

    it("uses placeholder credentials", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envExample = findFile(files, ".env.example")!;
      expect(envExample.content).toContain("USER:PASSWORD");
    });
  });

  describe(".gitignore", () => {
    it("includes .env", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const gitignore = findFile(files, ".gitignore")!;
      expect(gitignore.content).toContain(".env");
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

    it("app command includes prisma migrate deploy", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const compose = findFile(files, "docker-compose.yml")!;
      expect(compose.content).toContain("prisma migrate deploy");
    });
  });
});
