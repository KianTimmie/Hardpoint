// Types for the published hub index (index/dist/index.json).
// Mirrors crates/hardpoint-core/src/hub.rs — keep the two in sync.

export type Category =
  | "aircraft" | "livery" | "terrain" | "mission" | "campaign"
  | "script" | "sound" | "tech" | "utility" | "other";

export const CATEGORIES: { id: Category; label: string; plural: string }[] = [
  { id: "aircraft", label: "Aircraft", plural: "Aircraft" },
  { id: "livery", label: "Livery", plural: "Liveries" },
  { id: "terrain", label: "Terrain", plural: "Terrains" },
  { id: "mission", label: "Mission", plural: "Missions" },
  { id: "campaign", label: "Campaign", plural: "Campaigns" },
  { id: "script", label: "Script", plural: "Scripts" },
  { id: "sound", label: "Sound", plural: "Sounds" },
  { id: "tech", label: "Tech", plural: "Tech" },
  { id: "utility", label: "Utility", plural: "Utilities" },
  { id: "other", label: "Other", plural: "Other" },
];

export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.id === c)?.label ?? c;

/** "saved:Mods/aircraft/X" or "install:Bazar/..." */
export type Target = string;

export interface Mapping { from?: string; to: Target }

export interface Download {
  kind: "direct" | "page";
  url: string;
  sha256?: string;
  size?: number;
  file_name?: string;
}

export interface Release {
  version: string;
  date?: string;
  changelog?: string;
  dcs_min?: string;
  download: Download;
  install?: Mapping[];
  livery_for?: string;
}

export interface Author { name: string; url?: string }

export interface Cover { url: string; credit: string; license: string; source: string }

/** The photo for a mod's card: the real-world cover, else the author's first screenshot. */
export const cardPhoto = (m: HubMod): string | undefined => m.cover?.url ?? m.images[0];

export interface HubMod {
  id: string;
  name: string;
  summary: string;
  description?: string;
  category: Category;
  tags: string[];
  authors: Author[];
  license?: string;
  homepage?: string;
  source?: string;
  /** Freely licensed photo of the real aircraft or system (card cover). */
  cover?: Cover;
  /** Screenshots from the mod author, shown when the card is opened. */
  images: string[];
  requires_modules: string[];
  dependencies: { id: string; min_version?: string }[];
  installable: boolean;
  /** Aircraft only: how it can be used. */
  aircraft_type?: AircraftType;
  releases: Release[];
  /** Latest release date (added by the index build). */
  updated?: string;
}

export type AircraftType = "flyable" | "flyable-module" | "vsn" | "ai-static" | "ai-animated";

export const AIRCRAFT_TYPES: { id: AircraftType; label: string; short: string; help: string }[] = [
  { id: "flyable", label: "Flyable, standalone", short: "Flyable", help: "Its own cockpit and flight model. No other module needed." },
  { id: "flyable-module", label: "Flyable, needs a module", short: "Needs module", help: "Flyable, but borrows the cockpit or systems of a DCS module (or another mod) you must own or install." },
  { id: "vsn", label: "VSN (no cockpit)", short: "VSN", help: "VSN-style: flies with the Flaming Cliffs 3 HUD and instruments, no clickable cockpit. Also works as AI." },
  { id: "ai-static", label: "AI, static", short: "AI static", help: "For missions only. No moving parts: gear, flaps and props don't animate." },
  { id: "ai-animated", label: "AI, animated", short: "AI animated", help: "For missions only, with animated gear, control surfaces or rotors." },
];
export const aircraftTypeInfo = (t?: AircraftType) => AIRCRAFT_TYPES.find((x) => x.id === t);

export interface HubIndex { schema: number; generated?: string; mods: HubMod[] }

/** Lenient version compare (same rules as the Rust engine). */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const m = v.trim().replace(/^v/i, "").match(/^(\d+(?:\.\d+)*)(.*)$/);
    if (!m) return null;
    const nums = m[1].split(".").map(Number);
    while (nums.length < 3) nums.push(0);
    return { nums, pre: m[2].replace(/^[-_ ]/, "") };
  };
  const x = parse(a), y = parse(b);
  if (!x || !y) return a.localeCompare(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return d;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre.localeCompare(y.pre);
}

export const latestRelease = (m: HubMod): Release | undefined =>
  [...m.releases].sort((a, b) => -compareVersions(a.version, b.version))[0];

/** true: touches the DCS install folder (may fail IC). false: Saved Games only. undefined: not declared. */
export function writesInstallDir(r?: Release): boolean | undefined {
  if (!r?.install?.length) return undefined;
  return r.install.some((m) => m.to.startsWith("install:"));
}

/** How the user gets this mod. */
export type Delivery = "one-click" | "page" | "listing" | "download-only";
export function delivery(m: HubMod): Delivery {
  const r = latestRelease(m);
  if (!r) return "listing";
  if (!m.installable) return "download-only";
  return r.download.kind === "direct" ? "one-click" : "page";
}

/** Deep link the desktop app registers. */
export const installLink = (id: string, version?: string) =>
  `hardpoint://install/${encodeURIComponent(id)}${version ? `?version=${encodeURIComponent(version)}` : ""}`;

export function formatBytes(n?: number): string {
  if (n == null) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

/** For mods that aren't installed into DCS folders: what they are, for labels and notes. */
export function downloadOnlyKind(m: HubMod): { label: string; note: string } {
  if (m.category === "script")
    return { label: "Mission library", note: "Used inside missions, so there's nothing to install into DCS." };
  return { label: "Separate program", note: "A separate program with its own installer, so it isn't installed into DCS folders." };
}
