#!/usr/bin/env node
/**
 * Write an empty results object to web/public/data/results.json (or --results path).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { results: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--results") out.results = argv[++i];
    else if (argv[i] === "-h" || argv[i] === "--help") out.help = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`
Usage:
  node scripts/reset-results.mjs [--results <path/to/results.json>]

Default results path: web/public/data/results.json (from repo root spreadMadness/)
`);
    process.exit(0);
  }

  const root = path.join(__dirname, "..");
  const resultsPath =
    args.results != null
      ? path.resolve(args.results)
      : path.join(root, "web/public/data/results.json");

  fs.writeFileSync(resultsPath, "{}\n", "utf8");
  console.log(`Reset ${resultsPath} to {}`);
}

main();
