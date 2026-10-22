import { useEffect, useRef, useState } from "react";
import type { Actions } from "../App";
import type { HubMod, ModHealth, ModSummary, Overview, ProgressEvent, Update } from "../types";
import { categoryLabel, formatBytes } from "../types";
import { humanTarget } from "../components/ui";
import { ModImage } from "../../../../packages/ui/ModCard.tsx";
import { IconFolder, IconMore, IconRefresh, IconTrash } from "../components/icons";

type Filter = "all" | "on" | "off" | "attention" | "updates";

export function Library({ overview, health, updates, busy, actions, onBrowse, hubMods, q, openMod, initialFilter }: {
  overview: Overview; health: ModHealth[]; updates: Update[]; busy: Record<string, ProgressEvent | true>; actions: Actions;
  onBrowse: () => void; hubMods: HubMod[]; q: string; openMod: (id: string) => void; initialFilter?: string;
}) {
  const [filter, setFilter] = useState<Filter>((initialFilter as Filter) || "all");
  useEffect(() => { if (initialFilter) setFilter(initialFilter as Filter); }, [initialFilter]);
  const mods = overview.mods;
  const broken = new Map(health.filter((h) => h.missing.length || h.changed.length).map((h) => [h.id, h]));
  const upd = new Map(updates.map((u) => [u.id, u]));
  const importing = Object.keys(busy).filter((k) => k.startsWith("import:")).map((k) => k.slice(7));
  const visual = (m: ModSummary): HubMod =>
    hubMods.find((h) => h.id === m.id) ??
    ({ id: m.id, name: m.name, summary: "", category: m.category, tags: [], authors: [], images: [], requires_modules: [], dependencies: [], installable: true, releases: [] } as HubMod);

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = mods.filter((m) => {
    if (filter === "on" && !m.enabled) return false;
    if (filter === "off" && m.enabled) return false;
    if (filter === "attention" && !broken.has(m.id)) return false;
    if (filter === "updates" && !upd.has(m.id)) return false;
    return terms.every((t) => m.name.toLowerCase().includes(t));
  });
  const counts: Record<Filter, number> = {
    all: mods.length, on: mods.filter((m) => m.enabled).length, off: mods.filter((m) => !m.enabled).length,
    attention: broken.size, updates: upd.size,
  };

  return (
    <section className="view library">
      <header className="view-head">
        <div>
          <h1>My mods</h1>
          <p className="muted">{mods.length ? `${counts.on} on, ${counts.off} off, ${formatBytes(mods.reduce((s, m) => s + m.bytes, 0))} in total` : "Nothing installed yet"}</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => actions.checkFiles()}><IconRefresh /> Check files</button>
        </div>
      </header>

      {mods.length > 0 && (
        <div className="seg" role="group" aria-label="Show">
          {([["all", "All"], ["on", "On"], ["off", "Off"], ["attention", "Needs attention"], ["updates", "Updates"]] as [Filter, string][])
            .filter(([f]) => f === "all" || f === "on" || f === "off" || counts[f] > 0)
            .map(([f, label]) => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{label} <span>{counts[f]}</span></button>
            ))}
        </div>
      )}

      {importing.map((f) => <div className="notice" key={f}>Adding {f}…</div>)}

      {mods.length === 0 ? (
        <div className="empty-state big">
          <h2>Your hangar is empty</h2>
          <p>Install a mod from the hub, or drop a .zip, .7z or mod folder you already have anywhere on this window.</p>
          <div className="row"><button className="btn btn-install" onClick={onBrowse}>Browse mods</button><button className="btn" onClick={() => actions.addFromFile()}>Add a mod file</button></div>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty-state"><p>No mods match{q ? ` “${q}”` : ""} in this view.</p><button className="btn" onClick={() => setFilter("all")}>Show all</button></div>
      ) : (
        <ul className="mod-list">
          {shown.map((m) => {
            const b = busy[m.id];
            const u = upd.get(m.id);
            const h = broken.get(m.id);
            const inHub = hubMods.some((x) => x.id === m.id);
            return (
              <li key={m.id} className={`mod-row${m.enabled ? "" : " off"}`}>
                <button className="mod-thumb" onClick={() => inHub && openMod(m.id)} disabled={!inHub} aria-label={inHub ? `Details for ${m.name}` : undefined} tabIndex={inHub ? 0 : -1}>
                  <ModImage mod={visual(m)} />
                </button>
                <div className="mod-main">
                  <div className="mod-name">
                    {inHub ? <button className="linkname" onClick={() => openMod(m.id)}>{m.name}</button> : <span>{m.name}</span>}
                    {m.writes_install_dir && <span className="tag ic" title="Changes files in the DCS install folder; may fail multiplayer integrity checks">DCS folder</span>}
                  </div>
                  <div className="mod-sub">
                    {categoryLabel(m.category)}
                    {m.version !== "local" && <> · v{m.version.replace(/^v/i, "")}</>}
                    {" · "}{m.targets.length === 1 ? humanTarget(m.targets[0]) : m.writes_install_dir ? "DCS folder" : "Saved Games"}
                    {" · "}{formatBytes(m.bytes)}
                  </div>
                  {h && <div className="mod-alert">{h.missing.length + h.changed.length} file{h.missing.length + h.changed.length > 1 ? "s were" : " was"} {h.changed.length ? "replaced" : "removed"}{h.dcs_updated ? " by the DCS update" : ""}.</div>}
                  {b && b !== true && <div className="mod-sub">{b.phase === "download" ? "Downloading update…" : "Installing…"}</div>}
                </div>
                <div className="mod-actions">
                  {h && <button className="btn sm" disabled={!!b} onClick={() => actions.repair(m.id, m.name)}>Re-apply</button>}
                  {u && <button className="btn sm btn-install" disabled={!!b} onClick={() => actions.install(m.id)}>Update to {u.latest}</button>}
                  <label className={`switch${m.enabled ? " on" : ""}`}>
                    <input type="checkbox" role="switch" checked={m.enabled} disabled={!!b} onChange={(e) => actions.toggle(m.id, e.target.checked)} aria-label={`${m.name} on or off`} />
                    <span className="track"><span className="knob" /></span>
                    <span className="switch-label">{b === true ? "…" : m.enabled ? "On" : "Off"}</span>
                  </label>
                  <RowMenu
                    items={[
                      ...(m.targets[0] ? [{ label: "Open folder", icon: <IconFolder />, run: () => actions.reveal(m.targets[0]) }] : []),
                      ...(inHub ? [{ label: "Details", icon: null, run: () => openMod(m.id) }] : []),
                      { label: "Remove", icon: <IconTrash />, danger: true, run: () => actions.remove(m.id, m.name) },
                    ]}
                    label={`More actions for ${m.name}`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {mods.length > 0 && <p className="hint">Tip: drop a .zip, .7z or mod folder anywhere on this window to add it.</p>}
    </section>
  );
}

function RowMenu({ items, label }: { items: { label: string; icon: React.ReactNode; danger?: boolean; run: () => void }[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><IconMore /></button>
      {open && (
        <div className="menu-pop" role="menu">
          {items.map((it) => (
            <button key={it.label} role="menuitem" className={it.danger ? "danger" : ""} onClick={() => { setOpen(false); it.run(); }}>
              {it.icon}<span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
