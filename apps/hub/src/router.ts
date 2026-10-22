import { useEffect, useState } from "react";

// Hash routing so the site works on any static host (GitHub Pages, artifacts).
export type Route =
  | { name: "home" }
  | { name: "browse"; q: string; cat: string; oneclick: boolean; icsafe: boolean; sort: string }
  | { name: "mod"; id: string }
  | { name: "submit" }
  | { name: "app" }
  | { name: "credits" }
  | { name: "notfound" };

export function parse(hash: string): Route {
  const [path, qs = ""] = hash.replace(/^#/, "").split("?");
  const p = new URLSearchParams(qs);
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "browse")
    return { name: "browse", q: p.get("q") ?? "", cat: p.get("cat") ?? "", oneclick: p.get("oneclick") === "1", icsafe: p.get("icsafe") === "1", sort: p.get("sort") ?? "name" };
  if (parts[0] === "mod" && parts[1]) return { name: "mod", id: decodeURIComponent(parts[1]) };
  if (parts[0] === "submit") return { name: "submit" };
  if (parts[0] === "app") return { name: "app" };
  if (parts[0] === "credits") return { name: "credits" };
  return { name: "notfound" };
}

export function browseHref(o: Partial<{ q: string; cat: string; oneclick: boolean; icsafe: boolean; sort: string }>) {
  const p = new URLSearchParams();
  if (o.q) p.set("q", o.q);
  if (o.cat) p.set("cat", o.cat);
  if (o.oneclick) p.set("oneclick", "1");
  if (o.icsafe) p.set("icsafe", "1");
  if (o.sort && o.sort !== "name") p.set("sort", o.sort);
  const s = p.toString();
  return `#/browse${s ? `?${s}` : ""}`;
}

export const modHref = (id: string) => `#/mod/${encodeURIComponent(id)}`;

export function useRoute(): Route {
  const [r, setR] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => {
      setR(parse(location.hash));
      if (!location.hash.startsWith("#/browse")) window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}
