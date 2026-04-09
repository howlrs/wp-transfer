import { describe, it, expect } from "vitest";
import { runCommand } from "../src/commands/run.js";

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
});
