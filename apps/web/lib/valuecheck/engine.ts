/**
 * ValueCheck valuation engine. Pure and deterministic: same subject + same observations + same date => same result.
 *
 * Method (comparable-based, explainable):
 *  1. Keep only observations that are genuinely comparable (same category, state, property type, area, size band,
 *     recent enough). Everything else is listed with the reason it was left out.
 *  2. Compare on a like-for-like metric:
 *       land         -> price per m² of land
 *       house/flat   -> price per m² of building floor area (this already includes the land under it),
 *                       or, with no floor area, total price for the same number of bedrooms.
 *     The engine never applies a land rate to a completed building.
 *  3. Weight each comparable by evidence quality (price basis, verification), location, recency and size similarity.
 *  4. Range from the weighted spread of comparables; a central figure only when the evidence is strong enough.
 *
 * There are NO built-in market rates and NO asking-to-sale discounts: every naira figure comes from submitted
 * observations. The weights and thresholds below are policy parameters, not market data, and are unvalidated
 * until tested against ground-truth transactions (see docs/valuecheck.md).
 */
import type {
  Confidence, ConfidenceFactor, ConfidenceLevel, ExcludedObservation, IncludedComparable, Metric, Observation,
  PriceBasis, Subject, ValuationResult, Verification,
} from "./types";

export const CALC_VERSION = "vc-1.0.0";

export const PARAMS = {
  maxAgeMonths: 24,
  /** Largest allowed ratio between the bigger and smaller area (subject vs comparable). */
  maxSizeRatio: 2,
  minForRange: 3,
  minForCentral: 5,
  minForHigh: 8,
  basisWeight: { completed_sale: 1, reported_sale: 0.7, asking: 0.4 } satisfies Record<PriceBasis, number>,
  verificationWeight: { transaction_verified: 1, source_checked: 0.85, unverified: 0.6 } satisfies Record<Verification, number>,
  locationWeight: { neighbourhood: 1, lga: 0.5 },
  levels: { medium: 50, high: 75 },
  /** Score ceilings applied before the level is decided. */
  caps: { fewComparables: 44, askingOnly: 59, belowHighCount: 74 },
} as const;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const DAY_MS = 86_400_000;

export function monthsBetween(isoDate: string, today: string): number {
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${isoDate}T00:00:00Z`);
  return ms / DAY_MS / 30.4375;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Weighted percentile (q in 0..1), interpolating between mid-point cumulative weights. */
export function weightedQuantile(items: { v: number; w: number }[], q: number): number {
  const s = [...items].sort((a, b) => a.v - b.v);
  const total = s.reduce((t, x) => t + x.w, 0);
  if (s.length === 1 || total === 0) return s[0].v;
  let cum = 0;
  const pos = s.map((x) => { const p = (cum + x.w / 2) / total; cum += x.w; return p; });
  if (q <= pos[0]) return s[0].v;
  if (q >= pos[pos.length - 1]) return s[s.length - 1].v;
  for (let i = 1; i < s.length; i++) {
    if (q <= pos[i]) return s[i - 1].v + ((q - pos[i - 1]) / (pos[i] - pos[i - 1])) * (s[i].v - s[i - 1].v);
  }
  return s[s.length - 1].v;
}

export function roundSig(n: number, sig = 3): number {
  if (n === 0) return 0;
  const f = 10 ** (sig - Math.ceil(Math.log10(Math.abs(n))));
  return Math.round(n * f) / f;
}

const sizeWeight = (ratio: number) => (ratio <= 1.25 ? 1 : ratio <= 1.5 ? 0.8 : 0.6);

function subjectCompleteness(s: Subject): { fraction: number; missing: string[] } {
  const checks: [boolean, string][] = s.category === "land"
    ? [
        [!!s.neighbourhood, "neighbourhood"],
        [s.landAreaSqm !== undefined, "plot size"],
        [!!s.propertyType, "land use"],
        [!!s.titleType && s.titleType !== "unknown", "type of title document"],
        [!!s.roadAccess, "road access"],
        [!!s.utilities?.length, "utilities on site"],
      ]
    : [
        [!!s.neighbourhood, "neighbourhood"],
        [!!s.propertyType, "type of home"],
        [s.buildingAreaSqm !== undefined, "building floor area"],
        [s.propertyType === "flat" || s.landAreaSqm !== undefined, "plot size"],
        [s.bedrooms !== undefined, "number of bedrooms"],
        [s.bathrooms !== undefined, "number of bathrooms"],
        [!!s.condition, "condition"],
        [s.ageYears !== undefined, "age of the building"],
      ];
  return { fraction: checks.filter(([ok]) => ok).length / checks.length, missing: checks.filter(([ok]) => !ok).map(([, n]) => n) };
}

const fmtSqm = (n: number) => `${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })} m²`;

export function estimate(subject: Subject, observations: Observation[], today: string): ValuationResult {
  const assumptions: string[] = [];
  const warnings: string[] = [];
  const excluded: ExcludedObservation[] = [];
  const { fraction: completeness, missing } = subjectCompleteness(subject);

  const limitations = [
    "This is an indicative estimate from submitted market evidence. It is not a formal valuation and cannot be used as one.",
    "Asking prices are what sellers hope to get. Completed sale prices are usually lower and are rarely published in Nigeria.",
    "Groundproof has not inspected this property. It does not establish who owns the land, whether the title is valid, or where the boundaries are.",
  ];

  const base = {
    calcVersion: CALC_VERSION, valuationDate: today, assumptions, missing, warnings, limitations,
    comparables: [] as IncludedComparable[], excluded,
  };
  const insufficient = (reason: string, metric: Metric | null = null): ValuationResult => ({
    ...base, status: "insufficient", metric, range: null, central: null, confidence: null, insufficientReason: reason,
  });

  // --- choose the metric --------------------------------------------------------------------------------
  let metric: Metric;
  let subjectArea: number | undefined;
  if (subject.category === "land") {
    metric = "price_per_sqm_land";
    subjectArea = subject.landAreaSqm;
    if (!subjectArea) return insufficient("The plot size is needed to compare with other plots.");
    if (subject.areaSource === "plot_check") {
      assumptions.push(`Plot size (${fmtSqm(subjectArea)}) was calculated by Plot Check from survey-plan coordinates. That shows the shape on paper, not that the land is legally yours or that its boundaries are confirmed on the ground.`);
    } else {
      assumptions.push(`Plot size (${fmtSqm(subjectArea)}) is as stated by you. It has not been checked against a survey plan.`);
    }
  } else if (subject.buildingAreaSqm) {
    metric = "price_per_sqm_building";
    subjectArea = subject.buildingAreaSqm;
    assumptions.push("The value of the whole property (building and the land under it) is compared with similar homes per m² of floor area. A land rate is not applied to a building.");
  } else if (subject.bedrooms !== undefined) {
    metric = "total_price";
    assumptions.push("No floor area was given, so the whole-property price is compared with homes of the same type and number of bedrooms. Adding the floor area would make this more reliable.");
  } else {
    return insufficient("Floor area or number of bedrooms is needed to compare with similar homes.");
  }

  // --- filter to genuine comparables ---------------------------------------------------------------------
  const kept: IncludedComparable[] = [];
  const similarity = new Map<string, number>();
  for (const o of observations) {
    const out = (reason: string) => excluded.push({ id: o.id, reason });
    if (o.category !== subject.category) { out("Different kind of property (land vs house/flat)."); continue; }
    if (norm(o.state) !== norm(subject.state)) { out("Different state."); continue; }
    if (o.propertyType !== subject.propertyType) { out("Different property type."); continue; }
    const sameHood = norm(o.neighbourhood) === norm(subject.neighbourhood);
    const sameLga = norm(o.lga) === norm(subject.lga);
    if (!sameHood && !sameLga) { out("Different area. Being nearby alone does not make a property comparable."); continue; }
    if (!(o.priceNgn > 0)) { out("No usable price."); continue; }
    const age = monthsBetween(o.observedOn, today);
    if (!Number.isFinite(age) || age < -0.5) { out("Date is missing or in the future."); continue; }
    if (age > PARAMS.maxAgeMonths) { out(`Older than ${PARAMS.maxAgeMonths} months.`); continue; }

    let metricValue: number;
    let pricePerSqm: number | null = null;
    const why: string[] = [`Same ${subject.category === "land" ? "land use" : "type of home"}.`];
    let sim = 1;
    let w = PARAMS.basisWeight[o.priceBasis] * PARAMS.verificationWeight[o.verification];
    w *= sameHood ? PARAMS.locationWeight.neighbourhood : PARAMS.locationWeight.lga;
    w *= 1 - 0.5 * (Math.max(age, 0) / PARAMS.maxAgeMonths);
    why.push(sameHood ? "Same neighbourhood." : "Same local government area, different neighbourhood.");

    if (metric === "price_per_sqm_land") {
      if (!o.landAreaSqm) { out("No plot size, so a price per m² can't be worked out."); continue; }
      if (o.buildingAreaSqm) { out("Has a building on it; land comparisons use empty plots only."); continue; }
      const ratio = Math.max(o.landAreaSqm, subjectArea!) / Math.min(o.landAreaSqm, subjectArea!);
      if (ratio > PARAMS.maxSizeRatio) { out("Plot size too different from yours."); continue; }
      sim *= sizeWeight(ratio);
      metricValue = pricePerSqm = o.priceNgn / o.landAreaSqm;
      why.push(`Plot size ${fmtSqm(o.landAreaSqm)}, close to yours.`);
    } else if (metric === "price_per_sqm_building") {
      if (!o.buildingAreaSqm) { out("No floor area, so a price per m² can't be worked out."); continue; }
      const ratio = Math.max(o.buildingAreaSqm, subjectArea!) / Math.min(o.buildingAreaSqm, subjectArea!);
      if (ratio > PARAMS.maxSizeRatio) { out("Floor area too different from yours."); continue; }
      if (subject.propertyType !== "flat" && subject.landAreaSqm && o.landAreaSqm) {
        const lr = Math.max(o.landAreaSqm, subject.landAreaSqm) / Math.min(o.landAreaSqm, subject.landAreaSqm);
        if (lr > PARAMS.maxSizeRatio) { out("Plot size under the house too different from yours."); continue; }
        sim *= sizeWeight(lr);
      }
      sim *= sizeWeight(ratio);
      metricValue = pricePerSqm = o.priceNgn / o.buildingAreaSqm;
      why.push(`Floor area ${fmtSqm(o.buildingAreaSqm)}, close to yours.`);
    } else {
      if (o.bedrooms === null || o.bedrooms !== subject.bedrooms) { out("Different number of bedrooms."); continue; }
      metricValue = o.priceNgn;
      if (o.buildingAreaSqm) pricePerSqm = o.priceNgn / o.buildingAreaSqm;
      why.push(`${o.bedrooms} bedrooms, same as yours.`);
    }

    if (subject.category === "residential" && subject.condition && o.condition && o.condition !== subject.condition) {
      sim *= 0.8;
      why.push("Condition differs from yours; given less weight (no price adjustment is made).");
    }

    w *= sim;
    similarity.set(o.id, sim);
    const distanceKm = subject.lat !== undefined && subject.lng !== undefined && o.lat !== null && o.lng !== null
      ? haversineKm({ lat: subject.lat, lng: subject.lng }, { lat: o.lat, lng: o.lng }) : null;

    kept.push({
      id: o.id, neighbourhood: o.neighbourhood, lga: o.lga, propertyType: o.propertyType, priceNgn: o.priceNgn,
      priceBasis: o.priceBasis, observedOn: o.observedOn, ageMonths: Math.max(age, 0), sourceType: o.sourceType,
      sourceLabel: o.sourceLabel, verification: o.verification, landAreaSqm: o.landAreaSqm,
      buildingAreaSqm: o.buildingAreaSqm, bedrooms: o.bedrooms, metricValue, pricePerSqm,
      locationMatch: sameHood ? "neighbourhood" : "lga", distanceKm, weight: w, why,
    });
  }

  if (kept.length < PARAMS.minForRange) {
    const res = insufficient(
      kept.length === 0
        ? `We have no reviewed market evidence close enough to this ${subject.category === "land" ? "plot" : "property"} yet.`
        : `Only ${kept.length} comparable ${kept.length === 1 ? "observation" : "observations"} found; at least ${PARAMS.minForRange} are needed to show a range.`,
      metric,
    );
    res.comparables = kept;
    return res;
  }

  // --- range and central figure ----------------------------------------------------------------------------
  const items = kept.map((c) => ({ v: c.metricValue, w: c.weight }));
  const n = kept.length;
  const useExtremes = n < PARAMS.minForCentral;
  const lowM = useExtremes ? Math.min(...items.map((i) => i.v)) : weightedQuantile(items, 0.25);
  const highM = useExtremes ? Math.max(...items.map((i) => i.v)) : weightedQuantile(items, 0.75);
  const medM = weightedQuantile(items, 0.5);
  const scale = metric === "total_price" ? 1 : subjectArea!;
  const dispersion = lowM > 0 ? highM / lowM : Infinity;

  // --- confidence ------------------------------------------------------------------------------------------
  const factors: ConfidenceFactor[] = [];
  const f = (key: string, label: string, points: number, max: number, note: string) =>
    factors.push({ key, label, points: Math.round(points * 10) / 10, max, note });

  f("count", "Number of comparables", n >= 10 ? 25 : n >= 7 ? 20 : n >= 5 ? 15 : 8, 25, `${n} comparable ${n === 1 ? "observation" : "observations"}.`);

  const wAges = kept.map((c) => ({ v: c.ageMonths, w: c.weight }));
  const medAge = weightedQuantile(wAges, 0.5);
  f("recency", "How recent", medAge <= 6 ? 15 : medAge <= 12 ? 11 : medAge <= 18 ? 7 : 3, 15, `Typical age of the evidence: about ${Math.round(medAge)} months.`);

  const srcQuality = kept.reduce((t, c) => t + PARAMS.basisWeight[c.priceBasis] * PARAMS.verificationWeight[c.verification], 0) / n;
  const nAsking = kept.filter((c) => c.priceBasis === "asking").length;
  f("source", "Type and checking of evidence", srcQuality * 25, 25, `${nAsking} of ${n} are asking prices; ${kept.filter((c) => c.verification !== "unverified").length} have been checked by Groundproof.`);

  const shareHood = kept.filter((c) => c.locationMatch === "neighbourhood").length / n;
  f("proximity", "Location match", 15 * (shareHood + 0.5 * (1 - shareHood)), 15, `${kept.filter((c) => c.locationMatch === "neighbourhood").length} in your neighbourhood, the rest elsewhere in the same local government area.`);

  const sim = kept.reduce((t, c) => t + (similarity.get(c.id) ?? 1), 0) / n;
  f("similarity", "Similarity of size and condition", sim * 10, 10, "Comparables were within a factor of 2 of your size; closer sizes score higher.");

  f("completeness", "Completeness of your details", completeness * 10, 10, missing.length ? `Missing: ${missing.join(", ")}.` : "All the details we use were given.");

  let disp = 0;
  if (dispersion > 3) disp = -15; else if (dispersion > 2) disp = -10; else if (dispersion > 1.5) disp = -5;
  if (disp) f("spread", "Spread of prices", disp, 0, `Comparable prices vary widely (the top of the range is ${dispersion.toFixed(1)}x the bottom).`);

  let score = Math.max(0, factors.reduce((t, x) => t + x.points, 0));
  const caps: string[] = [];
  if (n < PARAMS.minForCentral && score > PARAMS.caps.fewComparables) {
    score = PARAMS.caps.fewComparables;
    caps.push(`Fewer than ${PARAMS.minForCentral} comparables: confidence cannot be above low.`);
  }
  if (n < PARAMS.minForHigh && score > PARAMS.caps.belowHighCount) {
    score = PARAMS.caps.belowHighCount;
    caps.push(`Fewer than ${PARAMS.minForHigh} comparables: confidence cannot be high.`);
  }
  if (nAsking === n && score > PARAMS.caps.askingOnly) {
    score = PARAMS.caps.askingOnly;
    caps.push("Every comparable is an asking price: confidence cannot be high.");
  }
  score = Math.round(score);
  const level: ConfidenceLevel = score >= PARAMS.levels.high ? "high" : score >= PARAMS.levels.medium ? "medium" : "low";
  const confidence: Confidence = { score, level, factors, caps };

  // --- outputs ---------------------------------------------------------------------------------------------
  const showCentral = n >= PARAMS.minForCentral && level !== "low";
  if (level === "low") warnings.push("Low confidence: treat this range as a rough guide only. More evidence or a professional valuation is needed before relying on it.");
  if (useExtremes) assumptions.push(`With only ${n} comparables the range runs from the lowest to the highest of them; no central figure is given.`);
  if (disp) warnings.push("Comparable prices are spread widely, so the range is wide. Differences in location, title or finish may explain it.");
  if (subject.category === "residential" && !subject.condition) assumptions.push("Condition was not given, so no allowance for it is made.");
  if (subject.category === "residential") assumptions.push("No price adjustment is made for condition, age or finish; differences only reduce a comparable's weight.");
  if (subject.titleType) assumptions.push("Title documents are noted but not valued separately. Defective or missing title can reduce value sharply and has not been verified by Groundproof.");
  if (n < PARAMS.minForCentral || nAsking === n) assumptions.push("Asking prices are used as submitted. They are not adjusted to likely sale prices, because Groundproof does not yet have transaction data to support an adjustment.");

  return {
    ...base,
    status: "estimated",
    metric,
    range: { low: roundSig(lowM * scale), high: roundSig(highM * scale) },
    central: showCentral ? roundSig(medM * scale) : null,
    confidence,
    comparables: kept.sort((a, b) => b.weight - a.weight),
    insufficientReason: null,
  };
}
