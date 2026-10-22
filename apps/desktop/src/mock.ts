// Browser demo backend: lets the UI run without Tauri (for design work, screenshots and previews).
// Everything is in memory; nothing touches the disk.
import type { Backend } from "./api";
import type { HubIndex, ModHealth, ModSummary, Overview, ProgressEvent } from "./types";
import { latestRelease } from "./types";

declare global { interface Window { __HUB_INDEX__?: HubIndex } }

const now = () => new Date().toISOString();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const err = (kind: string, message: string, extra: object = {}) => Object.assign({ kind, message }, extra);

export async function mockBackend(): Promise<Backend> {
  const index: HubIndex =
    window.__HUB_INDEX__ ?? (await fetch("./demo-index.json").then((r) => r.json()).catch(() => ({ schema: 1, mods: [] })));

  const mods = new Map<string, ModSummary>();
  const add = (m: Partial<ModSummary> & Pick<ModSummary, "id" | "name" | "version" | "category">) =>
    mods.set(m.id, {
      source: { type: "hub" }, enabled: true, writes_install_dir: false, files: 1, bytes: 1024, targets: [],
      imported_at: now(), enabled_at: now(), ...m,
    });
  add({ id: "community-a-4e-c", name: "Community A-4E-C Skyhawk", version: "2.2", category: "aircraft", files: 2431, bytes: 1_012_000_000, targets: ["saved:Mods/aircraft/A-4E-C"] });
  add({ id: "example-hello-hook", name: "Hardpoint Test Hook", version: "1.0.0", category: "utility", files: 1, bytes: 304, targets: ["saved:Scripts"] });
  add({ id: "f-16c-squadron-liveries", name: "F-16C squadron liveries", version: "local", category: "livery", source: { type: "local", file_name: "F-16C squadron liveries.zip" }, files: 48, bytes: 286_000_000, targets: ["saved:Liveries/F-16C_50"] });
  add({ id: "clearer-cockpit-shaders", name: "Clearer cockpit shaders", version: "local", category: "other", source: { type: "local", file_name: "Clearer cockpit shaders v3.7z" }, writes_install_dir: true, files: 6, bytes: 412_000, targets: ["install:"] });
  add({ id: "night-ops-kneeboards", name: "Night ops kneeboards", version: "local", category: "other", source: { type: "local", file_name: "night-ops-kneeboards.zip" }, enabled: false, enabled_at: null, files: 12, bytes: 3_400_000, targets: ["saved:Kneeboard"] });

  let config = { install_dir: "C:\\Program Files\\Eagle Dynamics\\DCS World", saved_dir: "C:\\Users\\Pilot\\Saved Games\\DCS", index_url: "https://kiantimmie.github.io/Hardpoint/index.json" };
  const shaderRepaired = { done: false };
  const progressSubs = new Set<(e: ProgressEvent) => void>();

  const overview = (): Overview => ({
    config, paths: { install: config.install_dir, saved: config.saved_dir }, install_ok: true, saved_ok: true,
    dcs_version: "2.9.21.15102", data_dir: "C:\\Users\\Pilot\\AppData\\Roaming\\hardpoint\\Hardpoint\\data",
    mods: [...mods.values()].sort((a, b) => a.name.localeCompare(b.name)),
  });
  const updates = () =>
    [...mods.values()].flatMap((m) => {
      const h = index.mods.find((x) => x.id === m.id);
      const l = h && latestRelease(h);
      return m.source.type === "hub" && l && l.version !== m.version ? [{ id: m.id, installed: m.version, latest: l.version }] : [];
    });

  return {
    demo: true,
    overview: async () => overview(),
    detectPaths: async () => ({ install_candidates: [config.install_dir], saved_candidates: [config.saved_dir] }),
    saveConfig: async (c) => { config = { ...config, ...c } as typeof config; return overview(); },
    loadIndex: async () => { await wait(250); return { index, updates: updates(), offline: false }; },
    installHub: async (id, version) => {
      const h = index.mods.find((m) => m.id === id);
      if (!h) throw err("not_in_index", `'${id}' is not in the hub index`);
      const r = (version && h.releases.find((x) => x.version === version)) || latestRelease(h)!;
      if (!h.installable) throw err("not_installable", `'${h.name}' is used inside missions rather than installed into DCS`, { url: r.download.url });
      if (r.download.kind !== "direct") throw err("manual_download", `'${h.name}' ${r.version} is not a direct download; get it from the author's page, then drop the archive into Hardpoint`, { url: r.download.url });
      const total = r.download.size ?? 1_012_000_000;
      for (let i = 1; i <= 25; i++) {
        await wait(90);
        progressSubs.forEach((cb) => cb({ id, phase: "download", done: Math.round((total * i) / 25), total }));
      }
      progressSubs.forEach((cb) => cb({ id, phase: "install", done: 0 }));
      await wait(500);
      const prev = mods.get(id);
      add({ id, name: h.name, version: r.version, category: h.category, files: prev?.files ?? 3, bytes: total, targets: r.install?.map((m) => m.to) ?? prev?.targets ?? ["saved:Mods"] });
      progressSubs.forEach((cb) => cb({ id, phase: "done", done: 0 }));
      return overview().mods;
    },
    importPath: async (path, o = {}) => {
      await wait(400);
      const file = path.split(/[\\/]/).pop()!;
      const name = file.replace(/\.(zip|7z)$/i, "");
      if (/livery/i.test(name) && !o.liveryFor && !o.target)
        throw err("ambiguous_layout", `could not work out where this mod installs: '${name}' is a livery, but it isn't clear which aircraft it is for`);
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      add({ id, name, version: "local", category: o.liveryFor ? "livery" : "other", source: { type: "local", file_name: file }, enabled: o.enable ?? true,
        targets: o.target ? [o.target] : o.liveryFor ? [`saved:Liveries/${o.liveryFor}/${name}`] : ["saved:Mods"] });
      return { id, name, matched_hub: false, enabled: o.enable ?? true, writes_install_dir: !!o.target?.startsWith("install:") };
    },
    enable: async (id) => {
      const m = mods.get(id)!;
      m.enabled = true; m.enabled_at = now(); await wait(300);
      return { id, files: m.files, bytes: m.bytes, backed_up: 0 };
    },
    disable: async (id) => { const m = mods.get(id)!; m.enabled = false; m.enabled_at = null; await wait(250); return { id, removed: m.files, restored: 0, kept_changed: [] }; },
    remove: async (id) => { mods.delete(id); await wait(200); return null; },
    repair: async (id) => { await wait(500); if (id === "clearer-cockpit-shaders") shaderRepaired.done = true; return { id, files: 3, bytes: 120_000, backed_up: 3 }; },
    verify: async () => {
      await wait(300);
      return [...mods.values()].filter((m) => m.enabled).map((m): ModHealth => {
        const broken = m.id === "clearer-cockpit-shaders" && !shaderRepaired.done;
        return {
          id: m.id, name: m.name, ok: broken ? m.files - 3 : m.files, missing: [],
          changed: broken ? ["install:Bazar/shaders/common/states11.hlsl", "install:Bazar/shaders/deferred/shadows.hlsl", "install:Bazar/shaders/postEffects/tonemap.fx"] : [],
          dcs_updated: m.writes_install_dir,
        };
      });
    },
    reveal: async () => {},
    openExternal: async (url) => { window.open(url, "_blank", "noopener"); },
    pickFolder: async () => null,
    pickArchive: async () => "C:\\Users\\Pilot\\Downloads\\Hawk Mk120 livery pack.zip",
    confirm: async (message) => window.confirm(message),
    takePendingLink: async () => null,
    onProgress: (cb) => { progressSubs.add(cb); return () => progressSubs.delete(cb); },
    onDeepLink: () => () => {},
    onDrop: () => () => {},
  };
}
