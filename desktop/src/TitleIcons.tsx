import type { CSSProperties } from "react";

/** Line pictograms for card and figure titles, drawn in the text colour on a 24-unit grid. */
const GLYPHS = {
  spend: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  tokens: (
    <>
      <path d="m12 2 10 5-10 5L2 7z" />
      <path d="m2 12 10 5 10-5M2 17l10 5 10-5" />
    </>
  ),
  rate: <path d="m12 14 4-4M3.34 19a10 10 0 1 1 17.32 0" />,
  models: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </>
  ),
  chart: <path d="M3 3v16a2 2 0 0 0 2 2h16M8 17v-3M13 17V5M18 17V9" />,
  flame: (
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  ),
  breakdown: <path d="M21.2 15.9A10 10 0 1 1 8 2.8M22 12A10 10 0 0 0 12 2v10z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.6" />
      <path d="M12 16v3.5M8 20h8" />
    </>
  ),
  subscription: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  general: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  data: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  updates: <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5" />,
  about: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
};

export type GlyphKind = keyof typeof GLYPHS;

/** Each page title's colour, shared by its pictogram and the tint behind it. */
const TONES: Partial<Record<GlyphKind, string>> = {
  spend: "#ff8a3d",
  chart: "#ff8a3d",
  flame: "#ff8a3d",
  tokens: "#4f7cff",
  breakdown: "#4f7cff",
  rate: "#2ed573",
  calendar: "#2ed573",
  models: "#c44dff",
  monitor: "#2ec4b6",
  subscription: "#f4d35e",
};

export function Glyph({ kind, size = 14 }: { kind: GlyphKind; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[kind]}
    </svg>
  );
}

/** A page title's badge: the pictogram in its colour on a tint of that colour. */
export function TitleIcon({ kind }: { kind: GlyphKind }) {
  return (
    <span className="title-icon" style={{ "--tone": TONES[kind] ?? "var(--muted)" } as CSSProperties}>
      <Glyph kind={kind} />
    </span>
  );
}
