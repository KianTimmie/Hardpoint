import type { Actions } from "../App";
import type { HubMod, IndexResult, ModHealth, Overview, ProgressEvent, Update } from "../types";
import { delivery } from "../types";
import { FeaturedHero, Shelf } from "../../../../packages/ui/Featured.tsx";
import { ModCard } from "../../../../packages/ui/ModCard.tsx";
import { ModAction } from "./Hub";
import { IconAlert, IconCheck, IconDownload, IconMine, IconRefresh } from "../components/icons";

type Busy = Record<string, ProgressEvent | true>;

export function Home({ overview, index, health, updates, busy, actions, go, openMod }: {
  overview: Overview;
  index: IndexResult | null;
  health: ModHealth[];
  updates: Update[];
  busy: Busy;
  actions: Actions;
  go: (view: "hub" | "library" | "settings", opts?: { category?: string; filter?: string }) => void;
  openMod: (id: string) => void;
}) {
  const mods = index?.index.mods ?? [];
  const mine = overview.mods;
  const installedVersion = (id: string) => mine.find((m) => m.id === id)?.version;
  const pathsOk = overview.install_ok && overview.saved_ok;
  const broken = health.filter((h) => h.missing.length || h.changed.length);
  const enabled = mine.filter((m) => m.enabled).length;

  const withCover = (list: HubMod[]) => [...list].sort((a, b) => Number(!!b.cover) - Number(!!a.cover));
  const featured = withCover(mods.filter((m) => m.cover && delivery(m) === "one-click"))
    .concat(mods.filter((m) => m.cover && m.category === "aircraft" && delivery(m) !== "one-click"))
    .slice(0, 6);
  const oneClick = withCover(mods.filter((m) => delivery(m) === "one-click"));
  const aircraft = withCover(mods.filter((m) => m.category === "aircraft"));
  const recent = [...mods].sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? "")).slice(0, 12);
  const mineHub = mine.map((m) => mods.find((h) => h.id === m.id)).filter(Boolean) as HubMod[];

  const card = (m: HubMod) => {
    const have = installedVersion(m.id);
    return (
      <ModCard
        key={m.id}
        mod={m}
        onOpen={() => openMod(m.id)}
        corner={have ? <span className="hp-chip ok">Installed</span> : undefined}
        badge={<ModAction mod={m} installed={have} busy={busy[m.id]} actions={actions} compact />}
      />
    );
  };

  const updateAll = async () => { for (const u of updates) await actions.install(u.id); };
  const repairAll = async () => { for (const h of broken) await actions.repair(h.id, h.name); };

  return (
    <section className="view home">
      {featured.length > 0 ? (
        <FeaturedHero
          mods={featured}
          eyebrow="Featured"
          onOpen={(m) => openMod(m.id)}
          action={(m) => <ModAction mod={m} installed={installedVersion(m.id)} busy={busy[m.id]} actions={actions} hero />}
        />
      ) : (
        <div className="home-welcome">
          <h1>Welcome to Hardpoint</h1>
          <p className="muted">{index ? "Browse the hub to find mods." : "Loading the hub…"}</p>
        </div>
      )}

      {(!pathsOk || mine.length === 0) && (
        <section className="setup" aria-label="Getting started">
          <h2>Get set up</h2>
          <ol>
            <li className={pathsOk ? "done" : ""}>
              <span className="tick">{pathsOk ? <IconCheck /> : "1"}</span>
              <div>
                <strong>Find your DCS folders</strong>
                <p>{pathsOk ? `DCS ${overview.dcs_version ?? ""} found.` : "Hardpoint needs to know where DCS and your Saved Games folder are."}</p>
              </div>
              {!pathsOk && <button className="btn btn-install" onClick={() => go("settings")}>Find DCS</button>}
            </li>
            <li className={mine.length ? "done" : ""}>
              <span className="tick">{mine.length ? <IconCheck /> : "2"}</span>
              <div>
                <strong>Install your first mod</strong>
                <p>Pick one with a <em>One-click install</em> badge, or drop a .zip you already have onto this window.</p>
              </div>
              {!mine.length && <button className="btn" onClick={() => go("hub")}>Browse mods</button>}
            </li>
          </ol>
        </section>
      )}

      <div className="status-row" role="list" aria-label="Status">
        <div className={`status-card ${pathsOk ? "" : "warn"}`} role="listitem">
          {pathsOk ? <IconCheck /> : <IconAlert />}
          <div><strong>{pathsOk ? `DCS ${overview.dcs_version ?? "found"}` : "DCS not found"}</strong><span>{pathsOk ? "Folders are set" : "Set your folders to install mods"}</span></div>
          {!pathsOk && <button className="btn sm" onClick={() => go("settings")}>Fix</button>}
        </div>
        <div className="status-card" role="listitem">
          <IconMine />
          <div><strong>{mine.length ? `${enabled} of ${mine.length} mods on` : "No mods yet"}</strong><span>{mine.length ? "In your library" : "Install one from the hub"}</span></div>
          <button className="btn sm ghost" onClick={() => go("library")}>View</button>
        </div>
        {updates.length > 0 && (
          <div className="status-card accent" role="listitem">
            <IconDownload />
            <div><strong>{updates.length} update{updates.length > 1 ? "s" : ""} available</strong><span>{updates.map((u) => mods.find((m) => m.id === u.id)?.name ?? u.id).slice(0, 2).join(", ")}{updates.length > 2 ? "…" : ""}</span></div>
            <button className="btn sm btn-install" onClick={updateAll}>Update {updates.length > 1 ? "all" : ""}</button>
          </div>
        )}
        {broken.length > 0 && (
          <div className="status-card warn" role="listitem">
            <IconRefresh />
            <div><strong>{broken.length} to re-apply</strong><span>A DCS update replaced some files</span></div>
            <button className="btn sm" onClick={repairAll}>Re-apply</button>
          </div>
        )}
      </div>

      {mineHub.length > 0 && (
        <Shelf title="Your mods" more={<button className="linkish" onClick={() => go("library")}>Manage</button>}>
          {mineHub.map(card)}
        </Shelf>
      )}
      {oneClick.length > 0 && (
        <Shelf title="Install in one click" subtitle="Downloaded, checked and put in the right folder for you." more={<button className="linkish" onClick={() => go("hub", { filter: "oneclick" })}>See all</button>}>
          {oneClick.map(card)}
        </Shelf>
      )}
      {aircraft.length > 0 && (
        <Shelf title="Aircraft" subtitle="Free community-built aircraft and helicopters." more={<button className="linkish" onClick={() => go("hub", { category: "aircraft" })}>See all</button>}>
          {aircraft.map(card)}
        </Shelf>
      )}
      {recent.length > 0 && (
        <Shelf title="Recently updated" more={<button className="linkish" onClick={() => go("hub")}>Browse all</button>}>
          {recent.map(card)}
        </Shelf>
      )}
    </section>
  );
}
