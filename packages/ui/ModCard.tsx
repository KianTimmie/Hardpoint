// Shared mod card and photo, used by the hub website and the desktop app.
import { useState, type ReactNode } from "react";
import type { HubMod } from "../hub-types/index.ts";
import { categoryLabel, latestRelease } from "../hub-types/index.ts";
import { CategoryGlyph } from "./glyphs.tsx";

/** The mod's photo, or a category drawing if it has none or the image fails to load. */
export function ModImage({ mod, index = 0, className = "", eager = false }: { mod: HubMod; index?: number; className?: string; eager?: boolean }) {
  const src = mod.images?.[index];
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const show = src && !failed;
  return (
    <div className={`hp-photo ${show && loaded ? "is-loaded" : ""} ${className}`} data-category={mod.category}>
      {!(show && loaded) && (
        <div className="hp-photo-fallback">
          <CategoryGlyph category={mod.category} className="hp-glyph" />
        </div>
      )}
      {show && (
        <img
          src={src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export function ModCard({ mod, href, onOpen, badge, corner, selected }: {
  mod: HubMod;
  /** Link target (website). */
  href?: string;
  /** Click handler (desktop app). */
  onOpen?: () => void;
  /** Bottom-row status, e.g. the delivery badge or an Install button. */
  badge?: ReactNode;
  /** Optional chip over the photo, e.g. "Installed". */
  corner?: ReactNode;
  selected?: boolean;
}) {
  const r = latestRelease(mod);
  const body = (
    <>
      <ModImage mod={mod} />
      {corner && <div className="hp-card-corner">{corner}</div>}
      <div className="hp-card-body">
        <h3 className="hp-card-title">{mod.name}</h3>
        <p className="hp-card-sum">{mod.summary}</p>
        <div className="hp-card-meta">
          <span>{categoryLabel(mod.category)}</span>
          {r && <span className="hp-card-ver">{/^\d/.test(r.version) ? `v${r.version}` : r.version}</span>}
        </div>
      </div>
    </>
  );
  return (
    <article className={`hp-card${selected ? " is-selected" : ""}`}>
      {href ? (
        <a className="hp-card-hit" href={href}>{body}</a>
      ) : (
        <button type="button" className="hp-card-hit" onClick={onOpen} aria-pressed={selected}>{body}</button>
      )}
      {badge && <div className="hp-card-foot">{badge}</div>}
    </article>
  );
}

export function CardGrid({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return <div className={`hp-grid${compact ? " is-compact" : ""}`}>{children}</div>;
}
