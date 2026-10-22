import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { Actions } from "../App";
import type { HubMod, IndexResult, Overview, ProgressEvent } from "../types";
import { CATEGORIES, categoryLabel, compareVersions, delivery, downloadOnlyKind, formatBytes, latestRelease, writesInstallDir } from "../types";
import { ProgressBar, humanTarget } from "../components/ui";
import { CardGrid, ModCard, PhotoGallery } from "../../../../packages/ui/ModCard.tsx";

type Busy = Record<string, ProgressEvent | true>;

export function Hub({ index, indexError, overview, busy, actions, focus, onFocus }: {
  index: IndexResult | null; indexError: string | null; overview: Overview | null; busy: Busy; actions: Actions;
  focus: string | null; onFocus: (id: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const mods = index?.index.mods ?? [];
  const list = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return mods.filter((m) => {
      if (cat && m.category !== cat) return false;
      const hay = `${m.name} ${m.summary} ${m.tags.join(" ")} ${m.authors.map((a) => a.name).join(" ")}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [mods, q, cat]);
  const selected = mods.find((m) => m.id === focus) ?? null;
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onFocus(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, onFocus]);
  const installed = (id: string) => overview?.mods.find((m) => m.id === id);

  if (!index) {
    return (
      <section className="view">
        <header className="view-head"><h1>Hub</h1></header>
        {indexError ? (
          <div className="notice warn"><div>The hub index didn't load: {indexError}. Check the index address in Settings.</div><button className="btn" onClick={() => actions.refreshIndex()}>Try again</button></div>
        ) : <p className="muted">Loading the hub…</p>}
      </section>
    );
  }

  return (
    <section className="view hub">
      <header className="view-head">
        <div>
          <h1>Hub</h1>
          <p className="muted">{mods.length} mods in the index</p>
        </div>
        <div className="head-actions">
          <label className="sr" htmlFor="hubq">Search the hub</label>
          <input id="hubq" className="text" type="search" placeholder="Search the hub" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </header>
      {index.offline && <div className="notice">The online hub couldn't be reached, so this is the list saved with the app. Installing still works for mods with direct downloads.</div>}

      <div className="chips" role="group" aria-label="Category">
        <button className="chip" aria-pressed={!cat} onClick={() => setCat("")}>All <span>{mods.length}</span></button>
        {CATEGORIES.filter((c) => mods.some((m) => m.category === c.id)).map((c) => (
          <button key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setCat(cat === c.id ? "" : c.id)}>
            {c.plural} <span>{mods.filter((m) => m.category === c.id).length}</span>
          </button>
        ))}
      </div>

      {list.length ? (
        <CardGrid compact>
          {list.map((m) => {
            const have = installed(m.id)?.version;
            const r = latestRelease(m);
            const upd = have && r && compareVersions(r.version, have) > 0;
            return (
              <ModCard
                key={m.id}
                mod={m}
                selected={m.id === focus}
                onOpen={() => onFocus(m.id)}
                corner={have ? <span className={`hp-chip ${upd ? "warn" : "ok"}`}>{upd ? "Update available" : "Installed"}</span> : undefined}
                badge={<ModAction mod={m} installed={have} busy={busy[m.id]} actions={actions} compact />}
              />
            );
          })}
        </CardGrid>
      ) : (
        <div className="empty-state"><p>No mods match “{q}”{cat ? " in this category" : ""}.</p><button className="btn" onClick={() => { setQ(""); setCat(""); }}>Clear search</button></div>
      )}

      {selected && (
        <>
          <div className="scrim" onClick={() => onFocus(null)} aria-hidden="true" />
          <aside className="drawer" aria-label={`${selected.name} details`}>
            <button className="drawer-close" aria-label="Close details" onClick={() => onFocus(null)}>×</button>
            <Detail mod={selected} installed={installed(selected.id)?.version} busy={busy[selected.id]} actions={actions} />
          </aside>
        </>
      )}
    </section>
  );
}

function ModAction({ mod, installed, busy, actions, compact }: { mod: HubMod; installed?: string; busy?: ProgressEvent | true; actions: Actions; compact?: boolean }) {
  const r = latestRelease(mod);
  const d = delivery(mod);
  const sm = compact ? " sm" : "";
  if (busy && busy !== true) {
    return busy.phase === "download" ? <ProgressBar done={busy.done} total={busy.total} label="Downloading" /> : <span className="muted">Installing…</span>;
  }
  if (busy) return <span className="muted">Working…</span>;
  if (installed && r && compareVersions(r.version, installed) <= 0) return <span className="installed">Installed</span>;
  if (d === "one-click") {
    return <button className={`btn btn-install${sm}`} onClick={() => actions.install(mod.id)}>{installed ? `Update to ${r!.version}` : "Install"}</button>;
  }
  if (d === "page" || d === "download-only") {
    return <button className={`btn${sm}`} onClick={() => actions.open(r!.download.url)}>Download page</button>;
  }
  const link = mod.homepage ?? mod.source;
  return link ? <button className={`btn${sm}`} onClick={() => actions.open(link)}>Visit page</button> : null;
}

function Detail({ mod, installed, busy, actions }: { mod: HubMod; installed?: string; busy?: ProgressEvent | true; actions: Actions }) {
  const r = latestRelease(mod);
  const html = useMemo(() => (mod.description ? DOMPurify.sanitize(marked.parse(mod.description, { async: false }) as string) : ""), [mod]);
  const w = writesInstallDir(r);
  const d = delivery(mod);
  return (
    <article className="detail">
      <PhotoGallery mod={mod} open={actions.open} className="detail-photo" />
      <div className="detail-cat">{categoryLabel(mod.category)}</div>
      <h2>{mod.name}</h2>
      <p className="muted">{mod.summary}</p>
      <div className="detail-action"><ModAction mod={mod} installed={installed} busy={busy} actions={actions} /></div>
      {d === "page" && <p className="small muted">The author hosts this download. Save the file, then drop it onto this window.</p>}
      {d === "download-only" && <p className="small muted">{downloadOnlyKind(mod).note}</p>}
      {w === true && <p className="notice warn small">Changes files in the DCS install folder. Servers that enforce the integrity check may refuse it.</p>}
      <dl className="facts">
        {r && <><dt>Version</dt><dd>{r.version}{installed ? <span className="muted"> (you have {installed})</span> : null}</dd></>}
        {r?.download.size != null && <><dt>Size</dt><dd>{formatBytes(r.download.size)}</dd></>}
        {mod.installable && <><dt>Installs to</dt><dd>{r?.install?.length ? r.install.map((m) => <div key={m.to}>{humanTarget(m.to)}</div>) : "Detected from the archive"}</dd></>}
        {mod.requires_modules.length > 0 && <><dt>Needs</dt><dd>{mod.requires_modules.join(", ")}</dd></>}
        <dt>By</dt><dd>{mod.authors.map((a) => a.name).join(", ")}</dd>
        {mod.license && <><dt>Licence</dt><dd>{mod.license}</dd></>}
      </dl>
      {html && <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />}
      <div className="row">
        {mod.homepage && <button className="linkish" onClick={() => actions.open(mod.homepage!)}>Homepage</button>}
        {mod.source && <button className="linkish" onClick={() => actions.open(mod.source!)}>Source</button>}
      </div>
    </article>
  );
}
