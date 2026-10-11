/** Plan outline (dashed) and, when there's a visit, where each beacon was really found. */
type P = { lat: number; lng: number };
export type GroundPoint = (P & { status: "match" | "off" | "far" | "missing" | null }) | null;

const COLOUR = { match: "var(--verified)", off: "var(--review)", far: "var(--flagged)", missing: "var(--flagged)" } as const;

export function PlotShape({ plan, labels, ground }: { plan: P[]; labels: string[]; ground?: GroundPoint[] }) {
  if (plan.length < 3) return null;
  const o = plan[0], r = Math.PI / 180, R = 6371000;
  const xy = (p: P) => ({ x: (p.lng - o.lng) * r * R * Math.cos(o.lat * r), y: -(p.lat - o.lat) * r * R });
  const pts = plan.map(xy);
  const g = (ground ?? []).map((p) => (p && p.status !== "missing" ? { ...xy(p), status: p.status } : null));
  const all = [...pts, ...g.filter((p): p is NonNullable<typeof p> => !!p)];
  const minX = Math.min(...all.map((p) => p.x)), maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y)), maxY = Math.max(...all.map((p) => p.y));
  const span = Math.max(maxX - minX, maxY - minY, 10);
  const pad = span * 0.32;
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`;
  const u = span / 100;                       // 1% of the plot: keeps strokes and text in proportion
  const groundAll = g.every(Boolean) && g.length === pts.length;
  // Labels sit outside the plot, pushed away from its centre, so they don't cover the dots.
  const cx = pts.reduce((t, p) => t + p.x, 0) / pts.length, cy = pts.reduce((t, p) => t + p.y, 0) / pts.length;
  const labelAt = (p: { x: number; y: number }) => {
    const dx = p.x - cx, dy = p.y - cy, len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * u * 9, y: p.y + (dy / len) * u * 9 + u * 1.5, anchor: (dx < -u ? "end" : dx > u ? "start" : "middle") as "end" | "start" | "middle" };
  };

  return (
    <figure className="plot-shape">
      <svg viewBox={vb} role="img" aria-label={ground ? "Survey plan outline compared with where the beacons were found" : "Survey plan outline"}>
        <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="var(--plate)" fillOpacity="0.25" stroke="var(--ink)" strokeWidth={u * 0.8} strokeDasharray={`${u * 3} ${u * 2}`} />
        {groundAll && <polygon points={g.map((p) => `${p!.x},${p!.y}`).join(" ")} fill="none" stroke="var(--ink)" strokeWidth={u * 0.9} />}
        {g.map((p, i) => p && <line key={`l${i}`} x1={pts[i].x} y1={pts[i].y} x2={p.x} y2={p.y} stroke={COLOUR[p.status ?? "match"]} strokeWidth={u * 0.6} />)}
        {pts.map((p, i) => <circle key={`p${i}`} cx={p.x} cy={p.y} r={u * 1.6} fill="var(--surface)" stroke="var(--ink)" strokeWidth={u * 0.6} />)}
        {g.map((p, i) => p && <circle key={`g${i}`} cx={p.x} cy={p.y} r={u * 2} fill={COLOUR[p.status ?? "match"]} />)}
        {pts.map((p, i) => { const l = labelAt(p); return <text key={`t${i}`} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={u * 4.5} fill="var(--ink)" fontWeight="700">{labels[i]}</text>; })}
      </svg>
      <figcaption className="small muted">
        Dashed: the survey plan.{ground ? " Dots: where each beacon was found (green on the plan, amber a little off, red far off)." : ""}
      </figcaption>
    </figure>
  );
}
