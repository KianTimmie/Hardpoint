import { useEffect, useState } from "react";
import type { HubIndex, HubMod } from "./types";
import { delivery, latestRelease, writesInstallDir } from "./types";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; index: HubIndex };

// A single-file preview build can inline the index as window.__HUB_INDEX__.
declare global { interface Window { __HUB_INDEX__?: HubIndex } }

export function useIndex(): State {
  const [s, setS] = useState<State>(() => (window.__HUB_INDEX__ ? { status: "ready", index: window.__HUB_INDEX__ } : { status: "loading" }));
  useEffect(() => {
    if (window.__HUB_INDEX__) return;
    fetch("./index.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`index.json returned ${r.status}`))))
      .then((index: HubIndex) => setS({ status: "ready", index }))
      .catch((e) => setS({ status: "error", message: String(e.message ?? e) }));
  }, []);
  return s;
}

/** Simple ranked search over name, summary, tags, authors. */
export function search(mods: HubMod[], q: string): HubMod[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return mods;
  const scored = mods.map((m) => {
    const name = m.name.toLowerCase();
    const hay = [m.summary, m.tags.join(" "), m.authors.map((a) => a.name).join(" "), m.id, m.category].join(" ").toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (name.startsWith(t)) score += 6;
      else if (name.includes(t)) score += 4;
      else if (hay.includes(t)) score += 1;
      else return { m, score: -1 };
    }
    return { m, score };
  });
  return scored.filter((x) => x.score >= 0).sort((a, b) => b.score - a.score).map((x) => x.m);
}

export const isOneClick = (m: HubMod) => delivery(m) === "one-click";
/** Only true when the release's install rules say Saved Games only. */
export const isIcSafe = (m: HubMod) => writesInstallDir(latestRelease(m)) === false;
