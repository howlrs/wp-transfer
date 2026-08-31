import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(workspaceRoot, "fixtures/wxr/minimal.xml");
const temporaryRoot = mkdtempSync(join(tmpdir(), "wp-transfer-package-smoke-"));
const packageDirectory = join(temporaryRoot, "package");
const installDirectory = join(temporaryRoot, "consumer");

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_update_notifier: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

try {
  mkdirSync(packageDirectory);
  mkdirSync(installDirectory);
  run("pnpm", ["--filter", "wp-transfer", "pack", "--pack-destination", packageDirectory], workspaceRoot);

  const archives = readdirSync(packageDirectory).filter((name) => name.endsWith(".tgz"));
  if (archives.length !== 1) {
    throw new Error(`Expected one package archive, found ${archives.length}`);
  }

  const archivePath = join(packageDirectory, archives[0]);
  run("npm", ["init", "--yes"], installDirectory);
  run("npm", ["install", "--ignore-scripts", archivePath], installDirectory);

  const installedPackage = join(installDirectory, "node_modules/wp-transfer");
  const manifest = JSON.parse(readFileSync(join(installedPackage, "package.json"), "utf8"));
  const runtimeDependencies = Object.values(manifest.dependencies ?? {});
  if (runtimeDependencies.some((value) => String(value).startsWith("workspace:"))) {
    throw new Error("Packed CLI leaks a workspace runtime dependency");
  }
  if (!existsSync(join(installedPackage, "LICENSE")) || !existsSync(join(installedPackage, "README.md"))) {
    throw new Error("Packed CLI is missing its license or package documentation");
  }

  const executable = join(
    installDirectory,
    "node_modules/.bin",
    process.platform === "win32" ? "wp-transfer.cmd" : "wp-transfer",
  );
  const help = run(executable, ["--help"], installDirectory);
  if (!help.includes("analyze")) {
    throw new Error("Packed CLI help does not list the analyze command");
  }

  const reportPath = join(installDirectory, "minimal-report");
  run(executable, ["analyze", fixturePath, "--output", reportPath, "--format", "json"], installDirectory);

  const jsonPath = `${reportPath}.json`;
  if (!existsSync(jsonPath)) {
    throw new Error("Packed CLI did not create the expected JSON report");
  }

  const report = JSON.parse(readFileSync(jsonPath, "utf8"));
  if (typeof report.siteUrl !== "string" || typeof report.contentSummary?.posts !== "number") {
    throw new Error("Packed CLI created an invalid migration report");
  }

  process.stdout.write("Packed CLI installed and analyzed the synthetic WXR fixture successfully.\n");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
