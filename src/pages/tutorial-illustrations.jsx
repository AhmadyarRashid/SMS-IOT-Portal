/**
 * One inline SVG scene per tutorial step. Every scene inherits theme via
 * `currentColor`; the accent-500 is threaded in through inline style vars.
 * All motion runs on pure CSS keyframes so the parent can disable it cheaply
 * with prefers-reduced-motion.
 */

export function TutorialIllustration({ kind, done = false }) {
  const scenes = {
    overview: <SceneOverview />,
    sites:    <SceneSites />,
    devices:  <SceneDevices />,
    quick:    <SceneQuick />,
    history:  <SceneHistory />,
    alarms:   <SceneAlarms />,
    map:      <SceneMap />,
    settings: <SceneSettings />,
  };
  return (
    <div className={`tut-scene ${done ? 'tut-scene-done' : ''}`} aria-hidden="true">
      {scenes[kind] || null}
    </div>
  );
}

/* ----------------------------- Scenes ----------------------------- */

function SceneOverview() {
  // 4 dashboard tiles with one live pulsing reading dot.
  return (
    <svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ovGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="var(--tut-accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--tut-accent)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <rect x="14" y="14" width="60" height="40" rx="8" fill="url(#ovGrad)" stroke="var(--tut-stroke)" />
      <rect x="82" y="14" width="64" height="40" rx="8" fill="var(--tut-fill-soft)" stroke="var(--tut-stroke)" />
      <rect x="14" y="62" width="76" height="40" rx="8" fill="var(--tut-fill-soft)" stroke="var(--tut-stroke)" />
      <rect x="98" y="62" width="48" height="40" rx="8" fill="url(#ovGrad)" stroke="var(--tut-stroke)" />
      <rect x="22" y="24" width="22" height="3" rx="1.5" fill="var(--tut-ink)" opacity="0.5" />
      <rect x="22" y="32" width="14" height="8" rx="2" fill="var(--tut-accent)" opacity="0.7" />
      <rect x="90" y="24" width="34" height="3" rx="1.5" fill="var(--tut-ink)" opacity="0.45" />
      <rect x="90" y="32" width="22" height="3" rx="1.5" fill="var(--tut-ink)" opacity="0.25" />
      <rect x="22" y="72" width="30" height="3" rx="1.5" fill="var(--tut-ink)" opacity="0.45" />
      <rect x="22" y="80" width="56" height="12" rx="3" fill="var(--tut-accent)" opacity="0.25" />
      <rect x="106" y="72" width="18" height="3" rx="1.5" fill="var(--tut-ink)" opacity="0.45" />
      {/* Pulsing live dot */}
      <circle cx="138" cy="80" r="3" fill="var(--tut-accent)" className="tut-pulse-dot" />
      <circle cx="138" cy="80" r="7" fill="none" stroke="var(--tut-accent)" strokeOpacity="0.5" className="tut-pulse-ring" />
    </svg>
  );
}

function SceneSites() {
  // Two buildings with radiating radar ring.
  return (
    <svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
      {/* Radar rings */}
      <circle cx="80" cy="70" r="20" fill="none" stroke="var(--tut-accent)" strokeOpacity="0.25" className="tut-ring tut-ring-1" />
      <circle cx="80" cy="70" r="38" fill="none" stroke="var(--tut-accent)" strokeOpacity="0.2" className="tut-ring tut-ring-2" />
      <circle cx="80" cy="70" r="56" fill="none" stroke="var(--tut-accent)" strokeOpacity="0.15" className="tut-ring tut-ring-3" />

      {/* Left building */}
      <rect x="34" y="38" width="30" height="58" rx="3" fill="var(--tut-fill-soft)" stroke="var(--tut-stroke)" />
      <rect x="40" y="46" width="4" height="4" fill="var(--tut-accent)" opacity="0.8" />
      <rect x="48" y="46" width="4" height="4" fill="var(--tut-accent)" opacity="0.4" />
      <rect x="56" y="46" width="4" height="4" fill="var(--tut-accent)" opacity="0.7" />
      <rect x="40" y="56" width="4" height="4" fill="var(--tut-accent)" opacity="0.3" />
      <rect x="48" y="56" width="4" height="4" fill="var(--tut-accent)" opacity="0.9" />
      <rect x="56" y="56" width="4" height="4" fill="var(--tut-accent)" opacity="0.45" />
      <rect x="40" y="66" width="4" height="4" fill="var(--tut-accent)" opacity="0.55" />
      <rect x="48" y="66" width="4" height="4" fill="var(--tut-accent)" opacity="0.3" />
      <rect x="56" y="66" width="4" height="4" fill="var(--tut-accent)" opacity="0.8" />

      {/* Right building — taller */}
      <rect x="96" y="22" width="32" height="74" rx="3" fill="url(#sitesGrad)" stroke="var(--tut-stroke)" />
      <defs>
        <linearGradient id="sitesGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--tut-accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--tut-accent)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <rect x="102" y="30" width="4" height="4" fill="var(--tut-accent)" opacity="0.85" />
      <rect x="110" y="30" width="4" height="4" fill="var(--tut-accent)" opacity="0.4" />
      <rect x="118" y="30" width="4" height="4" fill="var(--tut-accent)" opacity="0.7" />
      <rect x="102" y="42" width="4" height="4" fill="var(--tut-accent)" opacity="0.45" />
      <rect x="110" y="42" width="4" height="4" fill="var(--tut-accent)" opacity="0.9" />
      <rect x="118" y="42" width="4" height="4" fill="var(--tut-accent)" opacity="0.55" />
      <rect x="102" y="54" width="4" height="4" fill="var(--tut-accent)" opacity="0.3" />
      <rect x="110" y="54" width="4" height="4" fill="var(--tut-accent)" opacity="0.6" />
      <rect x="118" y="54" width="4" height="4" fill="var(--tut-accent)" opacity="0.85" />
      <rect x="102" y="66" width="4" height="4" fill="var(--tut-accent)" opacity="0.7" />
      <rect x="110" y="66" width="4" height="4" fill="var(--tut-accent)" opacity="0.3" />
      <rect x="118" y="66" width="4" height="4" fill="var(--tut-accent)" opacity="0.5" />
    </svg>
  );
}

function SceneDevices() {
  // Power button with a ripple of tap concentric rings from below.
  return (
    <svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="52" r="28" fill="var(--tut-fill-soft)" stroke="var(--tut-stroke)" />
      <circle cx="80" cy="52" r="22" fill="none" stroke="var(--tut-accent)" strokeOpacity="0.45" strokeWidth="1.5" className="tut-power-glow" />
      {/* Power glyph */}
      <path d="M80 40 L80 56" stroke="var(--tut-accent)" strokeWidth="3" strokeLinecap="round" />
      <path d="M68 50 A14 14 0 1 0 92 50" fill="none" stroke="var(--tut-accent)" strokeWidth="3" strokeLinecap="round" />
      {/* Tap ripple */}
      <circle cx="80" cy="98" r="3"  fill="var(--tut-accent)" className="tut-tap-dot" />
      <circle cx="80" cy="98" r="7"  fill="none" stroke="var(--tut-accent)" strokeOpacity="0.5" className="tut-tap-ring tut-tap-ring-1" />
      <circle cx="80" cy="98" r="12" fill="none" stroke="var(--tut-accent)" strokeOpacity="0.4" className="tut-tap-ring tut-tap-ring-2" />
    </svg>
  );
}

function SceneQuick() {
  // 2×2 grid of widget tiles; one is lifted (tilted, shadowed) like being dragged.
  return (
    <svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
      <rect x="30" y="16" width="42" height="36" rx="7" fill="var(--tut-fill-soft)" stroke="var(--tut-stroke)" />
      <rect x="86" y="16" width="42" height="36" rx="7" fill="var(--tut-fill-soft)" stroke="var(--tut-stroke)" />
      <rect x="86" y="60" width="42" height="36" rx="7" fill="var(--tut-fill-soft)" stroke="var(--tut-stroke)" />
      {/* Lifted tile (drifting) */}
      <g className="tut-lift">
        <rect x="30" y="60" width="42" height="36" rx="7" fill="var(--tut-accent)" fillOpacity="0.22" stroke="var(--tut-accent)" />
        <circle cx="51" cy="78" r="8" fill="var(--tut-accent)" fillOpacity="0.5" />
        <circle cx="51" cy="78" r="3" fill="var(--tut-accent)" />
      </g>
      {/* Small dot on first tile to suggest icon */}
      <circle cx="51" cy="34" r="5" fill="var(--tut-accent)" opacity="0.45" />
      <rect x="96" y="30" width="22" height="3" rx="1.5" fill="var(--tut-ink)" opacity="0.35" />
      <rect x="96" y="38" width="14" height="3" rx="1.5" fill="var(--tut-ink)" opacity="0.2" />
      <circle cx="107" cy="78" r="5" fill="var(--tut-accent)" opacity="0.45" />
    </svg>
  );
}

function SceneHistory() {
  // Area chart with the stroke line drawing on loop.
  return (
    <svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--tut-accent)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--tut-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid */}
      <line x1="14" y1="26" x2="146" y2="26" stroke="var(--tut-stroke)" strokeDasharray="2 4" />
      <line x1="14" y1="54" x2="146" y2="54" stroke="var(--tut-stroke)" strokeDasharray="2 4" />
      <line x1="14" y1="82" x2="146" y2="82" stroke="var(--tut-stroke)" strokeDasharray="2 4" />
      {/* Area fill */}
      <path
        d="M14 82 L32 66 L54 74 L78 44 L104 58 L126 36 L146 50 L146 96 L14 96 Z"
        fill="url(#histGrad)"
      />
      {/* Line */}
      <path
        d="M14 82 L32 66 L54 74 L78 44 L104 58 L126 36 L146 50"
        fill="none" stroke="var(--tut-accent)" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round"
        className="tut-draw-path"
      />
      {/* End dot */}
      <circle cx="146" cy="50" r="3" fill="var(--tut-accent)" className="tut-pulse-dot" />
    </svg>
  );
}

function SceneAlarms() {
  // Bell glyph with breathing danger rings.
  return (
    <svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="55" r="36" fill="none" stroke="var(--tut-danger)" strokeOpacity="0.25" className="tut-alarm-ring tut-alarm-ring-1" />
      <circle cx="80" cy="55" r="48" fill="none" stroke="var(--tut-danger)" strokeOpacity="0.18" className="tut-alarm-ring tut-alarm-ring-2" />
      {/* Bell body */}
      <path
        d="M80 32 C70 32 62 40 62 52 L62 66 L58 74 L102 74 L98 66 L98 52 C98 40 90 32 80 32 Z"
        fill="var(--tut-danger)" fillOpacity="0.18"
        stroke="var(--tut-danger)" strokeWidth="1.5" strokeLinejoin="round"
      />
      <circle cx="80" cy="30" r="3" fill="var(--tut-danger)" />
      {/* Clapper */}
      <path d="M74 78 Q80 86 86 78" stroke="var(--tut-danger)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function SceneMap() {
  // Stylised map strokes with a pin drop loop.
  return (
    <svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
      {/* Abstract landmass curves */}
      <path
        d="M10 80 Q30 60 52 72 T96 70 T150 76"
        fill="none" stroke="var(--tut-stroke)" strokeWidth="1.5" strokeDasharray="3 5"
      />
      <path
        d="M16 40 Q40 30 66 46 T120 42"
        fill="none" stroke="var(--tut-stroke)" strokeWidth="1.5" strokeDasharray="3 5"
      />
      {/* Dropping pin */}
      <g className="tut-pin-drop">
        <path
          d="M80 28 C72 28 66 34 66 42 C66 52 80 66 80 66 C80 66 94 52 94 42 C94 34 88 28 80 28 Z"
          fill="var(--tut-accent)" fillOpacity="0.25"
          stroke="var(--tut-accent)" strokeWidth="1.75" strokeLinejoin="round"
        />
        <circle cx="80" cy="42" r="4" fill="var(--tut-accent)" />
      </g>
      {/* Pin shadow */}
      <ellipse cx="80" cy="80" rx="10" ry="2.5" fill="var(--tut-accent)" opacity="0.22" className="tut-pin-shadow" />
    </svg>
  );
}

function SceneSettings() {
  // Three sliders; the middle thumb glides back and forth.
  return (
    <svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
      {/* Track 1 */}
      <rect x="22" y="28" width="116" height="4" rx="2" fill="var(--tut-fill-soft)" stroke="var(--tut-stroke)" />
      <rect x="22" y="28" width="72" height="4" rx="2" fill="var(--tut-accent)" opacity="0.75" />
      <circle cx="94" cy="30" r="6" fill="var(--tut-bg)" stroke="var(--tut-accent)" strokeWidth="2" />

      {/* Track 2 — animated thumb */}
      <rect x="22" y="53" width="116" height="4" rx="2" fill="var(--tut-fill-soft)" stroke="var(--tut-stroke)" />
      <rect x="22" y="53" width="46" height="4" rx="2" fill="var(--tut-accent)" opacity="0.6" className="tut-slider-fill" />
      <circle cx="68" cy="55" r="6" fill="var(--tut-bg)" stroke="var(--tut-accent)" strokeWidth="2" className="tut-slider-thumb" />

      {/* Track 3 */}
      <rect x="22" y="78" width="116" height="4" rx="2" fill="var(--tut-fill-soft)" stroke="var(--tut-stroke)" />
      <rect x="22" y="78" width="28" height="4" rx="2" fill="var(--tut-accent)" opacity="0.5" />
      <circle cx="50" cy="80" r="6" fill="var(--tut-bg)" stroke="var(--tut-accent)" strokeWidth="2" />
    </svg>
  );
}
