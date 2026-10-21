import type { HubIndex } from "../types";
import { Loadout } from "../components/Loadout";
import { StoresTable } from "../components/StoresTable";

export function Home({ index }: { index: HubIndex }) {
  const recent = [...index.mods].sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? "")).slice(0, 8);
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
              <a className="btn" href="#/browse">Browse {index.mods.length} mods</a>
              <a className="btn" href="#/app">Get the app</a>
            </div>
          </div>
          <Loadout mods={index.mods} />
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>Recently updated</h2>
            <a href="#/browse?sort=updated">See all</a>
          </div>
          <StoresTable mods={recent} caption="Recently updated mods" />
        </div>
      </section>

      <section className="section">
        <div className="wrap"><div className="prose">
          <h2>Mods stay where their authors put them</h2>
          <p style={{ marginTop: 12 }}>
            Hardpoint doesn't host files. Each listing points at the author's own release: a GitHub download
            the app can fetch itself, or a page you download from and then drop onto the app. Listings record
            where a mod installs, so you can see before installing whether it only touches <code>Saved Games</code>{" "}
            or changes core files that multiplayer integrity checks look at.
          </p>
          <p><a href="#/submit">List your mod</a> by adding one small JSON file to the index on GitHub.</p>
        </div></div>
      </section>
    </main>
  );
}
