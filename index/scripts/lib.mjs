// Shared helpers for the index scripts.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MODS_DIR = join(ROOT, "mods");
export const SCHEMA = JSON.parse(readFileSync(join(ROOT, "schema/mod.schema.json"), "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
export const validateSchema = ajv.compile(SCHEMA);

/** Lenient version compare, mirroring crates/hardpoint-core/src/version.rs closely enough for sorting. */
export function compareVersions(a, b) {
  const parse = (v) => {
    const m = String(v).trim().replace(/^v/i, "").match(/^(\d+(?:\.\d+)*)(.*)$/);
    if (!m) return null;
    const nums = m[1].split(".").map(Number);
    while (nums.length < 3) nums.push(0);
    return { nums, pre: m[2].replace(/^[-_ ]/, "") };
  };
  const x = parse(a), y = parse(b);
  if (!x || !y) return String(a).localeCompare(String(b));
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return d;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1; // release > prerelease
  if (!y.pre) return -1;
  return x.pre.localeCompare(y.pre);
}

/** Load every mods/*.json file. Returns [{file, data}] or throws on bad JSON. */
export function loadEntries(dir = MODS_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const text = readFileSync(join(dir, file), "utf8");
      try {
        return { file, data: JSON.parse(text) };
      } catch (e) {
        throw new Error(`${file}: invalid JSON (${e.message})`);
      }
    });
}

/**
 * Validate entries beyond the schema. Returns {errors, warnings} as arrays of strings.
 * `strict` turns "missing checksum on a direct download" into an error.
 */
export function check(entries, { strict = false } = {}) {
  const errors = [];
  const warnings = [];
  const ids = new Map();
  for (const { file, data } of entries) {
    const where = file;
    if (!validateSchema(data)) {
      for (const e of validateSchema.errors) errors.push(`${where}: ${e.instancePath || "/"} ${e.message}`);
      continue;
    }
    if (file !== `${data.id}.json`) errors.push(`${where}: file name must be ${data.id}.json`);
    if (ids.has(data.id)) errors.push(`${where}: duplicate id '${data.id}' (also in ${ids.get(data.id)})`);
    ids.set(data.id, file);

    const versions = new Set();
    for (const r of data.releases ?? []) {
      if (versions.has(r.version)) errors.push(`${where}: version ${r.version} listed twice`);
      versions.add(r.version);
      if (r.download.kind === "direct" && !r.download.sha256) {
        (strict ? errors : warnings).push(`${where}: ${r.version} is a direct download without sha256 (run: npm run hash -w index -- --fill)`);
      }
      if (data.category === "livery" && !r.livery_for && !(r.install?.length)) {
        warnings.push(`${where}: ${r.version} is a livery with no livery_for or install rules; users will have to pick the aircraft`);
      }
    }
    if (data.aircraft_type && data.category !== "aircraft") errors.push(`${where}: aircraft_type is only for the aircraft category`);
    if (data.category === "aircraft" && !data.aircraft_type) warnings.push(`${where}: aircraft with no aircraft_type (flyable, flyable-module, vsn, ai-static or ai-animated)`);
    if (data.aircraft_type === "flyable-module" && !data.requires_modules?.length && !data.dependencies?.length && !/requires|needs|uses/i.test(data.description ?? "")) {
      warnings.push(`${where}: flyable-module but no requires_modules saying which module it needs`);
    }
    if (!data.releases?.length && !data.homepage && !data.source) {
      errors.push(`${where}: a listing with no releases needs a homepage or source link`);
    }
  }
  for (const { file, data } of entries) {
    for (const d of data.dependencies ?? []) {
      if (!ids.has(d.id)) errors.push(`${file}: depends on unknown mod '${d.id}'`);
    }
  }
  return { errors, warnings };
}

/** Normalise entries into the published index shape. */
export function compile(entries, generated = new Date().toISOString()) {
  const mods = entries.map(({ data }) => {
    const { $schema, ...rest } = data;
    const releases = [...(rest.releases ?? [])].sort((a, b) => -compareVersions(a.version, b.version));
    const updated = releases.map((r) => r.date).filter(Boolean).sort().at(-1);
    return { ...rest, installable: rest.installable ?? true, tags: rest.tags ?? [], images: rest.images ?? [], requires_modules: rest.requires_modules ?? [], dependencies: rest.dependencies ?? [], releases, ...(updated ? { updated } : {}) };
  });
  mods.sort((a, b) => a.name.localeCompare(b.name));
  return { schema: 1, generated, mods };
}
