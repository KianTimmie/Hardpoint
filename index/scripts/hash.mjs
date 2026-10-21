#!/usr/bin/env node
// Compute sha256 + size for a release download.
//   node scripts/hash.mjs <url-or-file>      print sha256 and size
//   node scripts/hash.mjs --fill [id ...]    fill missing sha256/size for direct downloads in mods/*.json
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { MODS_DIR, loadEntries } from "./lib.mjs";

async function hashUrl(url) {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "hardpoint-index" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const h = createHash("sha256");
  let size = 0;
  for await (const chunk of res.body) {
    h.update(chunk);
    size += chunk.length;
  }
  return { sha256: h.digest("hex"), size };
}

async function hashFile(path) {
  const h = createHash("sha256");
  await new Promise((ok, fail) => createReadStream(path).on("data", (c) => h.update(c)).on("end", ok).on("error", fail));
  return { sha256: h.digest("hex"), size: statSync(path).size };
}

const args = process.argv.slice(2);
if (args[0] === "--fill") {
  const only = new Set(args.slice(1));
  let changed = 0;
  for (const { file, data } of loadEntries()) {
    if (only.size && !only.has(data.id)) continue;
    let dirty = false;
    for (const r of data.releases ?? []) {
      if (r.download.kind !== "direct" || r.download.sha256) continue;
      process.stdout.write(`${data.id} ${r.version}: downloading… `);
      const { sha256, size } = await hashUrl(r.download.url);
      r.download.sha256 = sha256;
      r.download.size = size;
      dirty = true;
      console.log(`${sha256} (${size} bytes)`);
    }
    if (dirty) {
      // Preserve key order and 2-space formatting.
      const path = join(MODS_DIR, file);
      const original = JSON.parse(readFileSync(path, "utf8"));
      original.releases = data.releases;
      writeFileSync(path, JSON.stringify(original, null, 2) + "\n");
      changed++;
    }
  }
  console.log(`${changed} file(s) updated`);
} else if (args[0]) {
  const t = args[0];
  const r = /^https?:\/\//.test(t) ? await hashUrl(t) : await hashFile(t);
  console.log(JSON.stringify(r, null, 2));
} else {
  console.log("usage: hash.mjs <url-or-file> | --fill [id ...]");
  process.exit(2);
}
