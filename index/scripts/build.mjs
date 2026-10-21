#!/usr/bin/env node
// Validate mods/*.json and compile dist/index.json.
//   node scripts/build.mjs [--strict] [--check-urls] [--out dist/index.json]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ROOT, loadEntries, check, compile } from "./lib.mjs";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const checkUrls = args.includes("--check-urls");
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? resolve(args[outIdx + 1]) : join(ROOT, "dist/index.json");

const entries = loadEntries();
const { errors, warnings } = check(entries, { strict });

if (checkUrls) {
  const urls = new Set();
  for (const { data } of entries) {
    for (const u of [data.homepage, data.source, ...(data.releases ?? []).map((r) => r.download.url)]) if (u) urls.add(u);
  }
  await Promise.all(
    [...urls].map(async (u) => {
      try {
        const res = await fetch(u, { method: "HEAD", redirect: "follow" });
        if (res.status >= 400 && res.status !== 405) warnings.push(`unreachable (${res.status}): ${u}`);
      } catch (e) {
        warnings.push(`unreachable (${e.cause?.code ?? e.message}): ${u}`);
      }
    }),
  );
}

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
if (errors.length) {
  console.error(`\n${errors.length} error(s); index not written.`);
  process.exit(1);
}

const index = compile(entries);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(index));
console.log(`wrote ${out} (${index.mods.length} mods, ${warnings.length} warning(s))`);
