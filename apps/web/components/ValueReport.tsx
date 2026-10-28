import Link from "next/link";
import { naira } from "@/lib/rates";
import { CONDITIONS, HOME_TYPES, LAND_USES, TITLE_TYPES, UTILITIES } from "@/lib/valuecheck/coverage";
import { BASIS_LABEL, LEVEL_LABEL, METRIC_LABEL, SOURCE_LABEL, VERIFICATION_LABEL, dateGB } from "@/lib/valuecheck/labels";
import type { Subject, ValuationResult } from "@/lib/valuecheck/types";

const sqm = (n: number) => `${n.toLocaleString("en-GB", { maximumFractionDigits: 1 })} m²`;
const LEVEL_CLASS = { low: "flagged", medium: "review", high: "verified" } as const;

type Fact = { label: string; value: string; kind: "you" | "calc" };

function subjectFacts(s: Subject): Fact[] {
  const f: Fact[] = [
    { label: "Kind", value: s.category === "land" ? LAND_USES[s.propertyType as keyof typeof LAND_USES] ?? s.propertyType : HOME_TYPES[s.propertyType as keyof typeof HOME_TYPES] ?? s.propertyType, kind: "you" },
    { label: "Location", value: `${s.neighbourhood}, ${s.lga}, ${s.state}`, kind: "you" },
  ];
  if (s.landAreaSqm) f.push({ label: s.category === "land" ? "Plot size" : "Plot size under the house", value: sqm(s.landAreaSqm), kind: s.areaSource === "plot_check" ? "calc" : "you" });
  if (s.buildingAreaSqm) f.push({ label: "Floor area", value: sqm(s.buildingAreaSqm), kind: "you" });
  if (s.bedrooms !== undefined) f.push({ label: "Bedrooms", value: String(s.bedrooms), kind: "you" });
  if (s.bathrooms !== undefined) f.push({ label: "Bathrooms", value: String(s.bathrooms), kind: "you" });
  if (s.condition) f.push({ label: "Condition", value: CONDITIONS[s.condition], kind: "you" });
  if (s.ageYears !== undefined) f.push({ label: "Age", value: `${s.ageYears} years`, kind: "you" });
  if (s.titleType) f.push({ label: "Title (as stated, not checked)", value: TITLE_TYPES[s.titleType] ?? s.titleType, kind: "you" });
  if (s.roadAccess) f.push({ label: "Road access", value: s.roadAccess, kind: "you" });
  if (s.utilities?.length) f.push({ label: "On site", value: s.utilities.map((u) => UTILITIES[u] ?? u).join(", "), kind: "you" });
  if (s.inEstate) f.push({ label: "Estate", value: "Gated or managed estate", kind: "you" });
  return f;
}

export function ValueReport({ subject, result }: { subject: Subject; result: ValuationResult }) {
  const c = result.confidence;
  const reasons = new Map<string, number>();
  result.excluded.forEach((x) => reasons.set(x.reason, (reasons.get(x.reason) ?? 0) + 1));

  return (
    <div className="value-report">
      {result.status === "estimated" && result.range && c ? (
        <div className="panel vc-headline">
          <p className="small muted" style={{ marginBottom: "0.25rem" }}>Indicative range, as at {dateGB(result.valuationDate)}</p>
          <p className="vc-range">{naira(result.range.low)} <span>to</span> {naira(result.range.high)}</p>
          {result.central !== null
            ? <p>Central estimate <strong>{naira(result.central)}</strong>, the middle of the weighted evidence.</p>
            : <p className="muted">No single figure: the evidence isn&apos;t strong enough to point to one number.</p>}
          <p>
            <span className={`verdict ${LEVEL_CLASS[c.level]}`}>{LEVEL_LABEL[c.level]}</span>{" "}
            <span className="muted">· {c.score}/100 · {result.comparables.length} comparable{result.comparables.length === 1 ? "" : "s"}</span>
          </p>
          {result.warnings.map((w) => <p key={w} className="notice" style={{ borderColor: "var(--review)" }}>{w}</p>)}
        </div>
      ) : (
        <div className="panel vc-headline">
          <h2 style={{ marginTop: 0 }}>Not enough evidence for a value yet</h2>
          <p>{result.insufficientReason}</p>
          <p className="muted">We&apos;d rather show you nothing than a number we can&apos;t stand behind. ValueCheck is in limited-coverage mode and grows as reviewed evidence is added.</p>
          <ul>
            <li>Add any details you left out (below) and run it again.</li>
            <li>Ask an estate agent or valuer in the area for recent sale prices, then ask us to add them.</li>
            <li>For a purchase decision, use a registered estate surveyor and valuer.</li>
            <li><Link href="/find-someone">Have someone on the ground</Link> look at the property and its surroundings.</li>
          </ul>
        </div>
      )}

      <h2>What we used</h2>
      <p className="small muted">
        <span className="src you">You told us</span> details you entered, not checked by us.{" "}
        <span className="src calc">Calculated</span> worked out from coordinates you entered, not verified on site.{" "}
        <span className="src market">Market evidence</span> reviewed observations from other properties.
      </p>
      <dl className="facts">
        {subjectFacts(subject).map((f) => (
          <div key={f.label} style={{ display: "contents" }}>
            <dt>{f.label}</dt>
            <dd>{f.value} <span className={`src ${f.kind}`}>{f.kind === "calc" ? "Calculated" : "You told us"}</span></dd>
          </div>
        ))}
      </dl>
      {result.missing.length > 0 && (
        <p className="notice">Missing details that would improve this: {result.missing.join(", ")}.</p>
      )}

      {c && (<>
        <h2>How reliable is this?</h2>
        <p className="small muted">A score out of 100 from the quality and amount of evidence. It is not a statistical probability: the method hasn&apos;t yet been tested against verified sales.</p>
        <table className="sides">
          <thead><tr><th>Factor</th><th>Points</th><th>Why</th></tr></thead>
          <tbody>
            {c.factors.map((f) => (
              <tr key={f.key}><td>{f.label}</td><td>{f.points >= 0 ? f.points : f.points} / {f.max || "—"}</td><td>{f.note}</td></tr>
            ))}
            <tr><td><strong>Score</strong></td><td colSpan={2}><strong>{c.score} / 100 · {LEVEL_LABEL[c.level]}</strong></td></tr>
          </tbody>
        </table>
        {c.caps.map((cap) => <p key={cap} className="small">Cap applied: {cap}</p>)}
      </>)}

      {result.comparables.length > 0 && (<>
        <h2>The evidence</h2>
        {result.metric && <p className="small muted">Compared on: {METRIC_LABEL[result.metric]}. Listed with the most influential first. Being nearby doesn&apos;t make something comparable; each row says why it was included.</p>}
        <div className="scroll-x">
          <table className="sides vc-evidence">
            <thead><tr><th>Where</th><th>Price</th><th>Per m²</th><th>Seen</th><th>Source</th><th>Why included</th></tr></thead>
            <tbody>
              {result.comparables.map((k) => (
                <tr key={k.id}>
                  <td>{k.neighbourhood}<br /><span className="small muted">{k.locationMatch === "neighbourhood" ? "Same neighbourhood" : `${k.lga} (wider area)`}{k.distanceKm !== null ? ` · ${k.distanceKm.toFixed(1)} km` : ""}</span></td>
                  <td>{naira(k.priceNgn)}<br /><span className={`tag ${k.priceBasis === "asking" ? "warn" : ""}`}>{BASIS_LABEL[k.priceBasis]}</span></td>
                  <td>{k.pricePerSqm ? naira(Math.round(k.pricePerSqm)) : "—"}</td>
                  <td>{dateGB(k.observedOn)}</td>
                  <td>{k.sourceLabel}<br /><span className="small muted">{SOURCE_LABEL[k.sourceType]} · {VERIFICATION_LABEL[k.verification]}</span></td>
                  <td className="small">{k.why.join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}

      {reasons.size > 0 && (
        <details className="paste">
          <summary>{result.excluded.length} observation{result.excluded.length === 1 ? "" : "s"} considered and left out</summary>
          <ul>{[...reasons].map(([r, k]) => <li key={r}>{k} × {r}</li>)}</ul>
        </details>
      )}

      <h2>Method and assumptions</h2>
      <ul>{result.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
      <p className="small muted">
        Estimates come only from the reviewed observations above. No built-in market rates are used, and asking prices are not marked down.
        Calculation version {result.calcVersion}.
      </p>

      <h2>Limits of this report</h2>
      <ul>{result.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      <p>
        For a purchase, a loan, tax or a dispute, get a formal valuation from an estate surveyor and valuer registered with ESVARBON (the Estate Surveyors and Valuers Registration Board of Nigeria).
      </p>
    </div>
  );
}
