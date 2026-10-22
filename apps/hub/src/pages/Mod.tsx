import { useMemo } from "react";
import { AircraftTypePill, PhotoGallery } from "../../../../packages/ui/ModCard.tsx";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { HubIndex, HubMod, Release } from "../types";
import { aircraftTypeInfo, categoryLabel, delivery, downloadOnlyKind, formatBytes, installLink, latestRelease, writesInstallDir } from "../types";
import { browseHref, modHref } from "../router";
import { DeliveryTag, IcTag } from "../components/Badges";
import { formatDate } from "../components/StoresTable";

function md(src?: string) {
  if (!src) return "";
  return DOMPurify.sanitize(marked.parse(src, { async: false }) as string);
}

/** "saved:Mods/aircraft/A-4E-C" → "Saved Games › Mods › aircraft › A-4E-C" */
function humanTarget(t: string) {
  const [root, rel] = t.split(":");
  const base = root === "install" ? "DCS install folder" : "Saved Games\\DCS";
  return [base, ...(rel ? rel.split("/") : [])].join(" › ");
}

function IcRow({ r }: { r?: Release }) {
  const w = writesInstallDir(r);
  if (w === true) return <>May be refused by servers that enforce it</>;
  if (w === false) return <>Not affected (Saved Games only)</>;
  return <>Checked when installed</>;
}

function Actions({ mod, r }: { mod: HubMod; r?: Release }) {
  const d = delivery(mod);
  if (d === "one-click" && r) {
    return (
      <div className="stack">
        <a className="btn btn-install btn-block" href={installLink(mod.id, r.version)}>Install with Hardpoint</a>
        <a className="btn btn-block" href={r.download.url}>Download file{r.download.size ? ` (${formatBytes(r.download.size)})` : ""}</a>
        <p className="note">Opens the Hardpoint app. <a href="#/app">Don't have it yet?</a></p>
      </div>
    );
  }
  if (d === "page" && r) {
    return (
      <div className="stack">
        <a className="btn btn-block" href={r.download.url} target="_blank" rel="noopener">Open download page</a>
        <p className="note">
          The author hosts this download. Save the file, then drop it onto Hardpoint
          {r.download.sha256 ? "; it is recognised by checksum and installed using this listing's rules." : " to install it."}
        </p>
      </div>
    );
  }
  if (d === "download-only" && r) {
    return (
      <div className="stack">
        <a className="btn btn-block" href={r.download.url} target="_blank" rel="noopener">Open download page</a>
        <p className="note">{downloadOnlyKind(mod).note}</p>
      </div>
    );
  }
  const link = mod.homepage ?? mod.source;
  return link ? <a className="btn btn-block" href={link} target="_blank" rel="noopener">Visit the author's page</a> : null;
}

export function Mod({ index, id }: { index: HubIndex; id: string }) {
  const mod = index.mods.find((m) => m.id === id);
  const html = useMemo(() => md(mod?.description), [mod]);
  if (!mod) {
    return (
      <main className="wrap page">
        <h1>No mod called “{id}”</h1>
        <p className="muted" style={{ marginTop: 12 }}>It may have been renamed or removed from the index.</p>
        <a className="btn" href="#/browse">Browse all mods</a>
      </main>
    );
  }
  const r = latestRelease(mod);
  const deps = mod.dependencies.map((d) => ({ ...d, mod: index.mods.find((m) => m.id === d.id) }));

  return (
    <main className="wrap detail">
      <article>
        <nav className="crumbs" aria-label="Breadcrumb">
          <a href="#/browse">Mods</a> › <a href={browseHref({ cat: mod.category })}>{categoryLabel(mod.category)}</a>
          {mod.aircraft_type && <> › <a href={browseHref({ cat: "aircraft", type: mod.aircraft_type })}>{aircraftTypeInfo(mod.aircraft_type)?.label}</a></>}
        </nav>
        <h1>{mod.name}</h1>
        <p className="summary">{mod.summary}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
          <DeliveryTag mod={mod} />
          <IcTag mod={mod} />
          {mod.tags.map((t) => <a key={t} className="tag" href={browseHref({ q: t })} style={{ textDecoration: "none" }}>{t}</a>)}
        </div>
        <PhotoGallery mod={mod} className="gallery" />
        {html && <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />}

        {mod.releases.length > 0 && (
          <section className="releases">
            <h2 style={{ marginBottom: 16 }}>Releases</h2>
            <ol>
              {mod.releases.map((rel) => (
                <li key={rel.version}>
                  <span className="v">{rel.version}</span> <span className="muted">{rel.date ? formatDate(rel.date) : ""}</span>
                  {rel.changelog && <div className="prose" dangerouslySetInnerHTML={{ __html: md(rel.changelog) }} />}
                </li>
              ))}
            </ol>
          </section>
        )}
      </article>

      <aside className="plate" aria-label="Mod details">
        {writesInstallDir(r) === true && (
          <p className="warn">Changes files in the DCS install folder. A DCS update may undo it; Hardpoint can re-apply it.</p>
        )}
        <dl>
          {mod.aircraft_type && (<><dt>Type</dt><dd><AircraftTypePill mod={mod} long /><p className="hp-type-help">{aircraftTypeInfo(mod.aircraft_type)?.help}</p></dd></>)}
          <dt>Version</dt><dd>{r?.version ?? "—"}</dd>
          {r?.date && (<><dt>Released</dt><dd>{formatDate(r.date)}</dd></>)}
          {r?.download.size != null && (<><dt>Size</dt><dd>{formatBytes(r.download.size)}</dd></>)}
          {mod.installable && (
            <>
              <dt>Installs to</dt>
              <dd>{r?.install?.length ? r.install.map((m) => <div key={m.to}>{humanTarget(m.to)}</div>) : "Detected from the archive"}</dd>
              <dt>Integrity check</dt><dd><IcRow r={r} /></dd>
            </>
          )}
          {r?.dcs_min && (<><dt>Needs DCS</dt><dd>{r.dcs_min} or later</dd></>)}
          {mod.requires_modules.length > 0 && (<><dt>Needs</dt><dd>{mod.requires_modules.join(", ")}</dd></>)}
          {deps.length > 0 && (
            <>
              <dt>Depends on</dt>
              <dd>{deps.map((d) => <div key={d.id}>{d.mod ? <a href={modHref(d.id)}>{d.mod.name}</a> : d.id}{d.min_version ? ` ${d.min_version}+` : ""}</div>)}</dd>
            </>
          )}
          <dt>{mod.authors.length > 1 ? "Authors" : "Author"}</dt>
          <dd>{mod.authors.map((a) => <div key={a.name}>{a.url ? <a href={a.url} target="_blank" rel="noopener">{a.name}</a> : a.name}</div>)}</dd>
          {mod.license && (<><dt>Licence</dt><dd>{mod.license}</dd></>)}
          {(mod.homepage || mod.source) && (
            <>
              <dt>Links</dt>
              <dd>
                {mod.homepage && <div><a href={mod.homepage} target="_blank" rel="noopener">Homepage</a></div>}
                {mod.source && <div><a href={mod.source} target="_blank" rel="noopener">Source</a></div>}
              </dd>
            </>
          )}
        </dl>
        <Actions mod={mod} r={r} />
      </aside>
    </main>
  );
}
