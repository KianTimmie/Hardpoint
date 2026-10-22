import type { HubIndex } from "../types";
import { modHref } from "../router";
import { ModImage } from "../../../../packages/ui/ModCard.tsx";

export function Credits({ index }: { index: HubIndex }) {
  const withCover = index.mods.filter((m) => m.cover).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <main className="wrap page">
      <h1>Photo credits</h1>
      <div className="prose">
        <p className="muted" style={{ fontSize: "1.1rem" }}>
          Cover photos of real aircraft and equipment come from Wikimedia Commons and are public domain or
          Creative Commons licensed. Screenshots of the mods themselves belong to their authors and are linked
          from the authors' own pages.
        </p>
      </div>
      <ul className="credits">
        {withCover.map((m) => (
          <li key={m.id}>
            <ModImage mod={m} className="credits-thumb" />
            <div>
              <a href={modHref(m.id)} className="credits-name">{m.name}</a>
              <div className="muted">{m.cover!.credit}</div>
              <div><a href={m.cover!.source} target="_blank" rel="noopener">{m.cover!.license}, Wikimedia Commons</a></div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
