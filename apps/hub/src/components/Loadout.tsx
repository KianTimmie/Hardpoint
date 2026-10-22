import { useEffect, useRef, useState } from "react";
import type { Category, HubMod } from "../types";
import { AIRCRAFT_TYPES, CATEGORIES } from "../types";
import { browseHref } from "../router";

// A stores-management page: nine stations numbered left to right as on a real loading chart.
// Aircraft sit on the centreline station; everything else hangs under the wings.
const STATIONS: Category[] = ["livery", "mission", "campaign", "terrain", "aircraft", "script", "sound", "tech", "utility"];
const X = [70, 165, 260, 355, 450, 545, 640, 735, 830];
const CENTRE = 4;

const BLURB: Record<Category, string> = {
  aircraft: "Flyable and AI aircraft and helicopters",
  livery: "Paint schemes for aircraft you already fly",
  mission: "Single missions, ready to fly",
  campaign: "Linked missions that tell a story",
  terrain: "Maps and terrain add-ons",
  script: "Mission scripting frameworks and tools",
  sound: "Engine, cockpit and environment sound packs",
  tech: "Ships, vehicles, weapons and other assets",
  utility: "Programs that run alongside DCS",
  other: "Everything else",
};

/** Underside of the wing at x (slight anhedral towards the tips). */
const wingY = (x: number) => 106 + Math.max(0, Math.abs(x - 450) - 40) * (12 / 370);
const delayOf = (i: number) => 250 + Math.abs(i - CENTRE) * 120;

const reduceMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Counts up from 0 once `run` turns true. */
function useCountUp(target: number, run: boolean, delay: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (reduceMotion()) { setN(target); return; }
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / 700));
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, target, delay]);
  return n;
}

function Station({ cat, i, n, armed, dropping, onPick, onHover }: {
  cat: Category; i: number; n: number; armed: boolean; dropping: boolean;
  onPick: (cat: Category, i: number) => void; onHover: (c: Category | null) => void;
}) {
  const x = X[i];
  const centre = i === CENTRE;
  const top = centre ? 120 : wingY(x);
  const r = centre ? 33 : 25;
  const cy = top + (centre ? 14 : 16) + r;
  const shown = useCountUp(n, armed, delayOf(i) + 250);
  const label = CATEGORIES.find((c) => c.id === cat)!.plural;
  const fins = centre ? [] : [45, 135, 225, 315];
  return (
    <a
      className={`station${n ? " loaded" : ""}${dropping ? " dropping" : ""}`}
      href={browseHref({ cat })}
      style={{ ["--d" as string]: `${delayOf(i)}ms`, ["--rot" as string]: `${i < CENTRE ? -14 : i > CENTRE ? 14 : 0}deg` }}
      aria-label={`Station ${i + 1}: ${label}, ${n} mod${n === 1 ? "" : "s"}`}
      onClick={(e) => { e.preventDefault(); onPick(cat, i); }}
      onMouseEnter={() => onHover(cat)} onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(cat)} onBlur={() => onHover(null)}
    >
      <line className="pylon" x1={x} y1={top} x2={x} y2={cy - r + 2} />
      <line className="drop-path" x1={x} y1={cy + r + 6} x2={x} y2={cy + r + 22} />
      <g className="store">
        {fins.map((a) => {
          const rad = (a * Math.PI) / 180;
          return <line key={a} className="fin" x1={x + Math.cos(rad) * (r - 6)} y1={cy + Math.sin(rad) * (r - 6)} x2={x + Math.cos(rad) * (r + 9)} y2={cy + Math.sin(rad) * (r + 9)} />;
        })}
        <circle className="body" cx={x} cy={cy} r={r} />
        <circle className="ring" cx={x} cy={cy} r={r - 5} />
        <text className="count" x={x} y={cy + (centre ? 10 : 8)}>{shown}</text>
      </g>
      <text className="label" x={x} y={234}>{label}</text>
      <rect className="rdy" x={x - 20} y={244} width={40} height={16} rx={2} />
      <text className="sta" x={x} y={256}>STA {i + 1}</text>
    </a>
  );
}

export function Loadout({ mods }: { mods: HubMod[] }) {
  const counts = new Map<Category, number>();
  for (const m of mods) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
  const plural = (c: Category) => CATEGORIES.find((x) => x.id === c)!.plural;
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<Category | null>(null);
  const [drop, setDrop] = useState<number | null>(null);

  // Load the stores when the panel scrolls into view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduceMotion() || typeof IntersectionObserver === "undefined") { setArmed(true); setReady(true); return; }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { setArmed(true); io.disconnect(); }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setReady(true), delayOf(0) + 700);
    return () => clearTimeout(t);
  }, [armed]);

  const pick = (cat: Category, i: number) => {
    const go = () => (location.hash = browseHref({ cat }));
    if (reduceMotion()) return go();
    setDrop(i);
    setTimeout(go, 420);
  };

  const air = mods.filter((m) => m.category === "aircraft");
  const total = mods.length;
  const sel = hover;

  return (
    <figure className="sms-wrap">
      <div ref={ref} className={`sms${armed ? " is-armed" : ""}${ready ? " is-ready" : ""}`}>
        <div className="sms-head" aria-hidden="true">
          <span className="sms-tag">SMS</span>
          <span>HARDPOINT STORES</span>
          <span className="sms-mode">{armed ? "MASTER ARM" : "SAFE"}</span>
        </div>
        <svg className="loadout" viewBox="10 0 880 266" role="group" aria-label="Browse mods by category">
          <defs>
            <linearGradient id="sms-scan" x1="0" x2="1">
              <stop offset="0" stopColor="#8fe3a8" stopOpacity="0" />
              <stop offset="1" stopColor="#8fe3a8" stopOpacity="0.16" />
            </linearGradient>
          </defs>
          <rect className="scan" x="-140" y="0" width="140" height="266" fill="url(#sms-scan)" />

          {/* Airframe, front view */}
          <g className="airframe-g" aria-hidden="true">
            <path className="stab" d="M412 82 L322 90 M488 82 L578 90" />
            <path className="airframe" d="M446 64 L450 6 L454 64 Z" />
            <path className="airframe" d="M418 96 L40 112 Q34 114 40 118 L420 110 Z" />
            <path className="airframe" d="M482 96 L860 112 Q866 114 860 118 L480 110 Z" />
            <rect className="airframe" x="396" y="84" width="20" height="30" rx="5" />
            <rect className="airframe" x="484" y="84" width="20" height="30" rx="5" />
            <rect className="intake" x="400" y="90" width="12" height="18" rx="3" />
            <rect className="intake" x="488" y="90" width="12" height="18" rx="3" />
            <ellipse className="airframe" cx="450" cy="92" rx="36" ry="30" />
            <ellipse className="canopy" cx="450" cy="70" rx="15" ry="13" />
            <circle className="radome" cx="450" cy="96" r="9" />
            <circle className="nav red" cx="37" cy="115" r="4" />
            <circle className="nav green" cx="863" cy="115" r="4" />
            <circle className="strobe" cx="450" cy="6" r="3" />
          </g>

          {STATIONS.map((cat, i) => (
            <Station key={cat} cat={cat} i={i} n={counts.get(cat) ?? 0} armed={armed} dropping={drop === i} onPick={pick} onHover={setHover} />
          ))}
        </svg>

        <div className="sms-readout" aria-live="polite">
          {sel ? (
            <>
              <div className="ro-main">
                <span className="ro-sta">STA {STATIONS.indexOf(sel) + 1}</span>
                <strong>{plural(sel)}</strong>
                <span className="ro-qty">QTY {counts.get(sel) ?? 0}</span>
              </div>
              <div className="ro-sub">
                {sel === "aircraft"
                  ? AIRCRAFT_TYPES.map((t) => <span key={t.id} className={`ro-pill t-${t.id}`}>{t.short} {air.filter((m) => m.aircraft_type === t.id).length}</span>)
                  : BLURB[sel]}
              </div>
            </>
          ) : (
            <>
              <div className="ro-main">
                <span className="ro-sta">ALL STA</span>
                <strong>{total} stores loaded</strong>
                <span className="ro-qty">9 STATIONS</span>
              </div>
              <div className="ro-sub ro-hint">Select a station to see what's on it. Click to release.</div>
            </>
          )}
        </div>
      </div>
      <ul className="stations-list">
        {STATIONS.map((cat, i) => (
          <li key={cat} style={{ ["--d" as string]: `${i * 50}ms` }}>
            <a href={browseHref({ cat })}><span className="sl-sta">STA {i + 1}</span><span>{plural(cat)}</span><span className="sl-n">{counts.get(cat) ?? 0}</span></a>
          </li>
        ))}
      </ul>
    </figure>
  );
}
