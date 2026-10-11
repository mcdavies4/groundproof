import { STATES } from "@/lib/nigeria";
import { VISIT_ORDER, VISIT_TYPES, naira, type VisitType } from "@/lib/rates";

export type Band = { state: string; visit_type: VisitType; min_ngn: number; max_ngn: number };
export type Match = {
  id: string; owner_name: string; owner_email: string; reporter: string; property: string | null; property_id: string | null;
  visit_type: VisitType; price_ngn: number; frequency: string; status: string; created_at: string;
};
type Reporter = { id: string; name: string | null; email: string; where: string | null; suspended: boolean; hasProfile: boolean };
type Request = { id: string; name: string; email: string; area: string; state: string; status: string };

export type PricingActions = {
  setMatchedFree: (on: boolean) => Promise<void>;
  setBand: (form: FormData) => Promise<void>;
  deleteBand: (state: string, visitType: string) => Promise<void>;
  createMatch: (form: FormData) => Promise<void>;
  endMatch: (id: string) => Promise<void>;
};

const FREQ: Record<string, string> = { once: "One visit", monthly: "Monthly", fortnightly: "Every 2 weeks", weekly: "Weekly" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Rate bands, introductions and matches, on the admin dashboard. */
export function AdminPricing({ bands, matches, reporters, requests, actions, notice, matchedFree }: {
  bands: Band[]; matches: Match[]; reporters: Reporter[]; requests: Request[]; actions: PricingActions; notice?: string; matchedFree: boolean;
}) {
  const states = [...new Set(bands.map((b) => b.state))];
  const matchable = reporters.filter((r) => r.hasProfile && !r.suspended);
  return (
    <>
      {notice && <p className={`notice ${notice.startsWith("error:") ? "error" : "ok"}`} role="status">{notice.replace(/^(error|ok):/, "")}</p>}

      <section className="panel switch-panel">
        <div>
          <h2 style={{ margin: 0 }}>Matched visits: {matchedFree ? "free (pilot)" : "charged as normal"}</h2>
          <p className="small muted" style={{ margin: "0.4rem 0 0" }}>
            {matchedFree
              ? "Visits by a reporter you introduced don't use the owner's credits or plan. Owners pay the reporter only."
              : "Visits by a reporter you introduced use the owner's credits or plan, like any other check-in."}
            {" "}The rates page, reporter profiles, property pages and agreement emails follow this switch.
          </p>
        </div>
        <form action={actions.setMatchedFree.bind(null, !matchedFree)}>
          <button className={`btn${matchedFree ? "" : " secondary"}`} type="submit">{matchedFree ? "End the free pilot" : "Make matched visits free again"}</button>
        </form>
      </section>

      <div className="admin-grid">
        <section className="panel admin-table">
          <h2>Price ranges</h2>
          <p className="small muted">Shown on /rates. Reporters can only set prices inside these, and introductions must be inside them.</p>
          <div className="scroll-x">
            <table className="sides">
              <thead><tr><th>State</th>{VISIT_ORDER.map((t) => <th key={t}>{VISIT_TYPES[t].name}</th>)}</tr></thead>
              <tbody>
                {states.map((st) => (
                  <tr key={st}>
                    <td><strong>{st}</strong></td>
                    {VISIT_ORDER.map((t) => {
                      const b = bands.find((x) => x.state === st && x.visit_type === t);
                      return (
                        <td key={t}>
                          {b ? <>{naira(b.min_ngn)}–{naira(b.max_ngn)}
                            <form action={actions.deleteBand.bind(null, st, t)} style={{ display: "inline" }}><button className="link-btn small" type="submit" aria-label={`Remove ${st} ${VISIT_TYPES[t].name}`}> ✕</button></form></>
                            : <span className="muted">–</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {states.length === 0 && <tr><td colSpan={4} className="muted">No ranges yet. Add the first below, once you have a few reporters&apos; prices.</td></tr>}
              </tbody>
            </table>
          </div>
          <form action={actions.setBand} className="band-form">
            <div><label htmlFor="b-state">State</label>
              <select id="b-state" name="state" required defaultValue="Lagos">{STATES.map((x) => <option key={x}>{x}</option>)}</select></div>
            <div><label htmlFor="b-type">Visit</label>
              <select id="b-type" name="visit_type" required>{VISIT_ORDER.map((t) => <option key={t} value={t}>{VISIT_TYPES[t].name}</option>)}</select></div>
            <div><label htmlFor="b-min">From ₦</label><input id="b-min" name="min_ngn" type="number" min={500} step={500} required /></div>
            <div><label htmlFor="b-max">To ₦</label><input id="b-max" name="max_ngn" type="number" min={500} step={500} required /></div>
            <button className="btn secondary" type="submit">Save range</button>
          </form>
        </section>

        <section className="panel">
          <h2>Introduce an owner and a reporter</h2>
          <p className="small muted">Both get a written agreement by email. While the match is active, that reporter&apos;s visits on that property don&apos;t use the owner&apos;s credits.</p>
          {matchable.length === 0 ? <p className="muted">No reporters with a profile yet.</p> : (
            <form action={actions.createMatch}>
              <div className="field"><label htmlFor="m-req">From a request (optional)</label>
                <select id="m-req" name="request_id" defaultValue="">
                  <option value="">None</option>
                  {requests.filter((r) => r.status !== "matched").map((r) => <option key={r.id} value={r.id}>{r.name}: {r.area}, {r.state}</option>)}
                </select></div>
              <div className="field"><label htmlFor="m-oname">Owner&apos;s name</label><input id="m-oname" name="owner_name" type="text" required maxLength={100} /></div>
              <div className="field"><label htmlFor="m-oemail">Owner&apos;s email</label><input id="m-oemail" name="owner_email" type="email" required /></div>
              <div className="field"><label htmlFor="m-rep">Reporter</label>
                <select id="m-rep" name="reporter_id" required>
                  {matchable.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.where ?? r.email})</option>)}
                </select></div>
              <div className="field"><label htmlFor="m-type">Visit</label>
                <select id="m-type" name="visit_type" required>{VISIT_ORDER.map((t) => <option key={t} value={t}>{VISIT_TYPES[t].name}</option>)}</select></div>
              <div className="field"><label htmlFor="m-price">Agreed price per visit (₦)</label><input id="m-price" name="price_ngn" type="number" min={500} step={500} required /></div>
              <div className="field"><label htmlFor="m-freq">How often</label>
                <select id="m-freq" name="frequency" required>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="field"><label htmlFor="m-prop">Property ID (optional)</label><input id="m-prop" name="property_id" type="text" placeholder="From the property page address" />
                <p className="hint">Add it once the owner has added the property, so their visits stop using credits.</p></div>
              <div className="field"><label htmlFor="m-notes">Notes (optional)</label><input id="m-notes" name="notes" type="text" maxLength={500} /></div>
              <button className="btn" type="submit">Introduce and send agreement</button>
            </form>
          )}
        </section>
      </div>

      <section className="panel admin-table">
        <h2>Matches</h2>
        <div className="scroll-x">
          <table className="sides">
            <thead><tr><th>Since</th><th>Owner</th><th>Reporter</th><th>Agreed</th><th>Property</th><th /></tr></thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.id}>
                  <td>{day(m.created_at)}</td>
                  <td>{m.owner_name}<div className="small"><a href={`mailto:${m.owner_email}`}>{m.owner_email}</a></div></td>
                  <td>{m.reporter}</td>
                  <td>{VISIT_TYPES[m.visit_type]?.name}, {naira(m.price_ngn)}<div className="small muted">{FREQ[m.frequency] ?? m.frequency}</div></td>
                  <td>{m.property ?? <span className="muted">not linked</span>}</td>
                  <td>{m.status === "active"
                    ? <form action={actions.endMatch.bind(null, m.id)}><button className="link-btn" type="submit">End</button></form>
                    : <span className="muted small">Ended</span>}</td>
                </tr>
              ))}
              {matches.length === 0 && <tr><td colSpan={6} className="muted">No introductions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
