import { useState } from "react";
import type { Actions } from "../App";
import type { Detection, Overview } from "../types";
import { asError } from "../types";
import type { Toast } from "../components/ui";

export function Settings({ overview, actions, toast, demo }: {
  overview: Overview; actions: Actions; toast: (tone: Toast["tone"], text: string) => void; demo: boolean;
}) {
  const [install, setInstall] = useState(overview.config.install_dir ?? "");
  const [saved, setSaved] = useState(overview.config.saved_dir ?? "");
  const [indexUrl, setIndexUrl] = useState(overview.config.index_url);
  const [found, setFound] = useState<Detection | null>(null);
  const dirty = install !== (overview.config.install_dir ?? "") || saved !== (overview.config.saved_dir ?? "") || indexUrl !== overview.config.index_url;
  const anyEnabled = overview.mods.some((m) => m.enabled);

  const save = async () => {
    try {
      const o = await actions.saveConfig({ install_dir: install || null, saved_dir: saved || null, index_url: indexUrl });
      actions.setOverview(o);
      toast("ok", "Settings saved.");
      if (indexUrl !== overview.config.index_url) actions.refreshIndex();
    } catch (e) { toast("error", asError(e).message); }
  };
  const detect = async () => {
    const d = await actions.detectPaths();
    setFound(d);
    if (d.install_candidates[0]) setInstall(d.install_candidates[0]);
    if (d.saved_candidates[0]) setSaved(d.saved_candidates[0]);
  };
  const browse = async (which: "install" | "saved") => {
    const p = await actions.pickFolder(which === "install" ? "DCS install folder" : "Saved Games\\DCS folder");
    if (p) (which === "install" ? setInstall : setSaved)(p);
  };

  return (
    <section className="view settings">
      <header className="view-head"><h1>Settings</h1></header>

      {(!overview.install_ok || !overview.saved_ok) && (
        <div className="notice warn">Hardpoint needs to know where DCS is installed and where it keeps your Saved Games folder. Try <strong>Find DCS</strong>, or pick the folders yourself.</div>
      )}

      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <fieldset disabled={anyEnabled}>
          <legend><h2>DCS folders</h2></legend>
          {anyEnabled && <p className="muted small">Disable all mods before changing these, so their files come out of the old location first.</p>}
          <div className="field">
            <label htmlFor="install">DCS install folder</label>
            <div className="row">
              <input id="install" className="text mono grow" value={install} onChange={(e) => setInstall(e.target.value)} placeholder="C:\Program Files\Eagle Dynamics\DCS World" />
              <button type="button" className="btn" onClick={() => browse("install")}>Browse…</button>
            </div>
            <p className="help">{overview.install_ok ? `Found DCS ${overview.dcs_version ?? ""}`.trim() : "The folder that contains bin\\DCS.exe."}</p>
          </div>
          <div className="field">
            <label htmlFor="saved">Saved Games folder</label>
            <div className="row">
              <input id="saved" className="text mono grow" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="C:\Users\you\Saved Games\DCS" />
              <button type="button" className="btn" onClick={() => browse("saved")}>Browse…</button>
            </div>
            <p className="help">Usually Saved Games\DCS. Most mods install here.</p>
          </div>
          <button type="button" className="btn" onClick={detect}>Find DCS</button>
          {found && (
            <p className="help">
              {found.install_candidates.length ? `Found ${found.install_candidates.length} install${found.install_candidates.length > 1 ? "s" : ""}.` : "No DCS install found automatically."}
              {found.install_candidates.length > 1 && " The first one has been filled in; pick another with Browse if needed."}
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend><h2>Hub</h2></legend>
          <div className="field">
            <label htmlFor="idx">Hub index address</label>
            <input id="idx" className="text mono" value={indexUrl} onChange={(e) => setIndexUrl(e.target.value)} />
            <p className="help">Where the list of mods comes from. For local development, run <code>npm run index:dev</code> and use <code>http://localhost:8765/index.json</code>.</p>
          </div>
        </fieldset>

        <div className="row">
          <button className="btn btn-install" type="submit" disabled={!dirty}>Save settings</button>
        </div>
      </form>

      <section className="about">
        <h2>Hardpoint data</h2>
        <p className="muted">Downloaded mods, backups of replaced files and the install record live in <code className="mono">{overview.data_dir}</code>.</p>
        <button className="btn" onClick={() => actions.reveal("data")} disabled={demo}>Open data folder</button>
      </section>
    </section>
  );
}
