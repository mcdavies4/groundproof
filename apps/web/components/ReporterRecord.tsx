import { VISIT_ORDER, VISIT_TYPES, naira, type VisitType } from "@/lib/rates";

/** "Standard visit ₦8,000 · Distance visit ₦12,000" */
export function ReporterPrices({ rates }: { rates?: Partial<Record<VisitType, number>> | null }) {
  const set = VISIT_ORDER.filter((t) => rates?.[t]);
  if (!set.length) return null;
  return (
    <p className="prices">
      {set.map((t) => <span key={t}>{VISIT_TYPES[t].name} <strong>{naira(rates![t]!)}</strong></span>)}
    </p>
  );
}

export interface ReporterStats {
  visits: number; verified: number; review?: number; flagged: number;
  properties?: number; first_visit?: string | null; last_visit: string | null;
}

const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

/** The numbers come straight from verified check-ins; nobody can type them in. */
export function ReporterRecord({ r }: { r: ReporterStats }) {
  const rate = r.visits ? Math.round((r.verified / r.visits) * 100) : null;
  return (
    <div className="record">
      <div className="record-stats">
        <div><strong>{r.visits}</strong><span>visits</span></div>
        <div><strong className="ok">{r.verified}</strong><span>verified</span></div>
        <div><strong className={r.flagged ? "bad" : ""}>{r.flagged}</strong><span>flagged</span></div>
        {r.properties !== undefined && <div><strong>{r.properties}</strong><span>{r.properties === 1 ? "property" : "properties"}</span></div>}
      </div>
      <p className="small muted" style={{ margin: "0.6rem 0 0" }}>
        {r.visits === 0
          ? "No visits yet."
          : <>
              {rate}% of visits verified at the building
              {r.first_visit && <>, since {monthYear(r.first_visit)}</>}
              {r.last_visit && <>. Last visit {new Date(r.last_visit).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>}.
            </>}
      </p>
    </div>
  );
}
