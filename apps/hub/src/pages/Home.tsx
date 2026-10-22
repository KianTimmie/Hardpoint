import type { HubIndex, HubMod } from "../types";
import { delivery, installLink, latestRelease } from "../types";
import { modHref } from "../router";
import { Loadout } from "../components/Loadout";
import { FeaturedHero, Shelf } from "../../../../packages/ui/Featured.tsx";
import { ModCard } from "../../../../packages/ui/ModCard.tsx";
import { DeliveryTag, IcTag } from "../components/Badges";

const card = (m: HubMod) => <ModCard key={m.id} mod={m} href={modHref(m.id)} badge={<><DeliveryTag mod={m} /><IcTag mod={m} /></>} />;
const coverFirst = (list: HubMod[]) => [...list].sort((a, b) => Number(!!b.cover) - Number(!!a.cover));

function HeroAction({ mod }: { mod: HubMod }) {
  const r = latestRelease(mod);
  if (delivery(mod) === "one-click" && r) return <a className="btn btn-install lg" href={installLink(mod.id, r.version)}>Install with Hardpoint</a>;
  return null;
}

export function Home({ index }: { index: HubIndex }) {
  const mods = index.mods;
  const featured = coverFirst(mods.filter((m) => m.cover && delivery(m) === "one-click"))
    .concat(mods.filter((m) => m.cover && m.category === "aircraft" && delivery(m) !== "one-click"))
    .slice(0, 6);
  const oneClick = coverFirst(mods.filter((m) => delivery(m) === "one-click"));
  const aircraft = coverFirst(mods.filter((m) => m.category === "aircraft"));
  const recent = [...mods].sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? "")).slice(0, 12);

  return (
    <main>
      <section className="spot">
        <div className="wrap">
          <FeaturedHero mods={featured} href={(m) => modHref(m.id)} action={(m) => <HeroAction mod={m} />} eyebrow="Featured mod" />
        </div>
      </section>

      <section className="intro">
        <div className="wrap hero-grid">
          <div>
            <h1>Find DCS World mods and install them in one click.</h1>
            <p className="lede">
              {mods.length} community mods in one open list. The Hardpoint app puts them in the right folders,
              backs up anything they replace, and takes them out cleanly when you're done.
            </p>
            <div className="actions">
              <a className="btn btn-primary" href="#/browse">Browse all mods</a>
              <a className="btn" href="#/app">Get the app</a>
            </div>
          </div>
          <div>
            <Loadout mods={mods} />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          {oneClick.length > 0 && (
            <Shelf title="Install in one click" subtitle="Hardpoint downloads these, checks the file and puts it in the right place." more={<a href="#/browse?oneclick=1">See all</a>}>
              {oneClick.map(card)}
            </Shelf>
          )}
          <Shelf title="Aircraft" subtitle="Free community-built aircraft and helicopters." more={<a href="#/browse?cat=aircraft">See all</a>}>
            {aircraft.map(card)}
          </Shelf>
          <Shelf title="Recently updated" more={<a href="#/browse?sort=updated">See all</a>}>
            {recent.map(card)}
          </Shelf>
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
