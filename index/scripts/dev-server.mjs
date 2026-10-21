#!/usr/bin/env node
// Local hub for development: builds the example mods into zips, merges them with the real
// index (examples get localhost download URLs and real checksums) and serves everything.
//
//   node scripts/dev-server.mjs [--port 8765] [--write-only]
//
// Point the desktop app (Settings → Hub index URL) at http://localhost:8765/index.json
// and the website's dev server reads the same file.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync, createReadStream } from "node:fs";
import { join, relative, extname } from "node:path";
import { zipSync } from "fflate";
import { ROOT, loadEntries, check, compile } from "./lib.mjs";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]) || 8765;
const base = `http://localhost:${port}`;
const outDir = join(ROOT, ".dev");
mkdirSync(join(outDir, "files"), { recursive: true });

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function buildExamples() {
  const exDir = join(ROOT, "examples");
  const entries = [];
  for (const id of readdirSync(exDir)) {
    const meta = JSON.parse(readFileSync(join(exDir, id, "mod.json"), "utf8"));
    const filesDir = join(exDir, id, "files");
    const tree = {};
    for (const f of walk(filesDir)) tree[relative(filesDir, f).split("\\").join("/")] = readFileSync(f);
    // Fixed mtime so the zip (and its checksum) is reproducible.
    const zip = zipSync(tree, { level: 6, mtime: new Date("2026-01-01T00:00:00Z") });
    const release = meta.releases[0];
    const fileName = `${id}-${release.version}.zip`;
    writeFileSync(join(outDir, "files", fileName), zip);
    release.download = {
      kind: "direct",
      url: `${base}/files/${fileName}`,
      sha256: createHash("sha256").update(zip).digest("hex"),
      size: zip.length,
      file_name: fileName,
    };
    entries.push({ file: `${id}.json`, data: meta });
  }
  return entries;
}

const entries = [...loadEntries(), ...buildExamples()];
const { errors, warnings } = check(entries);
for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  process.exit(1);
}
const index = compile(entries);
writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2));
console.log(`dev index: ${index.mods.length} mods → ${join(outDir, "index.json")}`);
if (args.includes("--write-only")) process.exit(0);

const types = { ".json": "application/json", ".zip": "application/zip" };
createServer((req, res) => {
  const url = new URL(req.url, base);
  const path = join(outDir, decodeURIComponent(url.pathname));
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!path.startsWith(outDir) || !existsSync(path) || statSync(path).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream", "Content-Length": statSync(path).size });
  createReadStream(path).pipe(res);
}).listen(port, () => console.log(`serving ${base}/index.json`));
