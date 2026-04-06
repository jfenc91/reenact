#!/usr/bin/env node

import { program } from "commander";
import * as fs from "fs";
import { parse as parseYaml } from "yaml";
import { runScript, describeStep, normalizeStep, KNOWN_ACTIONS, type Script } from "./runner.js";

program
  .name("reenact")
  .description("Reenact human-like web UI navigation from YAML scripts")
  .version("0.1.0")
  .argument("<script>", "YAML file describing the navigation steps")
  .option("-o, --output <path>", "Output video path (default: <script>.webm)")
  .option("--format <fmt>", "Output format: webm or mp4 (default: webm)")
  .option("--dry-run", "Parse and validate the YAML without launching a browser")
  .option("--headed", "Run with a visible browser window")
  .option("--slow-mo <ms>", "Slow down actions by N ms", "0")
  .action(async (scriptPath: string, opts: any) => {
    if (!fs.existsSync(scriptPath)) {
      console.error(`Error: file not found: ${scriptPath}`);
      process.exit(1);
    }

    const raw = fs.readFileSync(scriptPath, "utf-8");
    const data = parseYaml(raw) as Script;

    if (!data || !data.steps) {
      console.error("Error: script must contain a 'steps' key");
      process.exit(1);
    }

    if (opts.dryRun) {
      let hasError = false;
      for (let i = 0; i < data.steps.length; i++) {
        const step = data.steps[i];
        const obj = normalizeStep(step);
        const action = Object.keys(obj)[0];
        const desc = describeStep(step);
        if (!KNOWN_ACTIONS.has(action)) {
          console.error(` \u2717 ${desc}  [unknown action "${action}"]`);
          hasError = true;
        } else {
          console.log(` \u2713 ${desc}`);
        }
      }
      process.exit(hasError ? 1 : 0);
    }

    if (opts.format && !["webm", "mp4"].includes(opts.format)) {
      console.error(`Error: --format must be "webm" or "mp4", got "${opts.format}"`);
      process.exit(1);
    }

    // Determine output extension: explicit -o wins, then --format, then default .webm
    const ext = opts.format || "webm";
    const output = opts.output || scriptPath.replace(/\.\w+$/, `.${ext}`);

    console.log(`Running ${data.steps.length} steps...`);

    try {
      const result = await runScript(data, {
        outputPath: output,
        headless: !opts.headed,
        slowMo: parseInt(opts.slowMo, 10),
      });
      console.log(`Video saved to ${result}`);
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program.parse();
