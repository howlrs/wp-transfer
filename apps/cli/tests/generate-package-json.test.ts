import { describe, it, expect } from "vitest";
import { generatePackageJson, sortTablesByFkDependency } from "../src/commands/analyze-php";
import type { TableDefinition } from "@wp-transfer/analyzer";

describe("generatePackageJson", () => {
  const pkg = JSON.parse(generatePackageJson("test-project"));

  it("sets project name and version", () => {
    expect(pkg.name).toBe("test-project");
    expect(pkg.version).toBe("0.1.0");
    expect(pkg.private).toBe(true);
  });

  it("includes playwright in devDependencies", () => {
    expect(pkg.devDependencies["@playwright/test"]).toBeDefined();
  });

  it("includes tsx in devDependencies", () => {
    expect(pkg.devDependencies.tsx).toBeDefined();
  });

  it("includes test scripts", () => {
    expect(pkg.scripts.test).toBe("playwright test");
    expect(pkg.scripts["test:report"]).toBe("playwright show-report");
  });

  it("includes db scripts", () => {
    expect(pkg.scripts["db:migrate"]).toBe("prisma migrate dev");
    expect(pkg.scripts["db:migrate:deploy"]).toBe("prisma migrate deploy");
    expect(pkg.scripts["db:seed"]).toBe("prisma db seed");
    expect(pkg.scripts["db:studio"]).toBe("prisma studio");
  });

  it("includes setup and verify scripts", () => {
    expect(pkg.scripts.setup).toContain("prisma");
    expect(pkg.scripts.verify).toContain("verify.sh");
  });

  it("includes prisma seed config", () => {
    expect(pkg.prisma.seed).toContain("tsx");
  });

  it("pins next-auth to 5.0.0-beta.30 (v5 stable not yet on npm)", () => {
    expect(pkg.dependencies["next-auth"]).toBe("5.0.0-beta.30");
  });
});

describe("sortTablesByFkDependency", () => {
  const col = (name: string, type = "String") => ({
    name,
    type,
    nullable: false,
    isPrimary: name === "id",
    isAutoIncrement: name === "id",
  });

  it("puts FK parent tables before children", () => {
    const tables: TableDefinition[] = [
      { name: "lottery", columns: [col("id"), col("user_id", "Int")] },
      { name: "user", columns: [col("id"), col("name")] },
    ];
    const sorted = sortTablesByFkDependency(tables);
    const names = sorted.map(t => t.name);
    expect(names.indexOf("user")).toBeLessThan(names.indexOf("lottery"));
  });

  it("returns tables unchanged when no FK columns exist", () => {
    const tables: TableDefinition[] = [
      { name: "category", columns: [col("id"), col("title")] },
      { name: "tag", columns: [col("id"), col("label")] },
    ];
    const sorted = sortTablesByFkDependency(tables);
    expect(sorted.map(t => t.name)).toEqual(["category", "tag"]);
  });

  it("handles multi-level dependencies", () => {
    const tables: TableDefinition[] = [
      { name: "comment", columns: [col("id"), col("post_id", "Int")] },
      { name: "post", columns: [col("id"), col("user_id", "Int")] },
      { name: "user", columns: [col("id"), col("name")] },
    ];
    const sorted = sortTablesByFkDependency(tables);
    const names = sorted.map(t => t.name);
    expect(names.indexOf("user")).toBeLessThan(names.indexOf("post"));
    expect(names.indexOf("post")).toBeLessThan(names.indexOf("comment"));
  });
});
