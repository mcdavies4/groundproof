"use client";

import { useMemo, useState } from "react";
import {
  SYSTEMS, candidates, centroid, dms, distanceM, nearestPlace, polygonArea, sides, toWGS84,
  type Beacon, type SystemId,
} from "@/lib/survey";

type Row = { id: string; e: string; n: string };
const EMPTY: Row[] = [
  { id: "", e: "", n: "" }, { id: "", e: "", n: "" }, { id: "", e: "", n: "" }, { id: "", e: "", n: "" },
];

function num(v: string) {
  const x = Number(v.replace(/[, ]/g, ""));
  return Number.isFinite(x) && v.trim() !== "" ? x : null;
}

/** "PB 1234  543210.12  712345.67" per line -> rows. Takes the last two numbers on each line as E then N. */
function parsePaste(text: string): Row[] {
  return text.split(/\r?\n/).map((line) => {
    const raw = line.match(/-?\d[\d,]*\.?\d*/g) ?? [];
    if (raw.length < 2) return null;
    const rawE = raw[raw.length - 2], rawN = raw[raw.length - 1];
    // name = everything before the easting
    const posN = line.lastIndexOf(rawN);
    const id = line.slice(0, line.lastIndexOf(rawE, posN - 1)).replace(/[,\t]+/g, " ").trim();
    return { id, e: rawE.replace(/,/g, ""), n: rawN.replace(/,/g, "") };
  }).filter((r): r is Row => r !== null);
}

const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat.toFixed(7)},${lng.toFixed(7)}`;

export function PlotCheck() {
  const [rows, setRows] = useState<Row[]>(EMPTY);
  const [system, setSystem] = useState<SystemId | "unsure">("unsure");
  const [statedArea, setStatedArea] = useState("");
  const [paste, setPaste] = useState("");

  const beacons: Beacon[] = useMemo(
    () => rows.map((r, i) => ({ id: r.id.trim() || `B${i + 1}`, e: num(r.e)!, n: num(r.n)! })).filter((b) => b.e !== null && b.n !== null),
    [rows],
  );

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
        <h2>1. Beacon coordinates</h2>
        <p className="small muted">
          On the survey plan, each corner beacon (e.g. PB 1234 or SC/OG 5678) has an easting (E) and northing (N). Enter them in
          order going round the plot.
        </p>

        <details className="paste">
          <summary>Paste them all at once</summary>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={5}
            placeholder={"PB 1234  560024.54  269789.00\nPB 1235  560042.54  269789.00\n…"}
          />
          <button className="btn secondary" type="button" onClick={() => { const r = parsePaste(paste); if (r.length) setRows(r); }}>
            Use these
          </button>
          <p className="hint">One beacon per line: name, then easting, then northing.</p>
        </details>

        <div className="beacon-table" role="table">
          <div className="beacon-row head" role="row"><span>Beacon</span><span>Easting (E)</span><span>Northing (N)</span><span /></div>
          {rows.map((r, i) => (
            <div className="beacon-row" role="row" key={i}>
              <input aria-label={`Beacon ${i + 1} name`} value={r.id} placeholder={`B${i + 1}`}
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
        <button type="button" className="btn secondary" onClick={() => setRows([...rows, { id: "", e: "", n: "" }])}>Add a beacon</button>

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
          <p className="hint">If the plan gives hectares, multiply by 10,000.</p>
        </div>
      </section>

      <section aria-live="polite">
        <h2>Result</h2>
        {!result ? (
          <p className="muted">Enter at least 3 beacons to see the plot.</p>
        ) : (
          <>
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
