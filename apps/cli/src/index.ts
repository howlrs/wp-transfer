#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { defineCommand, runMain } from "citty";
import { analyzeCommand } from "./commands/analyze.js";
import { analyzePhpCommand } from "./commands/analyze-php.js";
import { runCommand } from "./commands/run.js";

const packageManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const main = defineCommand({
  meta: {
    name: "wp-transfer",
    version: packageManifest.version,
    description: "WordPress → Next.js migration accelerator",
  },
  subCommands: {
    analyze: analyzeCommand,
    "analyze-php": analyzePhpCommand,
    run: runCommand,
  },
});

runMain(main);
