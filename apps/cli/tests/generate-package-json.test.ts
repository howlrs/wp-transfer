import { describe, it, expect } from "vitest";
import { generatePackageJson } from "../src/commands/analyze-php";

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
});
