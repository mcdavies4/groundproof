/**
 * Plot visit judgement: survey plan vs what the reporter found on the ground.
 * Two separate questions:
 *  - Position: is each beacon where the plan's coordinates put it? Allows for the plan conversion
 *    (Minna datum to GPS, about 5-15 m) plus the phone's GPS accuracy.
 *  - Shape: do the side lengths between found beacons match the plan? A datum shift moves every
 *    beacon the same way, so it cancels out here; only GPS accuracy matters.
 */
import { distanceM } from "./geo.ts";

export type LatLng = { lat: number; lng: number };
export type BeaconCheck = { index: number; found: boolean; lat: number | null; lng: number | null; accuracy: number | null; mocked: boolean };
export type BeaconResult = { index: number; status: "match" | "off" | "far" | "missing"; distance: number | null };
export type PlotVerdict = "match" | "partial" | "mismatch" | "flagged";

/** Local flat projection in metres around an origin (fine at plot scale). */
function local(p: LatLng, o: LatLng) {
  const R = 6371000, rad = Math.PI / 180;
  return { x: (p.lng - o.lng) * rad * R * Math.cos(o.lat * rad), y: (p.lat - o.lat) * rad * R };
}
export function areaM2(pts: LatLng[]): number {
  if (pts.length < 3) return 0;
  const xy = pts.map((p) => local(p, pts[0]));
  let a = 0;
  for (let i = 0; i < xy.length; i++) { const j = (i + 1) % xy.length; a += xy[i].x * xy[j].y - xy[j].x * xy[i].y; }
  return Math.abs(a) / 2;
}

export function judgePlot(plan: (LatLng & { label: string })[], checks: BeaconCheck[], planAccuracyM: number) {
  const byIndex = new Map(checks.map((c) => [c.index, c]));
  const results: BeaconResult[] = [];
  const reasons: string[] = [];
  const found: { i: number; p: LatLng; acc: number }[] = [];

  plan.forEach((b, i) => {
    const c = byIndex.get(i);
    if (!c || !c.found || c.lat === null || c.lng === null) { results.push({ index: i, status: "missing", distance: null }); return; }
    const acc = Math.max(c.accuracy ?? 10, 3);
    const d = distanceM(b.lat, b.lng, c.lat, c.lng);
    const tol = Math.max(8, planAccuracyM + acc);
    const far = Math.max(3 * tol, 40);
    results.push({ index: i, status: d <= tol ? "match" : d <= far ? "off" : "far", distance: Math.round(d * 10) / 10 });
    found.push({ i, p: { lat: c.lat, lng: c.lng }, acc });
  });

  // Integrity: fake locations, or every "beacon" read from one spot.
  if (checks.some((c) => c.mocked)) {
    return { verdict: "flagged" as PlotVerdict, reasons: ["The phone reported a fake (mock) location."], results, areaPlan: areaM2(plan), areaGround: null };
  }
  const span = (pts: LatLng[]) => Math.max(0, ...pts.flatMap((a, i) => pts.slice(i + 1).map((b) => distanceM(a.lat, a.lng, b.lat, b.lng))));
  if (found.length >= 3 && span(found.map((f) => f.p)) < 5 && span(plan) > 15) {
    return { verdict: "flagged" as PlotVerdict, reasons: ["All the beacon readings were taken from the same spot, not at each beacon."], results, areaPlan: areaM2(plan), areaGround: null };
  }

  // Shape: sides between consecutive beacons that were both found.
  let sidesChecked = 0, sidesBad = 0;
  const badSides: string[] = [];
  for (let i = 0; i < plan.length; i++) {
    const j = (i + 1) % plan.length;
    const a = found.find((f) => f.i === i), b = found.find((f) => f.i === j);
    if (!a || !b) continue;
    sidesChecked++;
    const planSide = distanceM(plan[i].lat, plan[i].lng, plan[j].lat, plan[j].lng);
    const groundSide = distanceM(a.p.lat, a.p.lng, b.p.lat, b.p.lng);
    const sideTol = Math.max(4, 0.6 * (a.acc + b.acc)) + 0.02 * planSide;
    if (Math.abs(planSide - groundSide) > sideTol) {
      sidesBad++;
      badSides.push(`${plan[i].label} to ${plan[j].label} is ${Math.round(groundSide)} m on the ground, ${Math.round(planSide)} m on the plan`);
    }
  }
  // Area, when every beacon was found: catches a plot that is smaller than the one on paper.
  const areaPlan = areaM2(plan);
  const areaGround = found.length === plan.length ? areaM2(plan.map((_, i) => found.find((f) => f.i === i)!.p)) : null;
  const areaRatio = areaGround !== null && areaPlan > 0 ? areaGround / areaPlan : 1;
  const areaOk = areaRatio >= 0.85 && areaRatio <= 1.18;
  const shapeOk = sidesChecked > 0 && sidesBad === 0 && areaOk;

  const missing = results.filter((r) => r.status === "missing");
  const far = results.filter((r) => r.status === "far");
  const off = results.filter((r) => r.status === "off");
  const label = (r: BeaconResult) => plan[r.index].label;
  const dists = found.map((f) => results[f.i].distance ?? 0);
  const meanShift = dists.length ? dists.reduce((t, d) => t + d, 0) / dists.length : 0;
  // A conversion error moves the whole plot by a similar amount, and not by much.
  const similarShift = dists.length >= 3 && Math.max(...dists) - Math.min(...dists) < 2 * planAccuracyM + 10 && meanShift <= 3 * planAccuracyM + 20;

  let verdict: PlotVerdict;
  if (missing.length > plan.length / 2) {
    verdict = "mismatch";
    reasons.push(`Only ${found.length} of ${plan.length} beacons could be found.`);
  } else if ((far.length || off.length) && shapeOk && similarShift) {
    // Right shape, shifted as a whole: usually the plan's coordinate system, not the plot.
    verdict = "partial";
    reasons.push(`The plot's shape matches the plan, but the whole plot sits about ${Math.round(meanShift)} m from where the plan's coordinates put it. That is often the survey system conversion rather than the plot; ask a registered surveyor to confirm before you pay.`);
  } else if (far.length && far.length === found.length && found.length >= 3) {
    verdict = "mismatch";
    reasons.push(`The plot walked is about ${Math.round(meanShift)} m from where the survey plan puts it. This may be a different plot from the one on the plan.`);
  } else if (far.length) {
    verdict = "mismatch";
    reasons.push(`${far.map((r) => `${label(r)} is ${Math.round(r.distance!)} m`).join(", ")} from where the plan puts ${far.length === 1 ? "it" : "them"}.`);
  } else if (!areaOk) {
    verdict = "mismatch";
    reasons.push(`The plot on the ground is about ${Math.round(areaGround!)} m², but the plan says ${Math.round(areaPlan)} m² (${Math.round(areaRatio * 100)}%).`);
  } else if (!missing.length && !off.length && (shapeOk || sidesChecked === 0)) {
    verdict = "match";
    reasons.push(`All ${plan.length} beacons are where the survey plan puts them${shapeOk ? ", and the side lengths match" : ""}.`);
  } else {
    verdict = "partial";
    if (off.length) reasons.push(`${off.map((r) => `${label(r)} is ${Math.round(r.distance!)} m off`).join(", ")}.`);
    if (missing.length) reasons.push(`Not found: ${missing.map(label).join(", ")}.`);
  }
  if (sidesBad) reasons.push(`Side lengths don't match: ${badSides.slice(0, 3).join("; ")}.`);

  return { verdict, reasons, results, areaPlan, areaGround };
}
