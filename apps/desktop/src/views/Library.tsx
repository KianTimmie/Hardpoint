import type { Actions } from "../App";
import type { ModHealth, Overview, ProgressEvent, Update } from "../types";
import { categoryLabel, formatBytes } from "../types";
import { Toggle, humanTarget } from "../components/ui";

export function Library({ overview, health, updates, busy, actions, onBrowse }: {
  overview: Overview; health: ModHealth[]; updates: Update[]; busy: Record<string, ProgressEvent | true>; actions: Actions; onBrowse: () => void;
}) {
  const mods = overview.mods;
  const enabled = mods.filter((m) => m.enabled).length;
  const broken = health.filter((h) => h.missing.length || h.changed.length);
  const importing = Object.keys(busy).filter((k) => k.startsWith("import:")).map((k) => k.slice(7));

  return (
    <section className="view">
      <header className="view-head">
        <div>
          <h1>Library</h1>
          <p className="muted">{mods.length ? `${mods.length} mod${mods.length > 1 ? "s" : ""}, ${enabled} enabled` : "Nothing here yet"}</p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => actions.checkFiles()}>Check files</button>
          <button className="btn" onClick={() => actions.addFromFile()}>Add from file…</button>
        </div>
      </header>

      {broken.map((h) => {
        const n = h.missing.length + h.changed.length;
        return (
          <div className="notice warn" key={h.id} role="status">
            <div>
              <strong>{h.name}</strong>: {n} file{n > 1 ? "s were" : " was"} {h.changed.length ? "replaced" : "removed"}
              {h.dcs_updated ? ", most likely by the DCS update." : " since it was installed."}
              <span className="muted"> Re-applying keeps the new DCS files as the backup.</span>
            </div>
            <button className="btn" disabled={!!busy[h.id]} onClick={() => actions.repair(h.id, h.name)}>Re-apply</button>
          </div>
        );
      })}

      {importing.map((f) => <div className="notice" key={f}>Adding {f}…</div>)}

      {mods.length === 0 ? (
        <div className="empty-state">
          <h2>Add your first mod</h2>
          <p>Drop a .zip, .7z or mod folder anywhere in this window, or pick one from the hub.</p>
          <div className="row"><button className="btn btn-install" onClick={onBrowse}>Browse the hub</button><button className="btn" onClick={() => actions.addFromFile()}>Add from file…</button></div>
        </div>
      ) : (
        <table className="stores lib">
          <thead>
            <tr><th scope="col"><span className="sr">Enabled</span></th><th scope="col">Mod</th><th scope="col">Category</th><th scope="col">Installs to</th><th scope="col" className="r">Size</th><th scope="col"><span className="sr">Actions</span></th></tr>
          </thead>
          <tbody>
            {mods.map((m) => {
              const up = updates.find((u) => u.id === m.id);
              const b = busy[m.id];
              const progress = b && b !== true ? b : null;
              return (
                <tr key={m.id} className={m.enabled ? "" : "off"}>
                  <td className="tcell"><Toggle on={m.enabled} label={`Enable ${m.name}`} busy={!!b} onChange={(v) => actions.toggle(m.id, v)} /></td>
                  <td className="name">
                    <span className="n">{m.name}</span>
                    <span className="sum">
                      {m.source.type === "hub" ? `Version ${m.version}, from the hub` : `Added from ${m.source.file_name}`}
                    </span>
                    {progress && <span className="sum">{progress.phase === "download" ? "Downloading update…" : "Installing…"}</span>}
                  </td>
                  <td>{categoryLabel(m.category)}</td>
                  <td>
                    {m.writes_install_dir && <span className="tag ic" title="Changes files in the DCS install folder; may fail multiplayer integrity checks">DCS folder</span>}
                    {!m.writes_install_dir && <span className="loc">{m.targets.length === 1 ? humanTarget(m.targets[0]) : "Saved Games"}</span>}
                  </td>
                  <td className="num r">{formatBytes(m.bytes)}</td>
                  <td className="acts">
                    {up && <button className="btn sm btn-install" disabled={!!b} onClick={() => actions.install(m.id)}>Update to {up.latest}</button>}
                    {m.targets[0] && <button className="btn sm ghost" onClick={() => actions.reveal(m.targets[0])}>Open folder</button>}
                    <button className="btn sm ghost" disabled={!!b} onClick={() => actions.remove(m.id, m.name)}>Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {mods.length > 0 && <p className="hint">Drop a .zip, .7z or mod folder anywhere in this window to add it.</p>}
    </section>
  );
}
