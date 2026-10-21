import type { HubMod } from "../types";
import { categoryLabel, latestRelease } from "../types";
import { modHref } from "../router";
import { DeliveryTag, IcTag } from "./Badges";

export function formatDate(d?: string) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function StoresTable({ mods, caption }: { mods: HubMod[]; caption: string }) {
  if (!mods.length) return null;
  return (
    <table className="stores">
      <caption className="sr">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Mod</th>
          <th scope="col">Category</th>
          <th scope="col">Version</th>
          <th scope="col">How to get it</th>
          <th scope="col">Updated</th>
        </tr>
      </thead>
      <tbody>
        {mods.map((m) => {
          const r = latestRelease(m);
          return (
            <tr key={m.id} onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) location.hash = modHref(m.id); }}>
              <td className="name">
                <a href={modHref(m.id)}>{m.name}</a>
                <span className="sum">{m.summary}</span>
              </td>
              <td>{categoryLabel(m.category)}</td>
              <td className="num">{r?.version ?? "—"}</td>
              <td><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><DeliveryTag mod={m} /><IcTag mod={m} /></div></td>
              <td className="num hide-sm">{formatDate(m.updated)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
