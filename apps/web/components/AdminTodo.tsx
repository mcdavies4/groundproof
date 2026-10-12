import Link from "next/link";
import type { Stats } from "./AdminView";
import { naira } from "@/lib/rates";

export type TodoActions = {
  introduce: (form: FormData) => Promise<void>;
  review: (id: string, decision: "approved" | "declined") => Promise<void>;
  link: (form: FormData) => Promise<void>;
  close: (id: string) => Promise<void>;
};

const FREQ: Record<string, string> = { once: "one visit", monthly: "monthly", fortnightly: "every 2 weeks", weekly: "weekly" };
const ago = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

/** Everything that needs Emeka, in one list, with the action next to it. */
export function AdminTodo({ s, actions }: { s: Stats; actions: TodoActions }) {
  const reporters = (s.reporters ?? []).filter((r) => r.hasProfile && !r.suspended);
  const requests = (s.groundRequests ?? []).filter((g) => g.status === "new" || g.status === "contacted");
  const applications = (s.reporterApplications ?? []).filter((a) => a.status === "new" || a.status === "contacted");
  const developers = (s.developers ?? []).filter((d) => !d.approved);
  const unlinked = (s.matches ?? []).filter((m) => m.status === "active" && !m.property_id);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const flagged = s.recentCheckins.filter((c) => c.verdict === "flagged" && Date.parse(c.time) > weekAgo);
  const stale = s.staleRequests ?? [];
  const band = (state: string) => (s.bands ?? []).find((b) => b.state === state && b.visit_type === "standard");
  const total = requests.length + applications.length + developers.length + unlinked.length + flagged.length + stale.length;

  return (
    <section className="panel todo" aria-labelledby="todo-h">
      <h2 id="todo-h">To do {total > 0 && <span className="todo-count">{total}</span>}</h2>
      {total === 0 && <p className="muted" style={{ margin: 0 }}>All clear. Nothing needs you right now.</p>}

      {requests.length > 0 && (
        <div className="todo-group">
          <h3>Owners waiting for a reporter</h3>
          {requests.map((g) => {
            const picks = reporters.filter((r) => r.state === g.state).slice(0, 3);
            const b = band(g.state);
            return (
              <div className="todo-item" key={g.id}>
                <div>{g.kind === "independent" && <span className="tag">Independent check for a buyer</span>}<strong>{g.name}</strong>: {g.area}, {g.state} · {FREQ[g.frequency] ?? g.frequency} <span className="muted small">· {ago(g.created_at)}</span>
                  {g.notes && <div className="small muted">{g.notes}</div>}</div>
                <div className="todo-actions">
                  {picks.length === 0 ? (
                    <span className="small muted">No reporter in {g.state} yet. Share <Link href="/become-a-reporter">become-a-reporter</Link> there.</span>
                  ) : picks.map((r) => {
                    const price = r.rates?.standard ?? b?.min_ngn;
                    return price ? (
                      <form key={r.id} action={actions.introduce}>
                        <input type="hidden" name="request_id" value={g.id} />
                        <input type="hidden" name="owner_name" value={g.name} />
                        <input type="hidden" name="owner_email" value={g.email} />
                        <input type="hidden" name="reporter_id" value={r.id} />
                        <input type="hidden" name="visit_type" value="standard" />
                        <input type="hidden" name="frequency" value={g.frequency} />
                        <input type="hidden" name="price_ngn" value={price} />
                        <button className="btn secondary small-btn" type="submit">Introduce {r.name} · {naira(price)}</button>
                      </form>
                    ) : (
                      <span key={r.id} className="small muted">{r.name}: set a Lagos price range or their price first</span>
                    );
                  })}
                  <form action={actions.close.bind(null, g.id)}><button className="link-btn small" type="submit">Close</button></form>
                </div>
              </div>
            );
          })}
          <p className="small muted">Introduce sends both sides the agreement. For an independent check, the reporter goes straight onto the buyer&apos;s unit and the developer is told. Need a different price or visit type? Use the full form below.</p>
        </div>
      )}

      {applications.length > 0 && (
        <div className="todo-group">
          <h3>Reporter applications</h3>
          {applications.map((a) => (
            <div className="todo-item" key={a.id}>
              <div><strong>{a.name}</strong>: {a.areas}, {a.state} · {a.occupation.replace("_", " ")}{!a.android && <span className="tag">no Android</span>}
                <div className="small"><a href={`mailto:${a.email}`}>{a.email}</a> · {a.phone} <span className="muted">· {ago(a.created_at)}</span></div></div>
              <div className="todo-actions">
                <form action={actions.review.bind(null, a.id, "approved")}><button className="btn small-btn" type="submit">Approve</button></form>
                <form action={actions.review.bind(null, a.id, "declined")}><button className="link-btn small" type="submit">Decline</button></form>
              </div>
            </div>
          ))}
          <p className="small muted">Approving emails them the app link and steps, and lets them set up their profile and prices straight away.</p>
        </div>
      )}

      {unlinked.length > 0 && (
        <div className="todo-group">
          <h3>Matches waiting for a property</h3>
          {unlinked.map((m) => {
            const props = s.ownerProperties?.[m.owner_email] ?? [];
            return (
              <div className="todo-item" key={m.id}>
                <div><strong>{m.owner_name}</strong> with {m.reporter} · {naira(m.price_ngn)}</div>
                <div className="todo-actions">
                  {props.length ? (
                    <form action={actions.link} className="inline-form">
                      <input type="hidden" name="match_id" value={m.id} />
                      <select name="property_id" aria-label="Owner's property">{props.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
                      <button className="btn secondary small-btn" type="submit">Link and send invite code</button>
                    </form>
                  ) : (
                    <span className="small muted">Hasn&apos;t added a property yet. <a href={`mailto:${m.owner_email}?subject=${encodeURIComponent("Your Groundproof property")}`}>Nudge them</a></span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {developers.length > 0 && (
        <div className="todo-group">
          <h3>Developers to approve</h3>
          <p className="small" style={{ margin: 0 }}>{developers.map((d) => d.company).join(", ")}. <a href="#developers">Review them</a></p>
        </div>
      )}

      {flagged.length > 0 && (
        <div className="todo-group">
          <h3>Flagged visits this week</h3>
          {flagged.map((c) => (
            <div className="todo-item" key={c.id}>
              <div><Link href={`/properties/${c.propertyId}`}>{c.property}</Link> by {c.reporter} <span className="muted small">· {ago(c.time)}</span>
                {c.reason && <div className="small muted">{c.reason}</div>}</div>
            </div>
          ))}
          <p className="small muted">A reporter with repeated flags? Suspend them in the reporters table.</p>
        </div>
      )}

      {stale.length > 0 && (
        <div className="todo-group">
          <h3>Visit requests waiting 3+ days</h3>
          {stale.map((r, i) => (
            <div className="todo-item" key={i}><div><Link href={`/properties/${r.propertyId}`}>{r.property}</Link> <span className="muted small">· asked {ago(r.since)}</span></div></div>
          ))}
          <p className="small muted">Give the reporter a call; the app has already reminded them.</p>
        </div>
      )}
    </section>
  );
}
