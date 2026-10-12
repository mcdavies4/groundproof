export interface GrowthData {
  referrals: { referrer: string; friend: string; joined: string; rewarded: string | null; capped: boolean }[];
  feedback: { email: string; created_at: string; score: number | null; useful: string | null; improve: string | null; quote_ok: boolean; quote_name: string | null; answered_at: string | null }[];
}
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "–");

/** Referrals and what owners say, side by side. */
export function AdminGrowth({ referrals, feedback }: GrowthData) {
  const scored = feedback.filter((f) => f.score !== null);
  const promoters = scored.filter((f) => f.score! >= 9).length, detractors = scored.filter((f) => f.score! <= 6).length;
  const nps = scored.length ? Math.round(((promoters - detractors) / scored.length) * 100) : null;
  const quotes = feedback.filter((f) => f.quote_ok && f.useful);
  const rewarded = referrals.filter((r) => r.rewarded).length;

  return (
    <div className="admin-grid">
      <section className="panel admin-table" aria-labelledby="fb-h">
        <h2 id="fb-h">What owners say</h2>
        <div className="nps">
          <div><strong>{nps === null ? "–" : nps > 0 ? `+${nps}` : nps}</strong><div className="small muted">recommend score (NPS)</div></div>
          <div className="small muted">{scored.length} answered of {feedback.length} asked · {promoters} would recommend (9–10), {detractors} unhappy (0–6)</div>
        </div>
        {quotes.length > 0 && (
          <>
            <h3>OK to quote</h3>
            {quotes.map((q, i) => <blockquote className="quote" key={i}>&ldquo;{q.useful}&rdquo;<div className="small muted">{q.quote_name || "Anonymous"} · {q.score}/10</div></blockquote>)}
          </>
        )}
        <div className="scroll-x">
          <table className="sides">
            <thead><tr><th>Owner</th><th>Score</th><th>Most useful</th><th>Change or add</th></tr></thead>
            <tbody>
              {feedback.map((f, i) => (
                <tr key={i}>
                  <td><a href={`mailto:${f.email}`}>{f.email}</a><div className="small muted">asked {day(f.created_at)}</div></td>
                  <td style={f.score !== null && f.score <= 6 ? { color: "var(--flagged)", fontWeight: 700 } : undefined}>{f.score ?? <span className="muted">–</span>}</td>
                  <td className="small">{f.useful ?? <span className="muted">–</span>}</td>
                  <td className="small">{f.improve ?? <span className="muted">–</span>}</td>
                </tr>
              ))}
              {feedback.length === 0 && <tr><td colSpan={4} className="muted">Owners are asked after their 3rd verified visit. Nobody&apos;s there yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel admin-table" aria-labelledby="ref-h">
        <h2 id="ref-h">Referrals</h2>
        <p className="small muted" style={{ marginTop: 0 }}>{referrals.length} friends joined through an invite link, {rewarded} paid out (3 check-ins each side).</p>
        <div className="scroll-x">
          <table className="sides">
            <thead><tr><th>Invited by</th><th>Friend</th><th>Joined</th><th>First verified visit</th></tr></thead>
            <tbody>
              {referrals.map((r, i) => (
                <tr key={i}>
                  <td>{r.referrer}</td><td>{r.friend}</td><td>{day(r.joined)}</td>
                  <td>{r.rewarded ? <>{day(r.rewarded)}{r.capped && <span className="tag">referrer at limit</span>}</> : <span className="muted">not yet</span>}</td>
                </tr>
              ))}
              {referrals.length === 0 && <tr><td colSpan={4} className="muted">No referrals yet. Owners get their link on the dashboard and in every verified-visit email.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
