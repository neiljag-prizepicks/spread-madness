#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { overlay: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--overlay") out.overlay = argv[++i];
    else if (argv[i] === "-h" || argv[i] === "--help") out.help = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`
Usage: node scripts/reset-game-overlay.mjs [--overlay <path>]

Default: web/public/data/game_schedule_and_lines.json
`);
    process.exit(0);
  }
  const root = path.join(__dirname, "..");
  const p =
    args.overlay != null
      ? path.resolve(args.overlay)
      : path.join(root, "web/public/data/game_schedule_and_lines.json");
  fs.writeFileSync(p, "{}\n", "utf8");
  console.log(`Reset ${p} to {}`);
}

main();
