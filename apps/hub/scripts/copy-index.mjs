// Put the hub index where the site serves it (public/index.json).
//   --dev     use the dev index (real mods + example mods served by `npm run index:dev`)
//   default   build the production index from index/mods
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const indexRoot = join(here, "../../../index");
const out = join(here, "../public/index.json");
mkdirSync(dirname(out), { recursive: true });
if (process.argv.includes("--dev")) {
  execFileSync("node", [join(indexRoot, "scripts/dev-server.mjs"), "--write-only"], { stdio: "inherit" });
  copyFileSync(join(indexRoot, ".dev/index.json"), out);
} else {
  execFileSync("node", [join(indexRoot, "scripts/build.mjs"), "--out", out], { stdio: "inherit" });
}
