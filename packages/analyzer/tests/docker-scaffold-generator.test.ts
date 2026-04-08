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
    it("generates 4 files (docker-compose, Dockerfile, .env, .env.example)", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      expect(files).toHaveLength(4);
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

    it("generates .env", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envFile = findFile(files, ".env");
      expect(envFile).toBeDefined();
    });

    it("generates .env.example", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envExample = findFile(files, ".env.example");
      expect(envExample).toBeDefined();
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

    it("uses mysql connection string in .env", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envFile = findFile(files, ".env")!;
      expect(envFile.content).toContain("mysql://");
      expect(envFile.content).toContain("my-project");
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

    it("uses postgresql connection string in .env", () => {
      const files = generateDockerScaffold("my-project", "postgresql");
      const envFile = findFile(files, ".env")!;
      expect(envFile.content).toContain("postgresql://");
      expect(envFile.content).toContain("my-project");
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

    it("includes pnpm setup", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const dockerfile = findFile(files, "Dockerfile")!;
      expect(dockerfile.content).toContain("pnpm");
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

  describe(".env files", () => {
    it(".env contains AUTH_SECRET", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envFile = findFile(files, ".env")!;
      expect(envFile.content).toContain("AUTH_SECRET=");
    });

    it(".env.example contains placeholder AUTH_SECRET", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envExample = findFile(files, ".env.example")!;
      expect(envExample.content).toContain('AUTH_SECRET="your-secret-here"');
    });

    it(".env.example uses placeholder credentials", () => {
      const files = generateDockerScaffold("my-project", "mysql");
      const envExample = findFile(files, ".env.example")!;
      expect(envExample.content).toContain("USER:PASSWORD");
    });
  });
});
