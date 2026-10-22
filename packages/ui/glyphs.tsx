// Line drawings used when a mod has no photo. Drawn like technical illustrations:
// single stroke weight, currentColor, on a 120x68 canvas (16:9-ish).
import type { ReactElement } from "react";
import type { Category } from "../hub-types/index.ts";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const drawings: Record<Category, ReactElement> = {
  // Jet, plan view.
  aircraft: (
    <g {...P}>
      <path d="M60 8 L64 20 L64 30 L98 42 L98 47 L64 41 L63 52 L72 58 L72 61 L60 58 L48 61 L48 58 L57 52 L56 41 L22 47 L22 42 L56 30 L56 20 Z" />
      <path d="M58 16 L62 16" />
    </g>
  ),
  // Tail fin with squadron stripes.
  livery: (
    <g {...P}>
      <path d="M30 58 L52 14 L66 14 L74 58 Z" />
      <path d="M44 40 L71 40 M48 32 L69 32" />
      <circle cx="58" cy="24" r="4" />
      <path d="M78 58 L96 58" />
    </g>
  ),
  // Contour lines.
  terrain: (
    <g {...P}>
      <path d="M18 54 C32 40 44 46 56 34 S84 22 102 30" />
      <path d="M26 58 C40 48 52 52 64 42 S88 34 100 40" />
      <path d="M44 32 C50 22 62 18 70 24 S66 36 56 36 S42 38 44 32 Z" />
      <path d="M54 30 C57 26 63 25 64 28 S60 32 54 30 Z" />
    </g>
  ),
  // Route with waypoints.
  mission: (
    <g {...P}>
      <path d="M22 52 L46 30 L72 42 L96 18" strokeDasharray="4 4" />
      <circle cx="22" cy="52" r="4" />
      <circle cx="46" cy="30" r="4" />
      <circle cx="72" cy="42" r="4" />
      <path d="M96 18 L96 6 L106 10 L96 14" />
    </g>
  ),
  // Stack of flags.
  campaign: (
    <g {...P}>
      <path d="M40 60 L40 10 M40 12 L66 12 L60 20 L66 28 L40 28" />
      <path d="M62 60 L62 26 M62 28 L86 28 L80 36 L86 44 L62 44" />
      <path d="M32 60 L94 60" />
    </g>
  ),
  // Braces around lines of code.
  script: (
    <g {...P}>
      <path d="M40 12 C32 12 34 30 26 34 C34 38 32 56 40 56" />
      <path d="M80 12 C88 12 86 30 94 34 C86 38 88 56 80 56" />
      <path d="M50 24 L72 24 M50 34 L66 34 M50 44 L70 44" />
    </g>
  ),
  // Waveform.
  sound: (
    <g {...P}>
      <path d="M16 34 L28 34 L32 22 L38 48 L44 14 L50 54 L56 26 L62 42 L68 18 L74 50 L80 30 L86 38 L90 34 L104 34" />
    </g>
  ),
  // SAM launcher with missile.
  tech: (
    <g {...P}>
      <path d="M24 54 L96 54 M30 54 L30 60 M90 54 L90 60" />
      <path d="M44 54 L52 42 L68 42 L74 54" />
      <path d="M50 42 L92 18 L96 20 L56 44" />
      <path d="M86 21 L82 14 M90 19 L95 25" />
      <circle cx="36" cy="58" r="2" /><circle cx="84" cy="58" r="2" />
    </g>
  ),
  // Wrench.
  utility: (
    <g {...P}>
      <path d="M78 14 C70 12 62 18 64 28 L38 52 C35 55 38 60 42 58 L68 34 C78 36 84 28 82 20 L74 26 L68 22 L70 16 Z" />
    </g>
  ),
  // Crate.
  other: (
    <g {...P}>
      <path d="M36 22 L60 12 L84 22 L84 48 L60 58 L36 48 Z" />
      <path d="M36 22 L60 32 L84 22 M60 32 L60 58" />
    </g>
  ),
};

export function CategoryGlyph({ category, className }: { category: Category; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 68" aria-hidden="true">
      {drawings[category] ?? drawings.other}
    </svg>
  );
}
