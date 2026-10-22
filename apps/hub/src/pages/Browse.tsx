import type { HubIndex } from "../types";
import { AIRCRAFT_TYPES, CATEGORIES } from "../types";
import { browseHref, type Route } from "../router";
import { search, isOneClick, isIcSafe } from "../data";
import { ModGrid } from "../components/ModGrid";

type B = Extract<Route, { name: "browse" }>;

export function Browse({ index, route }: { index: HubIndex; route: B }) {
  const go = (patch: Partial<B>) => (location.hash = browseHref({ ...route, ...patch }));
  let mods = search(index.mods, route.q);
  const base = mods;
  if (route.oneclick) mods = mods.filter(isOneClick);
  if (route.icsafe) mods = mods.filter(isIcSafe);
  const pool = mods;
  const countFor = (c: string) => pool.filter((m) => m.category === c).length;
  if (route.cat) mods = mods.filter((m) => m.category === route.cat);
  const showTypes = route.cat === "aircraft";
  const typePool = mods;
  const typeCount = (t: string) => typePool.filter((m) => m.aircraft_type === t).length;
  if (showTypes && route.type) mods = mods.filter((m) => m.aircraft_type === route.type);
  const typeInfo = showTypes ? AIRCRAFT_TYPES.find((t) => t.id === route.type) : undefined;
  if (route.sort === "updated") mods = [...mods].sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
  else if (!route.q) mods = [...mods].sort((a, b) => a.name.localeCompare(b.name));
  const cats = CATEGORIES.filter((c) => base.some((m) => m.category === c.id) || c.id === route.cat);
  const catLabel = CATEGORIES.find((c) => c.id === route.cat)?.plural;

  return (
    <main className="wrap browse">
      <aside className="filters" aria-label="Filters">
        <h3>Category</h3>
        <ul>
          <li><button aria-pressed={!route.cat} onClick={() => go({ cat: "", type: "" })}><span>All</span></button></li>
          {cats.map((c) => (
            <li key={c.id}>
              <button aria-pressed={route.cat === c.id} onClick={() => go({ cat: c.id, type: "" })}>
                <span>{c.plural}</span><span className="c">{countFor(c.id)}</span>
              </button>
            </li>
          ))}
        </ul>
        {showTypes && (
          <>
            <h3>Aircraft type</h3>
            <ul>
              <li><button aria-pressed={!route.type} onClick={() => go({ type: "" })}><span>All aircraft</span><span className="c">{typePool.length}</span></button></li>
              {AIRCRAFT_TYPES.map((t) => (
                <li key={t.id}>
                  <button aria-pressed={route.type === t.id} onClick={() => go({ type: t.id })} title={t.help}>
                    <span>{t.label}</span><span className="c">{typeCount(t.id)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <h3>Show only</h3>
        <label><input type="checkbox" checked={route.oneclick} onChange={(e) => go({ oneclick: e.target.checked })} /> One-click install</label>
        <label><input type="checkbox" checked={route.icsafe} onChange={(e) => go({ icsafe: e.target.checked })} /> Declared Saved Games only (safe for integrity-checked servers)</label>
      </aside>
      <section aria-live="polite">
        <div className="toolbar">
          <div className="toolbar-title">
            <h1>{route.q ? <>Results for “{route.q}”</> : typeInfo?.label ?? catLabel ?? "All mods"}</h1>
            <span className="muted">{mods.length} mod{mods.length === 1 ? "" : "s"}</span>
          </div>
          <label className="muted" htmlFor="sort">Sort</label>
          <select id="sort" value={route.sort} onChange={(e) => go({ sort: e.target.value })}>
            <option value="name">{route.q ? "Best match" : "Name"}</option>
            <option value="updated">Recently updated</option>
          </select>
        </div>
        {typeInfo && <p className="type-help">{typeInfo.help}</p>}
        {mods.length ? (
          <ModGrid mods={mods} />
        ) : (
          <div className="empty">
            <p>No mods match these filters.</p>
            <a className="btn" href="#/browse">Clear filters</a>
          </div>
        )}
      </section>
    </main>
  );
}
