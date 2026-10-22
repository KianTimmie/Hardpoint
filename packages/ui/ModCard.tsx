// Shared mod card and photo, used by the hub website and the desktop app.
import { useEffect, useState, type ReactNode } from "react";
import type { HubMod } from "../hub-types/index.ts";
import { cardPhoto, categoryLabel, latestRelease } from "../hub-types/index.ts";
import { CategoryGlyph } from "./glyphs.tsx";

/** A photo for a mod: by default its card photo (real-world cover, else the author's first
 *  screenshot). Shows the category drawing if there's none or it fails to load. */
export function ModImage({ mod, src, className = "", eager = false }: { mod: HubMod; src?: string; className?: string; eager?: boolean }) {
  const url = src ?? cardPhoto(mod);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const show = url && !failed;
  const credit = mod.cover && url === mod.cover.url ? `Photo: ${mod.cover.credit} (${mod.cover.license})` : undefined;
  return (
    <div className={`hp-photo ${show && loaded ? "is-loaded" : ""} ${className}`} data-category={mod.category} title={credit}>
      {!(show && loaded) && (
        <div className="hp-photo-fallback">
          <CategoryGlyph category={mod.category} className="hp-glyph" />
        </div>
      )}
      {show && (
        <img
          src={url}
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

/** Credit line for a cover photo, linking to its licence source. */
export function CoverCredit({ mod, open }: { mod: HubMod; open?: (url: string) => void }) {
  if (!mod.cover) return null;
  const c = mod.cover;
  const link = open ? (
    <button type="button" className="hp-linkish" onClick={() => open(c.source)}>{c.license}</button>
  ) : (
    <a href={c.source} target="_blank" rel="noopener">{c.license}</a>
  );
  return <p className="hp-credit">Real aircraft photo: {c.credit}, {link}</p>;
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

/** Opened-card gallery: real-world cover first, then the author's screenshots. */
export function PhotoGallery({ mod, open, className = "" }: { mod: HubMod; open?: (url: string) => void; className?: string }) {
  const all = [...(mod.cover ? [mod.cover.url] : []), ...mod.images];
  const [active, setActive] = useState(all[0]);
  useEffect(() => setActive(all[0]), [mod.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const isCover = !!mod.cover && active === mod.cover.url;
  return (
    <div className={`hp-gallery ${className}`}>
      <ModImage mod={mod} src={active} className="hp-gallery-main" eager key={active ?? "none"} />
      {isCover ? <CoverCredit mod={mod} open={open} /> : active ? <p className="hp-credit">Screenshot from the author's page</p> : null}
      {all.length > 1 && (
        <>
          <div className="hp-section-label">{mod.cover && mod.images.length ? "Real aircraft and in DCS" : "Screenshots"}</div>
          <div className="hp-shots" role="list" aria-label="Photos">
            {all.map((src, n) => (
              <button key={src} type="button" role="listitem" className="hp-shot" aria-pressed={active === src}
                aria-label={mod.cover && n === 0 ? "Real aircraft photo" : `Screenshot ${mod.cover ? n : n + 1}`} onClick={() => setActive(src)}>
                <ModImage mod={mod} src={src} />
                {mod.cover && n === 0 && <span className="hp-shot-tag">Real</span>}
                {(!mod.cover || n > 0) && <span className="hp-shot-tag">In DCS</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
