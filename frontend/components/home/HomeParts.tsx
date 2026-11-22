import type { VillaType } from "@/lib/results";

// A plot with a compass, the sun's path and the wind: the picture in the dashboard welcome card (dark).
export function HeroPlot({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 280" className={className} aria-hidden="true">
      <g className="stroke-white/10" strokeWidth="1">
        {[40, 80, 120, 160, 200, 240].map((y) => (
          <line key={`h${y}`} x1="0" x2="340" y1={y} y2={y} />
        ))}
        {[40, 80, 120, 160, 200, 240, 280, 320].map((x) => (
          <line key={`v${x}`} y1="0" y2="280" x1={x} x2={x} />
        ))}
      </g>

      {/* the sun's path */}
      <path
        d="M30 190 Q170 -30 310 190"
        fill="none"
        className="stroke-gold-400"
        strokeWidth="1.5"
        strokeDasharray="4 6"
      />
      <circle cx="238" cy="62" r="22" className="fill-gold-400/20" />
      <circle cx="238" cy="62" r="13" className="fill-gold-400" />

      {/* the plot and the building on it */}
      <g transform="rotate(-7 170 190)">
        <rect
          x="95"
          y="135"
          width="150"
          height="100"
          rx="3"
          className="fill-white/5 stroke-gold-300"
          strokeWidth="1.8"
          strokeDasharray="7 5"
        />
        <rect x="120" y="158" width="100" height="54" rx="2" className="fill-gold-500" />
        <rect x="120" y="158" width="100" height="10" rx="2" className="fill-gold-300" />
        <rect x="140" y="182" width="16" height="30" className="fill-navy-900/70" />
        <rect x="176" y="178" width="26" height="18" className="fill-navy-100/80" />
      </g>

      {/* the wind */}
      <g fill="none" className="stroke-navy-100/70" strokeWidth="1.6" strokeLinecap="round">
        <path d="M18 98h54c9 0 9-12 0-12" />
        <path d="M18 118h82c11 0 11 14 0 14" />
        <path d="M18 78h34" />
      </g>

      {/* the compass */}
      <g transform="translate(292 232)">
        <circle r="22" className="fill-navy-950/50 stroke-white/30" strokeWidth="1" />
        <path d="M0 -17 L6 4 L0 0 L-6 4 Z" className="fill-gold-300" />
        <path d="M0 17 L6 -4 L0 0 L-6 -4 Z" className="fill-white/40" />
      </g>
    </svg>
  );
}

// A small drawing of how the villa sits on its plot (free, or attached to one or both neighbours).
export function VillaThumb({ type, className = "" }: { type?: VillaType; className?: string }) {
  const left = type === "attachedBoth";
  const right = type === "attachedBoth" || type === "attachedOne";
  const gap = 16; // a free side keeps a gap to the plot edge
  const x = left ? 38 : 38 + gap;
  const width = 84 - (left ? 0 : gap) - (right ? 0 : gap);
  return (
    <svg viewBox="0 0 160 80" className={className} aria-hidden="true">
      <rect x="0" y="0" width="160" height="80" className="fill-navy-50" />
      <rect x="0" y="62" width="160" height="18" className="fill-navy-100" />
      <path d="M0 71h160" className="stroke-white" strokeWidth="1.5" strokeDasharray="8 6" />
      {/* the neighbours: dark when the villa is attached to them */}
      <rect x="2" y="16" width="36" height="44" rx="2" className={left ? "fill-navy-900/40" : "fill-navy-900/8"} />
      <rect x="122" y="16" width="36" height="44" rx="2" className={right ? "fill-navy-900/40" : "fill-navy-900/8"} />
      {/* the plot and the villa */}
      <rect
        x="38"
        y="10"
        width="84"
        height="52"
        rx="2"
        className="fill-white stroke-navy-900/40"
        strokeWidth="1.2"
        strokeDasharray="4 3"
      />
      <rect x={x} y="20" width={width} height="34" rx="2" className="fill-gold-500" />
      <rect x={x} y="20" width={width} height="7" rx="2" className="fill-gold-300" />
    </svg>
  );
}
