#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { analyzeCommand } from "./commands/analyze.js";
import { analyzePhpCommand } from "./commands/analyze-php.js";

const main = defineCommand({
  meta: {
    name: "wp-transfer",
    version: "0.1.0",
    description: "WordPress → Next.js migration accelerator",
  },
  subCommands: {
    analyze: analyzeCommand,
    "analyze-php": analyzePhpCommand,
  },
});

runMain(main);
