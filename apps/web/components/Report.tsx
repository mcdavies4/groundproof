import { PostcodePlate } from "@/components/PostcodePlate";
import { VerdictBadge } from "@/components/VerdictBadge";
import { PrintButton } from "@/components/PrintButton";
import { formatMoney } from "@/lib/types";
import type { ReportData } from "@/lib/report";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function Report({ data, shared = false }: { data: ReportData; shared?: boolean }) {
  const { property: p, milestones, checkins } = data;
  const count = (v: string) => checkins.filter((c) => c.verdict === v).length;
  const last = checkins[0];

  return (
    <article className="report">
      <header className="report-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/groundproof-logo.svg" alt="Groundproof" width={207} height={28} className="report-logo" />
        <div className="no-print"><PrintButton /></div>
      </header>

      <section className="report-title">
        <p className="small muted">Property report · {day(data.generatedAt)}</p>
        <h1>{p.label}</h1>
        {p.postcode ? <PostcodePlate code={p.postcode} size="md" /> : (
          <p className="muted">{p.anchorMode === "coordinates" ? "Anchored by location (no NIPOST postcode listed yet)" : "Not anchored yet"}</p>
        )}
        <dl className="facts report-facts">
          {p.address && (<><dt>NIPOST address</dt><dd>{p.address}</dd></>)}
          {p.area && (<><dt>Area</dt><dd>{p.area}</dd></>)}
          {p.use && (<><dt>Recorded use</dt><dd>{p.use}</dd></>)}
          <dt>Anchored</dt><dd>{p.anchoredAt ? day(p.anchoredAt) : "Not yet"}</dd>
        </dl>
      </section>

      <section className="report-summary" aria-label="Summary">
        <div><strong>{count("verified")}</strong><span>Verified</span></div>
        <div><strong>{count("review")}</strong><span>Needs a look</span></div>
        <div><strong>{count("flagged")}</strong><span>Flagged</span></div>
        <div><strong>{last ? day(last.time) : "None"}</strong><span>Last check-in</span></div>
      </section>

      {milestones.length > 0 && (
        <section className="report-block">
          <h2>Stages</h2>
          <table className="sides">
            <thead><tr><th>Stage</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.name}>
                  <td>{m.name}</td>
                  <td>{m.amount !== null ? formatMoney(m.amount, p.currency) : ""}</td>
                  <td>{m.done ? <span className="verdict verified">Done{m.doneAt ? `, ${day(m.doneAt)}` : ""}</span> : <span className="muted">Open</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="report-block">
        <h2>Check-ins</h2>
        {checkins.length === 0 ? <p className="muted">No check-ins yet.</p> : (
          <ol className="timeline">
            {checkins.map((c) => (
              <li key={c.id} className="report-checkin">
                <div className="report-checkin-head">
                  <strong>{c.isAnchor ? "Anchor visit" : c.stage ? c.stage : "Routine check-in"}</strong>
                  <VerdictBadge verdict={c.verdict} matchType={c.matchType} />
                </div>
                <div className="small muted">{when(c.time)}. {c.reason}</div>
                {c.photoNote && <p className="photo-note"><span className="small muted">What the photos show: </span>{c.photoNote}</p>}
                {c.note && <p style={{ margin: "0.4rem 0 0" }}><span className="small muted">Note from the visit: </span>{c.note}</p>}
                {c.photos.length > 0 && (
                  <div className="report-photos">
                    {c.photos.map((u, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={u} alt={`Photo ${i + 1} from ${when(c.time)}`} />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="report-foot small muted">
        <p>
          <strong>How check-ins are verified.</strong> Photos can only be taken in the Groundproof app, which records the
          phone&apos;s location, compass direction and time. Each check-in is matched against the building&apos;s NIPOST
          postcode (or, where none exists, the anchored spot), and the photos are compared with the first visit.
        </p>
        <p>
          A verdict is strong evidence, not a guarantee. It is not a title search or a building inspection.
          {shared ? " This report was shared by the property owner." : ""} Generated {when(data.generatedAt)} at groundproof.site.
        </p>
      </footer>
    </article>
  );
}
