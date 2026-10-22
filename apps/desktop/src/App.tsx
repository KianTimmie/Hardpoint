import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { Backend } from "./api";
import type { ErrorInfo, IndexResult, ModHealth, Overview, ProgressEvent } from "./types";
import { asError } from "./types";
import { Dialog, Toasts, type Toast } from "./components/ui";
import { Library } from "./views/Library";
import { Hub, ModDrawer, type HubFilter } from "./views/Hub";
import { Home } from "./views/Home";
import { Settings } from "./views/Settings";
import { ProgressBar } from "./components/ui";
import { IconAdd, IconBrowse, IconHome, IconMine, IconSearch, IconSettings } from "./components/icons";

export type View = "home" | "library" | "hub" | "settings";

/** Everything the views can do. Each action reports its own outcome as a toast. */
export interface Actions {
  toggle(id: string, on: boolean): Promise<void>;
  remove(id: string, name: string): Promise<void>;
  repair(id: string, name: string): Promise<void>;
  install(id: string, version?: string): Promise<void>;
  importPath(path: string, opts?: { liveryFor?: string; target?: string }): Promise<void>;
  addFromFile(): Promise<void>;
  checkFiles(): Promise<void>;
  reveal(target: string): void;
  open(url: string): void;
  refreshIndex(): Promise<void>;
  saveConfig: Backend["saveConfig"];
  detectPaths: Backend["detectPaths"];
  pickFolder: Backend["pickFolder"];
  setOverview(o: Overview): void;
}

type Prompt =
  | { kind: "layout"; path: string; message: string }
  | { kind: "conflicts"; name: string; err: ErrorInfo }
  | { kind: "deeplink"; id: string; version?: string };

export function App({ backend }: { backend: Backend }) {
  // "#hub/<mod-id>" or "#settings" opens a view directly (used by demo links and screenshots).
  const [initialView, initialFocus] = location.hash.slice(1).split("/");
  const [view, setView] = useState<View>(["home", "library", "hub", "settings"].includes(initialView) ? (initialView as View) : "home");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [hubFilter, setHubFilter] = useState<HubFilter>("");
  const [libFilter, setLibFilter] = useState<string | undefined>(undefined);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [index, setIndex] = useState<IndexResult | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [health, setHealth] = useState<ModHealth[]>([]);
  const [busy, setBusy] = useState<Record<string, ProgressEvent | true>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hubFocus, setHubFocus] = useState<string | null>(initialFocus ? decodeURIComponent(initialFocus) : null);
  const goTo = (v: View, opts?: { category?: string; filter?: string }) => {
    setView(v);
    setQ("");
    if (v === "hub") { setCat(opts?.category ?? ""); setHubFilter((opts?.filter as HubFilter) ?? ""); }
    if (v === "library") setLibFilter(opts?.filter);
    document.querySelector(".main")?.scrollTo(0, 0);
  };
  const toastId = useRef(0);

  const toast = useCallback((tone: Toast["tone"], text: string, action?: Toast["action"]) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, tone, text, action }]);
    if (tone !== "error") setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  const refresh = useCallback(async () => setOverview(await backend.overview()), [backend]);
  const verify = useCallback(async () => setHealth(await backend.verify()), [backend]);
  const refreshIndex = useCallback(async () => {
    try {
      const r = await backend.loadIndex();
      setIndex(r);
      setIndexError(r.offline ? r.error ?? "offline" : null);
    } catch (e) {
      setIndexError(asError(e).message);
    }
  }, [backend]);

  const mark = (id: string, v: ProgressEvent | true | null) =>
    setBusy((b) => { const n = { ...b }; if (v) n[id] = v; else delete n[id]; return n; });

  const fail = useCallback((e: unknown, name?: string) => {
    const info = asError(e);
    if (info.kind === "conflicts") setPrompt({ kind: "conflicts", name: name ?? "This mod", err: info });
    else if (info.url) toast("info", info.message.replace(/; get it from .*$/, "."), { label: "Open download page", run: () => backend.openExternal(info.url!) });
    else toast("error", info.message);
  }, [backend, toast]);

  // Initial load, events, deep links.
  useEffect(() => {
    refresh().then(verify).catch(fail);
    refreshIndex();
    const offProgress = backend.onProgress((e) => {
      if (e.phase === "done") mark(e.id, null);
      else mark(e.id, e);
    });
    const handleLink = (url: string) => {
      const m = url.match(/^hardpoint:\/\/install\/([^?#/]+)(?:\?(.*))?/);
      if (!m) return toast("error", `Hardpoint can't open this link: ${url}`);
      const version = new URLSearchParams(m[2] ?? "").get("version") ?? undefined;
      setHubFocus(decodeURIComponent(m[1]));
      setPrompt({ kind: "deeplink", id: decodeURIComponent(m[1]), version });
    };
    const offLink = backend.onDeepLink(handleLink);
    backend.takePendingLink().then((u) => u && handleLink(u));
    const offDrop = backend.onDrop((e) => {
      if (e.type === "enter") setDragging(true);
      else if (e.type === "leave") setDragging(false);
      else { setDragging(false); e.paths.forEach((p) => actions.importPath(p)); }
    });
    return () => { offProgress(); offLink(); offDrop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend]);

  // First run: send people to Settings if DCS wasn't found.
  useEffect(() => {
    if (overview && (!overview.saved_ok || !overview.install_ok) && overview.mods.length === 0) setView("settings");
  }, [overview?.saved_ok, overview?.install_ok]); // eslint-disable-line react-hooks/exhaustive-deps

  const actions: Actions = {
    async toggle(id, on) {
      const name = overview?.mods.find((m) => m.id === id)?.name ?? id;
      mark(id, true);
      try {
        if (on) {
          const r = await backend.enable(id);
          toast("ok", `Enabled ${name}${r.backed_up ? ` (${r.backed_up} original file${r.backed_up > 1 ? "s" : ""} backed up)` : ""}.`);
        } else {
          const r = await backend.disable(id);
          const kept = r.kept_changed.length;
          toast(kept ? "info" : "ok", kept
            ? `Disabled ${name}. ${kept} file${kept > 1 ? "s were" : " was"} changed since install and left in place.`
            : `Disabled ${name}.${r.restored ? ` Restored ${r.restored} original file${r.restored > 1 ? "s" : ""}.` : ""}`);
        }
        await refresh(); await verify();
      } catch (e) { fail(e, name); } finally { mark(id, null); }
    },
    async remove(id, name) {
      if (!(await backend.confirm(`Remove ${name} from your library? Its files are taken out of DCS and the downloaded copy is deleted.`, "Remove mod", "Remove"))) return;
      mark(id, true);
      try { await backend.remove(id); toast("ok", `Removed ${name}.`); await refresh(); await verify(); }
      catch (e) { fail(e, name); } finally { mark(id, null); }
    },
    async repair(id, name) {
      mark(id, true);
      try { const r = await backend.repair(id); toast("ok", `Re-applied ${r.files} file${r.files === 1 ? "" : "s"} for ${name}.`); await verify(); }
      catch (e) { fail(e, name); } finally { mark(id, null); }
    },
    async install(id, version) {
      const name = index?.index.mods.find((m) => m.id === id)?.name ?? id;
      mark(id, { id, phase: "download", done: 0, total: null });
      try {
        await backend.installHub(id, version);
        toast("ok", `Installed ${name}.`, { label: "Show in My mods", run: () => goTo("library") });
        await refresh(); await verify(); await refreshIndex();
      } catch (e) { fail(e, name); } finally { mark(id, null); }
    },
    async importPath(path, opts?: { liveryFor?: string; target?: string }) {
      const file = path.split(/[\\/]/).pop() ?? path;
      mark(`import:${file}`, true);
      try {
        const r = await backend.importPath(path, { ...opts, enable: true });
        toast("ok", r.matched_hub ? `Recognised ${r.name} from the hub and installed it.` : `Added ${r.name}${r.enabled ? " and enabled it" : ""}.`);
        await refresh(); await verify();
      } catch (e) {
        const info = asError(e);
        if (info.kind === "ambiguous_layout") setPrompt({ kind: "layout", path, message: info.message.replace(/^could not work out where this mod installs: /, "") });
        else fail(e, file);
      } finally { mark(`import:${file}`, null); }
    },
    async addFromFile() {
      const p = await backend.pickArchive();
      if (p) await actions.importPath(p);
    },
    async checkFiles() {
      await verify();
      toast("ok", "Checked installed files.");
    },
    reveal: (t) => { backend.reveal(t).catch(fail); },
    open: (u) => { backend.openExternal(u).catch(fail); },
    refreshIndex,
    saveConfig: backend.saveConfig,
    detectPaths: backend.detectPaths,
    pickFolder: backend.pickFolder,
    setOverview,
  };

  const updates = index?.updates ?? [];
  const pathsOk = overview ? overview.install_ok && overview.saved_ok : true;

  const hubMods = index?.index.mods ?? [];
  const brokenCount = health.filter((h) => h.missing.length || h.changed.length).length;
  const downloads = Object.values(busy).filter((b): b is ProgressEvent => b !== true);
  const focused = hubFocus ? hubMods.find((m) => m.id === hubFocus) : undefined;
  const nav: { v: View; label: string; icon: ReactElement; badge?: ReactNode }[] = [
    { v: "home", label: "Home", icon: <IconHome /> },
    { v: "hub", label: "Browse mods", icon: <IconBrowse />, badge: hubMods.length ? <span className="count">{hubMods.length}</span> : null },
    { v: "library", label: "My mods", icon: <IconMine />, badge: updates.length || brokenCount ? <span className="pill">{updates.length + brokenCount}</span> : overview?.mods.length ? <span className="count">{overview.mods.length}</span> : null },
    { v: "settings", label: "Settings", icon: <IconSettings />, badge: !pathsOk ? <span className="dot-warn" aria-label="needs attention" /> : null },
  ];
  const searchPlaceholder = view === "library" ? "Search my mods" : `Search ${hubMods.length || ""} mods`.replace("  ", " ");

  return (
    <div className="shell">
      <aside className="side">
        <div className="mark">
          <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="6" fill="currentColor" /><path d="M4 12h24M16 12v6M9 12v4M23 12v4" stroke="var(--paper)" strokeWidth="2.5" /><rect x="12.5" y="18" width="7" height="9" rx="3.5" fill="var(--red)" /></svg>
          HARDPOINT
        </div>
        <nav aria-label="Main">
          {nav.map((n) => (
            <button key={n.v} aria-current={view === n.v ? "page" : undefined} onClick={() => goTo(n.v)}>
              {n.icon}<span className="nav-label">{n.label}</span>{n.badge}
            </button>
          ))}
        </nav>

        {downloads.length > 0 && (
          <div className="tray" aria-live="polite">
            <div className="tray-head">Downloads</div>
            {downloads.map((d) => (
              <div key={d.id} className="tray-item">
                <span className="tray-name">{hubMods.find((m) => m.id === d.id)?.name ?? d.id}</span>
                {d.phase === "download" ? <ProgressBar done={d.done} total={d.total} label="Downloading" /> : <span className="muted small">Installing…</span>}
              </div>
            ))}
          </div>
        )}

        <div className="side-foot">
          {overview && (pathsOk ? (
            <><span className="status ok" />DCS {overview.dcs_version ?? "found"}</>
          ) : (
            <button className="linkish" onClick={() => goTo("settings")}><span className="status bad" />Set your DCS folders</button>
          ))}
          {backend.demo && <div className="demo-note">Demo mode: nothing is installed.</div>}
        </div>
      </aside>

      <div className="main">
        {view !== "settings" && (
          <div className="topbar">
            <form className="topsearch" role="search" onSubmit={(e) => { e.preventDefault(); if (view === "home") setView("hub"); }}>
              <IconSearch />
              <label className="sr" htmlFor="topq">{searchPlaceholder}</label>
              <input id="topq" type="search" placeholder={searchPlaceholder} value={q}
                onChange={(e) => { setQ(e.target.value); if (view === "home" && e.target.value) setView("hub"); }} />
            </form>
            <button className="btn ghost" onClick={() => actions.addFromFile()}><IconAdd /> Add a mod file</button>
          </div>
        )}
        {view === "home" && overview && (
          <Home overview={overview} index={index} health={health} updates={updates} busy={busy} actions={actions}
            go={(v, o) => goTo(v, o)} openMod={setHubFocus} />
        )}
        {view === "library" && overview && (
          <Library overview={overview} health={health} updates={updates} busy={busy} actions={actions} onBrowse={() => goTo("hub")}
            hubMods={hubMods} q={q} openMod={setHubFocus} initialFilter={libFilter} />
        )}
        {view === "hub" && (
          <Hub index={index} indexError={indexError} overview={overview} busy={busy} actions={actions}
            q={q} cat={cat} setCat={setCat} filter={hubFilter} setFilter={setHubFilter} openMod={setHubFocus} focus={hubFocus} />
        )}
        {view === "settings" && overview && <Settings overview={overview} actions={actions} toast={toast} demo={backend.demo} />}
      </div>

      {focused && (
        <ModDrawer mod={focused} installed={overview?.mods.find((m) => m.id === focused.id)?.version} busy={busy[focused.id]} actions={actions} onClose={() => setHubFocus(null)} />
      )}

      {dragging && (
        <div className="dropzone" aria-hidden="true">
          <div>Drop to add to your library<span>.zip, .7z or an extracted mod folder</span></div>
        </div>
      )}

      {prompt?.kind === "layout" && (
        <LayoutPrompt
          path={prompt.path}
          message={prompt.message}
          onCancel={() => setPrompt(null)}
          onSubmit={(o) => { setPrompt(null); actions.importPath(prompt.path, o); }}
        />
      )}
      {prompt?.kind === "conflicts" && (
        <Dialog title={`${prompt.name} clashes with another mod`} onClose={() => setPrompt(null)} actions={<button className="btn" onClick={() => setPrompt(null)}>OK</button>}>
          <p>These files are already provided by an enabled mod. Disable that mod first, then try again.</p>
          <ul className="conflicts">
            {prompt.err.conflicts?.slice(0, 12).map((c) => <li key={c.target}><code>{c.target}</code> <span className="muted">from {c.owner}</span></li>)}
          </ul>
          {(prompt.err.conflicts?.length ?? 0) > 12 && <p className="muted">…and {prompt.err.conflicts!.length - 12} more.</p>}
        </Dialog>
      )}
      {prompt?.kind === "deeplink" && (() => {
        const m = index?.index.mods.find((x) => x.id === prompt.id);
        return (
          <Dialog
            title={m ? `Install ${m.name}?` : "Mod not found"}
            onClose={() => setPrompt(null)}
            actions={m ? (
              <>
                <button className="btn" onClick={() => setPrompt(null)}>Cancel</button>
                <button className="btn btn-install" onClick={() => { setPrompt(null); actions.install(prompt.id, prompt.version); }}>Install</button>
              </>
            ) : <button className="btn" onClick={() => setPrompt(null)}>OK</button>}
          >
            {m ? <p>A link from the hub asked to install <strong>{m.name}</strong>{prompt.version ? ` ${prompt.version}` : ""}. {m.summary}</p>
               : <p>The link asked for “{prompt.id}”, which isn't in the hub index{index ? "" : " (the index hasn't loaded yet)"}.</p>}
          </Dialog>
        );
      })()}

      <Toasts items={toasts} dismiss={dismiss} />
    </div>
  );
}

function LayoutPrompt({ path, message, onCancel, onSubmit }: {
  path: string; message: string; onCancel: () => void; onSubmit: (o: { liveryFor?: string; target?: string }) => void;
}) {
  const file = path.split(/[\\/]/).pop() ?? path;
  const base = file.replace(/\.(zip|7z)$/i, "");
  const isLivery = /livery/.test(message);
  const [choice, setChoice] = useState<"livery" | "aircraft" | "custom">(isLivery ? "livery" : "aircraft");
  const [aircraft, setAircraft] = useState("");
  const [custom, setCustom] = useState(`saved:Mods/tech/${base}`);
  const submit = () => {
    if (choice === "livery") onSubmit({ liveryFor: aircraft.trim() });
    else if (choice === "aircraft") onSubmit({ target: `saved:Mods/aircraft/${base}` });
    else onSubmit({ target: custom.trim() });
  };
  const valid = choice !== "livery" || aircraft.trim().length > 0;
  return (
    <Dialog
      title={`Where does ${file} go?`}
      onClose={onCancel}
      actions={<><button className="btn" onClick={onCancel}>Cancel</button><button className="btn btn-install" disabled={!valid} onClick={submit}>Add and enable</button></>}
    >
      <p className="muted">Hardpoint couldn't tell from the archive: {message}.</p>
      <fieldset className="choices">
        <legend className="sr">Install location</legend>
        <label><input type="radio" checked={choice === "livery"} onChange={() => setChoice("livery")} /> A livery for this aircraft
          <input className="text" placeholder="Aircraft folder, e.g. FA-18C_hornet" value={aircraft} onChange={(e) => { setAircraft(e.target.value); setChoice("livery"); }} />
        </label>
        <label><input type="radio" checked={choice === "aircraft"} onChange={() => setChoice("aircraft")} /> An aircraft module <span className="muted">→ Saved Games › Mods › aircraft › {base}</span></label>
        <label><input type="radio" checked={choice === "custom"} onChange={() => setChoice("custom")} /> Somewhere else
          <input className="text mono" value={custom} onChange={(e) => { setCustom(e.target.value); setChoice("custom"); }} aria-describedby="custom-help" />
          <span id="custom-help" className="muted small">Start with <code>saved:</code> for Saved Games\DCS or <code>install:</code> for the DCS folder.</span>
        </label>
      </fieldset>
    </Dialog>
  );
}
