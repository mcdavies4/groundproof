"use client";

import { useMemo, useState } from "react";
import {
  SYSTEMS, candidates, centroid, dms, distanceM, nearestPlace, parseBearing, parseCoordinateLine, polygonArea, sides,
  toWGS84, traverse, type Beacon, type SystemId,
} from "@/lib/survey";

type Row = { id: string; e: string; n: string };
const EMPTY: Row[] = [
  { id: "", e: "", n: "" }, { id: "", e: "", n: "" }, { id: "", e: "", n: "" }, { id: "", e: "", n: "" },
];

function num(v: string) {
  const x = Number(v.replace(/[, ]/g, ""));
  return Number.isFinite(x) && v.trim() !== "" ? x : null;
}

function parsePaste(text: string): Row[] {
  return text.split(/\r?\n/).map(parseCoordinateLine).filter((r): r is Row => r !== null);
}

type LegRow = { to: string; bearing: string; distance: string };
const EMPTY_LEGS: LegRow[] = [
  { to: "", bearing: "", distance: "" }, { to: "", bearing: "", distance: "" },
  { to: "", bearing: "", distance: "" }, { to: "", bearing: "", distance: "" },
];

const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat.toFixed(7)},${lng.toFixed(7)}`;

export function PlotCheck() {
  const [rows, setRows] = useState<Row[]>(EMPTY);
  const [system, setSystem] = useState<SystemId | "unsure">("unsure");
  const [statedArea, setStatedArea] = useState("");
  const [paste, setPaste] = useState("");
  const [mode, setMode] = useState<"all" | "traverse">("all");
  const [start, setStart] = useState<Row>({ id: "", e: "", n: "" });
  const [legs, setLegs] = useState<LegRow[]>(EMPTY_LEGS);

  const walked = useMemo(() => {
    if (mode !== "traverse") return null;
    const se = num(start.e), sn = num(start.n);
    if (se === null || sn === null) return null;
    const startId = start.id.trim() || "Start";
    const parsed = legs
      .map((l, i) => ({
        // a blank name on the last side means "back to the start", matching its placeholder
        to: l.to.trim() || (i === legs.length - 1 ? startId : `B${i + 2}`),
        bearing: parseBearing(l.bearing),
        distance: num(l.distance),
      }))
      .filter((l): l is { to: string; bearing: number; distance: number } => l.bearing !== null && l.distance !== null);
    if (parsed.length < 2) return null;
    return traverse({ id: startId, e: se, n: sn }, parsed);
  }, [mode, start, legs]);

  const beacons: Beacon[] = useMemo(() => {
    if (mode === "traverse") return walked?.beacons ?? [];
    return rows.map((r, i) => ({ id: r.id.trim() || `B${i + 1}`, e: num(r.e)!, n: num(r.n)! })).filter((b) => b.e !== null && b.n !== null);
  }, [mode, rows, walked]);

  const result = useMemo(() => {
    if (beacons.length < 3) return null;
    const area = polygonArea(beacons);
    const sideList = sides(beacons);
    const options = candidates(beacons[0].e, beacons[0].n);
    if (system === "unsure") {
      return { area, sideList, options, located: null as null };
    }
    const pts = beacons.map((b) => ({ ...b, ...toWGS84(b.e, b.n, system) }));
    const c = centroid(pts);
    return { area, sideList, options, located: { pts, centre: c, place: nearestPlace(c), accuracyM: pts[0].accuracyM, shift: pts[0].shift } };
  }, [beacons, system]);

  const stated = num(statedArea);
  const areaDiffPct = result && stated ? ((result.area - stated) / stated) * 100 : null;

  const geojsonLink = (pts: { lat: number; lng: number; id: string }[]) => {
    const ring = [...pts.map((p) => [p.lng, p.lat]), [pts[0].lng, pts[0].lat]];
    const fc = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { name: "Plot (from survey plan)" }, geometry: { type: "Polygon", coordinates: [ring] } },
        ...pts.map((p) => ({ type: "Feature", properties: { name: p.id }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })),
      ],
    };
    return `https://geojson.io/#data=data:application/json,${encodeURIComponent(JSON.stringify(fc))}`;
  };

  // outline drawing on the plan grid
  const svg = useMemo(() => {
    if (beacons.length < 3) return null;
    const es = beacons.map((b) => b.e), ns = beacons.map((b) => b.n);
    const minE = Math.min(...es), maxE = Math.max(...es), minN = Math.min(...ns), maxN = Math.max(...ns);
    const span = Math.max(maxE - minE, maxN - minN) || 1;
    const S = 260, pad = 40, k = (S - pad * 2) / span;
    const xy = beacons.map((b) => ({ id: b.id, x: pad + (b.e - minE) * k, y: S - pad - (b.n - minN) * k }));
    return { S, xy };
  }, [beacons]);

  return (
    <div className="plot-grid">
      <section>
        <h2>1. What the plan gives you</h2>
        <div className="mode-toggle" role="radiogroup" aria-label="How the plan gives the corners">
          <label className={mode === "all" ? "on" : ""}>
            <input type="radio" name="mode" checked={mode === "all"} onChange={() => setMode("all")} />
            Coordinates for every corner
          </label>
          <label className={mode === "traverse" ? "on" : ""}>
            <input type="radio" name="mode" checked={mode === "traverse"} onChange={() => setMode("traverse")} />
            One starting point, then bearings and distances
          </label>
        </div>

        {mode === "all" ? (
          <>
            <p className="small muted">
              Each corner of the plot has a beacon number, with its easting (E) and northing (N) written beside it or in a
              table. Enter them in order going round the plot. Some plans write N before E: check the labels.
            </p>

            <details className="paste">
              <summary>Paste them all at once</summary>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={5}
                placeholder={"Beacon number, easting, northing, one per line.\nLabelled lines like N 724 512.33  E 541 230.11 also work."}
              />
              <button className="btn secondary" type="button" onClick={() => { const r = parsePaste(paste); if (r.length) setRows(r); }}>
                Use these
              </button>
            </details>

            <div className="beacon-table" role="table">
              <div className="beacon-row head" role="row"><span>Beacon</span><span>Easting (E)</span><span>Northing (N)</span><span /></div>
              {rows.map((r, i) => (
                <div className="beacon-row" role="row" key={i}>
                  <input aria-label={`Beacon ${i + 1} number`} value={r.id} placeholder={`B${i + 1}`}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))} />
                  <input aria-label={`Beacon ${i + 1} easting`} inputMode="decimal" value={r.e}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, e: e.target.value } : x)))} />
                  <input aria-label={`Beacon ${i + 1} northing`} inputMode="decimal" value={r.n}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, n: e.target.value } : x)))} />
                  <button type="button" className="remove" aria-label={`Remove beacon ${i + 1}`}
                    onClick={() => setRows(rows.length > 3 ? rows.filter((_, j) => j !== i) : rows)}>×</button>
                </div>
              ))}
            </div>
            <div className="row-links">
              <button type="button" className="btn secondary" onClick={() => setRows([...rows, { id: "", e: "", n: "" }])}>Add a beacon</button>
              <button type="button" className="link-btn" onClick={() => setRows(rows.map((r) => ({ ...r, e: r.n, n: r.e })))}>
                Swap E and N
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="small muted">
              Some plans give coordinates for one point only, then the bearing and length of each side. Enter the starting
              beacon, then each side in order. Make the last side end back at the starting beacon so we can check the figures.
            </p>
            <div className="beacon-table" role="table">
              <div className="beacon-row head" role="row"><span>Start beacon</span><span>Easting (E)</span><span>Northing (N)</span><span /></div>
              <div className="beacon-row" role="row">
                <input aria-label="Starting beacon number" value={start.id} placeholder="Start" onChange={(e) => setStart({ ...start, id: e.target.value })} />
                <input aria-label="Starting easting" inputMode="decimal" value={start.e} onChange={(e) => setStart({ ...start, e: e.target.value })} />
                <input aria-label="Starting northing" inputMode="decimal" value={start.n} onChange={(e) => setStart({ ...start, n: e.target.value })} />
                <span />
              </div>
            </div>
            <div className="beacon-table" role="table">
              <div className="beacon-row head" role="row"><span>To beacon</span><span>Bearing</span><span>Distance (m)</span><span /></div>
              {legs.map((l, i) => (
                <div className="beacon-row" role="row" key={i}>
                  <input aria-label={`Side ${i + 1} ends at beacon`} value={l.to}
                    placeholder={i === legs.length - 1 ? (start.id || "Start") : `B${i + 2}`}
                    onChange={(e) => setLegs(legs.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} />
                  <input aria-label={`Side ${i + 1} bearing`} value={l.bearing} placeholder="123°45'"
                    onChange={(e) => setLegs(legs.map((x, j) => (j === i ? { ...x, bearing: e.target.value } : x)))} />
                  <input aria-label={`Side ${i + 1} distance`} inputMode="decimal" value={l.distance}
                    onChange={(e) => setLegs(legs.map((x, j) => (j === i ? { ...x, distance: e.target.value } : x)))} />
                  <button type="button" className="remove" aria-label={`Remove side ${i + 1}`}
                    onClick={() => setLegs(legs.length > 3 ? legs.filter((_, j) => j !== i) : legs)}>×</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn secondary" onClick={() => setLegs([...legs, { to: "", bearing: "", distance: "" }])}>Add a side</button>
            <p className="hint">Bearings like 123°45&apos;, 123 45 or 123.75 all work.</p>
          </>
        )}

        <h2 style={{ marginTop: "2rem" }}>2. Details from the plan</h2>
        <div className="field">
          <label htmlFor="system">Coordinate system</label>
          <select id="system" value={system} onChange={(e) => setSystem(e.target.value as SystemId | "unsure")}>
            <option value="unsure">Not sure, show me the options</option>
            {SYSTEMS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <p className="hint">Usually printed in the plan&apos;s title block or notes, e.g. &quot;Minna Datum, Mid Belt&quot; or &quot;UTM Zone 31&quot;.</p>
        </div>
        <div className="field">
          <label htmlFor="area">Area shown on the plan (square metres, optional)</label>
          <input id="area" inputMode="decimal" value={statedArea} onChange={(e) => setStatedArea(e.target.value)} placeholder="648.21" />
          <p className="hint">If the plan gives hectares, multiply by 10,000. Very old plans may use feet; this tool needs metres.</p>
        </div>
      </section>

      <section aria-live="polite">
        <h2>Result</h2>
        {!result ? (
          <p className="muted">{mode === "all" ? "Enter at least 3 beacons to see the plot." : "Enter the starting beacon and at least 2 sides to see the plot."}</p>
        ) : (
          <>
            {walked?.misclosure !== null && walked?.misclosure !== undefined && (
              <p className={`notice ${walked.misclosure <= 0.1 ? "ok" : "error"}`}>
                {walked.misclosure <= 0.1
                  ? `The sides close back on the starting beacon (within ${(walked.misclosure * 100).toFixed(0)} cm). The figures are consistent.`
                  : `The sides don't close: the walk ends ${walked.misclosure.toFixed(2)} m from the starting beacon. A bearing or distance was probably copied wrongly.`}
              </p>
            )}
            <div className="panel">
              <h3>Shape and size</h3>
              {svg && (
                <svg viewBox={`0 0 ${svg.S} ${svg.S}`} className="plot-svg" role="img" aria-label="Plot outline from the beacon coordinates">
                  <polygon points={svg.xy.map((p) => `${p.x},${p.y}`).join(" ")} fill="var(--plate)" fillOpacity="0.35" stroke="var(--ink)" strokeWidth="2" />
                  {svg.xy.map((p) => (
                    <g key={p.id}>
                      <circle cx={p.x} cy={p.y} r="4" fill="var(--ink)" />
                      <text x={p.x + 6} y={p.y - 6} fontSize="11" fill="var(--ink)">{p.id}</text>
                    </g>
                  ))}
                  <text x={svg.S - 14} y="18" fontSize="12" fontWeight="700" fill="var(--ink)">N</text>
                  <line x1={svg.S - 10} y1="22" x2={svg.S - 10} y2="42" stroke="var(--ink)" strokeWidth="2" />
                </svg>
              )}
              <dl className="facts">
                <dt>Area</dt>
                <dd>
                  {result.area.toLocaleString("en-GB", { maximumFractionDigits: 1 })} m²
                  {areaDiffPct !== null && (
                    Math.abs(areaDiffPct) <= 1
                      ? <span className="verdict verified" style={{ marginLeft: "0.5rem" }}>Matches the plan</span>
                      : <span className="verdict review" style={{ marginLeft: "0.5rem" }}>{areaDiffPct > 0 ? "+" : ""}{areaDiffPct.toFixed(1)}% vs the plan</span>
                  )}
                </dd>
              </dl>
              <table className="sides">
                <thead><tr><th>Side</th><th>Length</th><th>Bearing</th></tr></thead>
                <tbody>
                  {result.sideList.map((s) => (
                    <tr key={`${s.from}-${s.to}`}><td>{s.from} → {s.to}</td><td>{s.length.toFixed(2)} m</td><td>{dms(s.bearing)}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="small muted">Compare these with the lengths and bearings written along each side of the plan. If they don&apos;t match, a coordinate was copied wrongly.</p>
            </div>

            {result.located ? (
              <div className="panel">
                <h3>Where it is</h3>
                <p>About <strong>{result.located.place.km} km from {result.located.place.name}</strong>.</p>
                <p className="row-links">
                  <a className="btn" href={geojsonLink(result.located.pts)} target="_blank" rel="noreferrer">See the plot outline on a map</a>
                  <a className="btn secondary" href={mapsLink(result.located.centre.lat, result.located.centre.lng)} target="_blank" rel="noreferrer">Open in Google Maps</a>
                </p>
                <p className="notice">
                  Buying this plot? Have someone walk to every beacon and check it matches the plan.{" "}
                  <a href={`/plots/new?b=${encodeURIComponent(JSON.stringify(result.located.pts.map((p) => ({ label: p.id, lat: Number(p.lat.toFixed(7)), lng: Number(p.lng.toFixed(7)) }))))}&acc=${result.located.accuracyM}`}>
                    Book a plot visit with these beacons
                  </a>
                </p>
                <table className="sides">
                  <thead><tr><th>Beacon</th><th>Latitude, longitude</th></tr></thead>
                  <tbody>
                    {result.located.pts.map((p) => (
                      <tr key={p.id}><td>{p.id}</td><td><a href={mapsLink(p.lat, p.lng)} target="_blank" rel="noreferrer">{p.lat.toFixed(6)}, {p.lng.toFixed(6)}</a></td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="small muted">
                  Accurate to about ±{result.located.accuracyM} m ({result.located.shift}). Good enough to spot a plot in the wrong place,
                  not to settle a boundary dispute; that needs a registered surveyor.
                </p>
              </div>
            ) : (
              <div className="panel">
                <h3>Possible locations</h3>
                <p className="small">Not sure which system the plan uses? Here&apos;s where beacon {beacons[0].id} lands in each. The plan&apos;s title block should say which is right.</p>
                <table className="sides">
                  <thead><tr><th>System</th><th>Lands near</th><th /></tr></thead>
                  <tbody>
                    {result.options.map((o) => {
                      const np = nearestPlace(o.point);
                      const gap = distanceM(o.point, result.options[0].point);
                      return (
                        <tr key={o.system.id}>
                          <td>{o.system.name}{o.likely && <span className="small muted"> (likely)</span>}</td>
                          <td>{np.km} km from {np.name}{gap > 1 && <span className="small muted"> · {(gap / 1000).toFixed(1)} km from the first</span>}</td>
                          <td><button type="button" className="link-btn" onClick={() => setSystem(o.system.id)}>Use this</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="small muted">
                  Neighbouring belts land a few kilometres apart, so picking the right one matters. A Groundproof site visit
                  settles it: the phone&apos;s GPS at the beacons will match only the right system.
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
