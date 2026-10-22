import { useEffect, useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { Actions } from "../App";
import type { HubMod, IndexResult, Overview, ProgressEvent } from "../types";
import { CATEGORIES, compareVersions, delivery, downloadOnlyKind, formatBytes, latestRelease, writesInstallDir } from "../types";
import { ProgressBar, humanTarget } from "../components/ui";
import { CardGrid, ModCard, PhotoGallery } from "../../../../packages/ui/ModCard.tsx";
import { categoryLabel } from "../types";

type Busy = Record<string, ProgressEvent | true>;
export type HubFilter = "" | "oneclick" | "installed" | "updates";

export function Hub({ index, indexError, overview, busy, actions, q, cat, setCat, filter, setFilter, openMod, focus }: {
  index: IndexResult | null; indexError: string | null; overview: Overview | null; busy: Busy; actions: Actions;
  q: string; cat: string; setCat: (c: string) => void; filter: HubFilter; setFilter: (f: HubFilter) => void;
  openMod: (id: string) => void; focus: string | null;
}) {
  const mods = index?.index.mods ?? [];
  const installed = (id: string) => overview?.mods.find((m) => m.id === id);
  const updateIds = new Set((index?.updates ?? []).map((u) => u.id));
  const list = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return mods.filter((m) => {
      if (cat && m.category !== cat) return false;
      if (filter === "oneclick" && delivery(m) !== "one-click") return false;
      if (filter === "installed" && !installed(m.id)) return false;
      if (filter === "updates" && !updateIds.has(m.id)) return false;
      const hay = `${m.name} ${m.summary} ${m.tags.join(" ")} ${m.authors.map((a) => a.name).join(" ")}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    }).sort((a, b) => Number(!!(b.cover || b.images.length)) - Number(!!(a.cover || a.images.length)) || a.name.localeCompare(b.name));
  }, [mods, q, cat, filter, overview]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!index) {
    return (
      <section className="view">
        <header className="view-head"><h1>Browse mods</h1></header>
        {indexError ? (
          <div className="notice warn"><div>The mod list didn't load: {indexError}. Check the hub address in Settings.</div><button className="btn" onClick={() => actions.refreshIndex()}>Try again</button></div>
        ) : <p className="muted">Loading the hub…</p>}
      </section>
    );
  }

  const count = (c: string) => mods.filter((m) => m.category === c).length;
  return (
    <section className="view hub">
      <header className="view-head">
        <div>
          <h1>{q ? `Results for “${q}”` : cat ? CATEGORIES.find((c) => c.id === cat)?.plural : "Browse mods"}</h1>
          <p className="muted">{list.length} of {mods.length} mods</p>
        </div>
        <div className="seg" role="group" aria-label="Show">
          {([["", "All"], ["oneclick", "One-click"], ["installed", "Installed"], ["updates", "Updates"]] as [HubFilter, string][]).map(([f, label]) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>
          ))}
        </div>
      </header>
      {index.offline && <div className="notice">The online hub couldn't be reached, so this is the list saved with the app. Installing still works for mods with direct downloads.</div>}

      <div className="chips" role="group" aria-label="Category">
        <button className="chip" aria-pressed={!cat} onClick={() => setCat("")}>All <span>{mods.length}</span></button>
        {CATEGORIES.filter((c) => count(c.id)).map((c) => (
          <button key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setCat(cat === c.id ? "" : c.id)}>
            {c.plural} <span>{count(c.id)}</span>
          </button>
        ))}
      </div>

      {list.length ? (
        <CardGrid compact>
          {list.map((m) => {
            const have = installed(m.id)?.version;
            const upd = updateIds.has(m.id);
            return (
              <ModCard
                key={m.id}
                mod={m}
                selected={m.id === focus}
                onOpen={() => openMod(m.id)}
                corner={have ? <span className={`hp-chip ${upd ? "warn" : "ok"}`}>{upd ? "Update available" : "Installed"}</span> : undefined}
                badge={<ModAction mod={m} installed={have} busy={busy[m.id]} actions={actions} compact />}
              />
            );
          })}
        </CardGrid>
      ) : (
        <div className="empty-state">
          <h2>Nothing matches</h2>
          <p>Try another search or clear the filters.</p>
          <button className="btn" onClick={() => { setCat(""); setFilter(""); }}>Clear filters</button>
        </div>
      )}
    </section>
  );
}

/** The one button that matters for a mod in its current state. */
export function ModAction({ mod, installed, busy, actions, compact, hero }: {
  mod: HubMod; installed?: string; busy?: ProgressEvent | true; actions: Actions; compact?: boolean; hero?: boolean;
}) {
  const r = latestRelease(mod);
  const d = delivery(mod);
  const sm = compact ? " sm" : "";
  const big = hero ? " lg" : "";
  if (busy && busy !== true) {
    return busy.phase === "download" ? <ProgressBar done={busy.done} total={busy.total} label="Downloading" /> : <span className={hero ? "hero-status" : "muted"}>Installing…</span>;
  }
  if (busy) return <span className={hero ? "hero-status" : "muted"}>Working…</span>;
  if (installed && r && compareVersions(r.version, installed) <= 0) return <span className={hero ? "hero-status" : "installed"}>✓ Installed</span>;
  if (d === "one-click") {
    return <button className={`btn btn-install${sm}${big}`} onClick={() => actions.install(mod.id)}>{installed ? `Update to ${r!.version}` : `Install${hero && r?.download.size ? ` · ${formatBytes(r.download.size)}` : ""}`}</button>;
  }
  if (d === "page" || d === "download-only") {
    return <button className={`btn${sm}${big}${hero ? " on-dark" : ""}`} onClick={() => actions.open(r!.download.url)}>Get it from the author</button>;
  }
  const link = mod.homepage ?? mod.source;
  return link ? <button className={`btn${sm}${big}${hero ? " on-dark" : ""}`} onClick={() => actions.open(link)}>Visit page</button> : null;
}

/** Slide-in details panel. */
export function ModDrawer({ mod, installed, busy, actions, onClose }: {
  mod: HubMod; installed?: string; busy?: ProgressEvent | true; actions: Actions; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" aria-label={`${mod.name} details`} role="dialog">
        <button className="drawer-close" aria-label="Close details" onClick={onClose}>×</button>
        <Detail mod={mod} installed={installed} busy={busy} actions={actions} />
      </aside>
    </>
  );
}

function WhatHappens({ mod }: { mod: HubMod }) {
  const r = latestRelease(mod);
  const d = delivery(mod);
  const w = writesInstallDir(r);
  const items: { tone: "ok" | "warn" | "info"; text: string }[] = [];
  if (d === "one-click") items.push({ tone: "ok", text: `Hardpoint downloads it${r?.download.size ? ` (${formatBytes(r.download.size)})` : ""}${r?.download.sha256 ? " and checks the file is exactly what the author published" : ""}.` });
  if (d === "page") items.push({ tone: "info", text: "You download it from the author's page, then drop the file onto this window. Hardpoint does the rest." });
  if (d === "download-only") items.push({ tone: "info", text: downloadOnlyKind(mod).note });
  if (mod.installable && d !== "download-only") {
    if (r?.install?.length) items.push({ tone: "ok", text: `Files go to ${r.install.map((m) => humanTarget(m.to)).join(", ")}.` });
    else items.push({ tone: "ok", text: "Hardpoint works out the right folder from the archive." });
    if (w === true) items.push({ tone: "warn", text: "It changes files in the DCS install folder. The originals are backed up, but servers that enforce the integrity check may refuse it, and DCS updates can undo it (Hardpoint can re-apply it)." });
    if (w === false) items.push({ tone: "ok", text: "It only touches Saved Games, so multiplayer integrity checks aren't affected." });
    items.push({ tone: "ok", text: "Turning it off removes its files and puts back anything it replaced." });
  }
  if (mod.requires_modules.length) items.push({ tone: "info", text: `You need ${mod.requires_modules.join(", ")}.` });
  if (!items.length) return null;
  return (
    <div className="what">
      <h3>What installing does</h3>
      <ul>{items.map((it, k) => <li key={k} className={it.tone}>{it.text}</li>)}</ul>
    </div>
  );
}

function Detail({ mod, installed, busy, actions }: { mod: HubMod; installed?: string; busy?: ProgressEvent | true; actions: Actions }) {
  const r = latestRelease(mod);
  const html = useMemo(() => (mod.description ? DOMPurify.sanitize(marked.parse(mod.description, { async: false }) as string) : ""), [mod]);
  return (
    <article className="detail">
      <PhotoGallery mod={mod} open={actions.open} className="detail-photo" />
      <div className="detail-cat">{categoryLabel(mod.category)}</div>
      <h2>{mod.name}</h2>
      <p className="muted">{mod.summary}</p>
      <div className="detail-action"><ModAction mod={mod} installed={installed} busy={busy} actions={actions} /></div>
      <WhatHappens mod={mod} />
      <dl className="facts">
        {r && <><dt>Version</dt><dd>{r.version}{installed ? <span className="muted"> (you have {installed})</span> : null}</dd></>}
        {r?.date && <><dt>Released</dt><dd>{new Date(r.date + "T00:00:00").toLocaleDateString(undefined, { dateStyle: "medium" })}</dd></>}
        <dt>By</dt><dd>{mod.authors.map((a) => a.name).join(", ")}</dd>
        {mod.license && <><dt>Licence</dt><dd>{mod.license}</dd></>}
      </dl>
      {html && <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />}
      <div className="row">
        {mod.homepage && <button className="linkish" onClick={() => actions.open(mod.homepage!)}>Author's page</button>}
        {mod.source && <button className="linkish" onClick={() => actions.open(mod.source!)}>Source code</button>}
      </div>
    </article>
  );
}
