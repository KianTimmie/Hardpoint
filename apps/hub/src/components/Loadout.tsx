import type { Category, HubMod } from "../types";
import { CATEGORIES } from "../types";
import { browseHref } from "../router";

// Nine weapon stations, numbered left to right as on a real loading chart.
// Aircraft sit on the centreline station; everything else hangs under the wings.
const STATIONS: Category[] = ["livery", "mission", "campaign", "terrain", "aircraft", "script", "sound", "tech", "utility"];
const X = [70, 165, 260, 355, 450, 545, 640, 735, 830];

export function Loadout({ mods }: { mods: HubMod[] }) {
  const counts = new Map<Category, number>();
  for (const m of mods) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
  const plural = (c: Category) => CATEGORIES.find((x) => x.id === c)!.plural;

  return (
    <figure style={{ margin: 0 }}>
      <svg className="loadout" viewBox="10 0 880 262" role="group" aria-label="Browse mods by category">
        {/* Airframe, front view */}
        <path className="detail" d="M450 4 L450 40" />
        <path className="airframe" d="M444 38 L450 4 L456 38 Z" />
        <path className="wing" d="M36 80 Q 450 70 864 80" />
        <rect className="airframe" x="404" y="62" width="18" height="30" rx="4" />
        <rect className="airframe" x="478" y="62" width="18" height="30" rx="4" />
        <circle className="airframe" cx="450" cy="70" r="32" />
        <path className="detail" d="M432 52 Q 450 34 468 52" />
        <circle className="detail" cx="450" cy="74" r="8" />

        {STATIONS.map((cat, i) => {
          const x = X[i];
          const n = counts.get(cat) ?? 0;
          const top = i === 4 ? 102 : 80;
          return (
            <a key={cat} className={`station${n ? " loaded" : ""}`} href={browseHref({ cat })} aria-label={`Station ${i + 1}: ${plural(cat)}, ${n} mod${n === 1 ? "" : "s"}`}>
              <line className="pylon" x1={x} y1={top} x2={x} y2={i === 4 ? 116 : 112} />
              <rect className="store" x={x - 30} y={i === 4 ? 116 : 112} width={60} height={78} rx={28} />
              <text className="count" x={x} y={i === 4 ? 164 : 160}>{n}</text>
              <text className="label" x={x} y={222}>{plural(cat)}</text>
              <text className="sta" x={x} y={245}>Station {i + 1}</text>
            </a>
          );
        })}
      </svg>
      <figcaption className="loadout-caption">Each station carries one kind of mod. Pick one to see what's on it.</figcaption>
      <ul className="stations-list">
        {STATIONS.map((cat) => (
          <li key={cat}><a href={browseHref({ cat })}><span>{plural(cat)}</span><span>{counts.get(cat) ?? 0}</span></a></li>
        ))}
      </ul>
    </figure>
  );
}
