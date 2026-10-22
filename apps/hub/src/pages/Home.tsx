import type { HubIndex } from "../types";
import { delivery } from "../types";
import { Loadout } from "../components/Loadout";
import { ModGrid } from "../components/ModGrid";

export function Home({ index }: { index: HubIndex }) {
  const byUpdated = [...index.mods].sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
  // One-click installs first, preferring ones with photos.
  const oneClick = index.mods
    .filter((m) => delivery(m) === "one-click")
    .sort((a, b) => (b.images.length ? 1 : 0) - (a.images.length ? 1 : 0) || (b.updated ?? "").localeCompare(a.updated ?? ""))
    .slice(0, 8);
  const recent = byUpdated.filter((m) => !oneClick.includes(m)).slice(0, 8);

  return (
    <main>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <h1>Find DCS World mods and install them in one click.</h1>
            <p className="lede">
              A shared, open list of community mods. The Hardpoint app puts them in the right folders,
              backs up anything they replace, and takes them out cleanly when you're done.
            </p>
            <div className="actions">
              <a className="btn btn-primary" href="#/browse">Browse {index.mods.length} mods</a>
              <a className="btn" href="#/app">Get the app</a>
            </div>
          </div>
          <Loadout mods={index.mods} />
        </div>
      </section>

      {oneClick.length > 0 && (
        <section className="section">
          <div className="wrap">
            <div className="section-head">
              <div>
                <h2>Install in one click</h2>
                <p className="muted">Hardpoint downloads these, checks the file and puts it in the right place.</p>
              </div>
              <a href="#/browse?oneclick=1">See all</a>
            </div>
            <ModGrid mods={oneClick} />
          </div>
        </section>
      )}

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>Recently updated</h2>
            <a href="#/browse?sort=updated">See all</a>
          </div>
          <ModGrid mods={recent} />
        </div>
      </section>

      <section className="section band">
        <div className="wrap split">
          <div>
            <h2>Mods stay where their authors put them</h2>
          </div>
          <div className="prose">
            <p>
              Hardpoint doesn't host files. Each listing points at the author's own release: a GitHub download
              the app can fetch itself, or a page you download from and then drop onto the app. Listings record
              where a mod installs, so you can see before installing whether it only touches <code>Saved Games</code>{" "}
              or changes core files that multiplayer integrity checks look at.
            </p>
            <p><a href="#/submit">List your mod</a> by adding one small JSON file to the index on GitHub.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
