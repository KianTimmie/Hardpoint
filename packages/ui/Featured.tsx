// Spotlight carousel and horizontal shelves, shared by the website and the desktop app.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { HubMod } from "../hub-types/index.ts";
import { categoryLabel, latestRelease } from "../hub-types/index.ts";
import { ModImage } from "./ModCard.tsx";

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Large photo spotlight that rotates through mods with real-aircraft covers.
 * Auto-advances every `interval` ms, pauses on hover/focus, and never auto-advances
 * when the viewer prefers reduced motion.
 */
export function FeaturedHero({ mods, action, onOpen, href, interval = 7000, eyebrow = "Featured" }: {
  mods: HubMod[];
  /** Primary button for the current mod (Install, Get it…). */
  action?: (m: HubMod) => ReactNode;
  onOpen?: (m: HubMod) => void;
  href?: (m: HubMod) => string;
  interval?: number;
  eyebrow?: string;
}) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = mods.length;
  useEffect(() => { if (i >= n) setI(0); }, [n, i]);
  useEffect(() => {
    if (paused || n < 2 || reduceMotion()) return;
    const t = setTimeout(() => setI((x) => (x + 1) % n), interval);
    return () => clearTimeout(t);
  }, [i, paused, n, interval]);
  if (!n) return null;
  const m = mods[Math.min(i, n - 1)];
  const r = latestRelease(m);
  const title = href ? <a href={href(m)}>{m.name}</a> : onOpen ? <button type="button" className="hp-hero-titlebtn" onClick={() => onOpen(m)}>{m.name}</button> : m.name;

  return (
    <section
      className="hp-hero"
      aria-roledescription="carousel"
      aria-label={eyebrow}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="hp-hero-media" key={m.id}>
        <ModImage mod={m} eager className="hp-hero-photo" />
      </div>
      <div className="hp-hero-shade" />
      <div className="hp-hero-body" aria-live="polite">
        <div className="hp-hero-eyebrow">{eyebrow}<span>{categoryLabel(m.category)}{r ? `, ${/^\d/.test(r.version) ? "v" : ""}${r.version}` : ""}</span></div>
        <h2 className="hp-hero-title">{title}</h2>
        <p className="hp-hero-sum">{m.summary}</p>
        <div className="hp-hero-actions">
          {action?.(m)}
          {onOpen && <button type="button" className="hp-hero-more" onClick={() => onOpen(m)}>Details</button>}
          {href && <a className="hp-hero-more" href={href(m)}>Details</a>}
        </div>
      </div>
      {m.cover && <div className="hp-hero-credit">Photo: {m.cover.credit}, {m.cover.license}</div>}
      {n > 1 && (
        <div className="hp-hero-nav">
          <button type="button" className="hp-hero-arrow" aria-label="Previous" onClick={() => setI((i - 1 + n) % n)}>‹</button>
          <div className="hp-hero-dots" role="tablist" aria-label="Choose featured mod">
            {mods.map((x, k) => (
              <button key={x.id} type="button" role="tab" aria-selected={k === i} aria-label={x.name} onClick={() => setI(k)} />
            ))}
          </div>
          <button type="button" className="hp-hero-arrow" aria-label="Next" onClick={() => setI((i + 1) % n)}>›</button>
        </div>
      )}
    </section>
  );
}

/** A titled horizontal row of cards with scroll buttons. */
export function Shelf({ title, subtitle, more, children }: { title: string; subtitle?: string; more?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
  };
  useEffect(() => {
    update();
    const el = ref.current;
    const ro = new ResizeObserver(update);
    if (el) ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.85), behavior: reduceMotion() ? "auto" : "smooth" });
  return (
    <section className="hp-shelf">
      <div className="hp-shelf-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="hp-shelf-tools">
          {more}
          <button type="button" className="hp-shelf-btn" aria-label={`Scroll ${title} left`} disabled={edges.start} onClick={() => scroll(-1)}>‹</button>
          <button type="button" className="hp-shelf-btn" aria-label={`Scroll ${title} right`} disabled={edges.end} onClick={() => scroll(1)}>›</button>
        </div>
      </div>
      <div className="hp-shelf-track" ref={ref} onScroll={update}>{children}</div>
    </section>
  );
}
