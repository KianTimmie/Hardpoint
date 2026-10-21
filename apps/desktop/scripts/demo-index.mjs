// Build the dev index (real mods + example mods) and copy it to public/ for browser demo mode.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const indexRoot = join(here, "../../../index");
execFileSync("node", [join(indexRoot, "scripts/dev-server.mjs"), "--write-only"], { stdio: "inherit" });
mkdirSync(join(here, "../public"), { recursive: true });
copyFileSync(join(indexRoot, ".dev/index.json"), join(here, "../public/demo-index.json"));
console.log("demo index ready");
