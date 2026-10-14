import Link from "next/link";
import { VerdictBadge } from "@/components/VerdictBadge";
import type { Verdict } from "@/lib/types";
import { AdminPricing, type Band, type Match, type PricingActions } from "./AdminPricing";
import { AdminTodo, type TodoActions } from "./AdminTodo";
import { AdminPilot, type PilotData } from "./AdminPilot";
import { AdminReporters, type ReporterPerson } from "./AdminReporters";
import { AdminGrowth, type GrowthData } from "./AdminGrowth";

export interface Stats {
  generatedAt: string;
  totals: {
    waitlist: number; owners: number; reporters: number; viewers?: number; properties: number; anchored: number;
    checkins: number; checkins7d: number; paidCount: number; paidNgn: number; shareLinks: number;
  };
  funnel: { step: string; count: number }[];
  verdicts: Record<Verdict, number>;
  nipost: { reverse24h: number; reverse7d: number; lookups7d: number };
  properties: {
    id: string; label: string; owner: string; postcode: string | null; anchorMode: string | null; anchoredAt: string | null;
    createdAt: string; checkins: number; flagged: number; lastCheckin: string | null; lastVerdict: Verdict | null;
    credits: number; plan: string; planExpires: string | null; reporters: string[];
  }[];
  recentCheckins: {
    id: string; time: string; property: string; propertyId: string; reporter: string; isAnchor: boolean; verdict: Verdict;
    reason: string | null; matchType: "postcode" | "coordinates" | null; emulator: boolean; mocked: boolean;
    photoMatch: string | null; paidBy: string | null;
  }[];
  payments: { time: string; property: string; who: string; product: string; amount: number; status: string }[];
  waitlist: { email: string; plan: string | null; created_at: string }[];
  developers?: { user_id: string; company: string; website: string | null; phone: string | null; approved: boolean; created_at: string; email: string; estates: number; units: number }[];
  settings?: { matchedVisitsFree: boolean; estateUnitPrice?: number };
  pilot?: PilotData;
  reporterFunnel?: ReporterPerson[];
  referrals?: GrowthData["referrals"];
  feedback?: GrowthData["feedback"];
  bands?: Band[];
  ownerProperties?: Record<string, { id: string; label: string }[]>;
  staleRequests?: { property: string; propertyId: string; since: string }[];
  matches?: Match[];
  reporters?: { id: string; state: string | null; suspended: boolean; hasProfile: boolean; agreedRules: boolean; rates: Record<string, number>; email: string; name: string | null; slug: string | null; where: string | null; visits: number; verified: number; flagged: number; properties: number; last: string | null }[];
  groundRequests?: { id: string; name: string; email: string; phone: string | null; state: string; area: string; property_type: string; frequency: string; notes: string | null; status: string; created_at: string; kind?: string; property_id?: string | null }[];
  reporterApplications?: { id: string; name: string; email: string; phone: string; state: string; areas: string; occupation: string; android: boolean; notes: string | null; status: string; created_at: string }[];
}

const naira = new Intl.NumberFormat("en-GB", { style: "currency", currency: "NGN", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 });
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "–");
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function AdminView({ s, approve, pricing, suspend, notice, todo, nudge, nudgeReporter, show }: {
  s: Stats; approve?: (userId: string) => Promise<void>; pricing?: PricingActions; todo?: TodoActions;
  nudge?: (userId: string) => Promise<void>; nudgeReporter?: (email: string) => Promise<void>; show?: string;
  suspend?: (userId: string, on: boolean) => Promise<void>; notice?: string;
}) {
  const t = s.totals;
  const top = Math.max(1, ...s.funnel.map((f) => f.count));
  const totalVerdicts = Math.max(1, s.verdicts.verified + s.verdicts.review + s.verdicts.flagged);

  return (
    <main className="admin page">
      <div className="admin-head">
        <h1>Pilot dashboard</h1>
        <p className="small muted">Updated {when(s.generatedAt)}. Refresh the page for the latest.</p>
      </div>

      {notice && !pricing && <p className="notice">{notice.replace(/^(error|ok):/, "")}</p>}
      {todo && <AdminTodo s={s} actions={todo} />}
      {s.pilot && nudge && <AdminPilot data={s.pilot} nudge={nudge} show={show} notice={show && !show.startsWith("r-") ? notice : undefined} />}
      {s.reporterFunnel && nudgeReporter && <AdminReporters people={s.reporterFunnel} nudge={nudgeReporter} show={show} notice={show?.startsWith("r-") ? notice : undefined} />}
      {(s.referrals || s.feedback) && <AdminGrowth referrals={s.referrals ?? []} feedback={s.feedback ?? []} />}

      <section className="admin-tiles" aria-label="Totals">
        <Tile n={t.properties} label="Properties" sub={`${t.anchored} anchored`} />
        <Tile n={t.owners} label="Owners" sub={`${t.reporters} reporters, ${t.viewers ?? 0} family viewers`} />
        <Tile n={t.checkins} label="Check-ins" sub={`${t.checkins7d} in the last 7 days`} />
        <Tile n={t.waitlist} label="Waitlist" sub={`${t.shareLinks} share links on`} />
        <Tile n={naira.format(t.paidNgn)} label="Paid" sub={`${t.paidCount} payment${t.paidCount === 1 ? "" : "s"}`} />
      </section>

      <div className="admin-grid">
        <section className="panel">
          <h2>Pilot funnel</h2>
          <p className="small muted">People who reached each step. The biggest drop shows where to focus.</p>
          <ol className="funnel">
            {s.funnel.map((f, i) => {
              const prev = i > 0 ? s.funnel[i - 1].count : null;
              const pct = prev ? Math.round((f.count / prev) * 100) : null;
              return (
                <li key={f.step}>
                  <span className="funnel-label">{f.step}</span>
                  <span className="funnel-track"><span className="funnel-bar" style={{ width: `${(f.count / top) * 100}%` }} /></span>
                  <span className="funnel-n">{f.count}{pct !== null && <span className="muted"> · {pct}%</span>}</span>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="panel">
          <h2>Verdicts</h2>
          <div className="verdict-bar" role="img"
            aria-label={`${s.verdicts.verified} verified, ${s.verdicts.review} need a look, ${s.verdicts.flagged} flagged`}>
            {(["verified", "review", "flagged"] as const).map((v) => s.verdicts[v] > 0 && (
              <span key={v} className={`vb-${v}`} style={{ flexGrow: s.verdicts[v] }} />
            ))}
          </div>
          <dl className="facts">
            <dt><VerdictBadge verdict="verified" /></dt><dd>{s.verdicts.verified} ({Math.round((s.verdicts.verified / totalVerdicts) * 100)}%)</dd>
            <dt><VerdictBadge verdict="review" /></dt><dd>{s.verdicts.review}</dd>
            <dt><VerdictBadge verdict="flagged" /></dt><dd>{s.verdicts.flagged}</dd>
            <dt><VerdictBadge verdict="pending" /></dt><dd>{s.verdicts.pending}</dd>
          </dl>
          <h3 style={{ marginTop: "1.5rem" }}>NIPOST calls (estimated)</h3>
          <dl className="facts">
            <dt>Reverse geocode, 24 h</dt><dd>{s.nipost.reverse24h}</dd>
            <dt>Reverse geocode, 7 days</dt><dd>{s.nipost.reverse7d}</dd>
            <dt>Lookups, 7 days</dt><dd>up to {s.nipost.lookups7d}</dd>
          </dl>
        </section>
      </div>

      <section className="panel admin-table">
        <h2>Properties</h2>
        <div className="scroll-x">
          <table className="sides">
            <thead><tr><th>Property</th><th>Owner</th><th>Reporters</th><th>Anchor</th><th>Check-ins</th><th>Last</th><th>Credits / plan</th></tr></thead>
            <tbody>
              {s.properties.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.label}</strong><div className="small muted">{p.postcode ?? (p.anchorMode === "coordinates" ? "by location" : "no postcode yet")} · added {day(p.createdAt)}</div></td>
                  <td>{p.owner}</td>
                  <td>{p.reporters.length ? p.reporters.join(", ") : <span className="muted">none invited</span>}</td>
                  <td>{p.anchoredAt ? day(p.anchoredAt) : <span className="muted">not yet</span>}</td>
                  <td>{p.checkins}{p.flagged > 0 && <div className="small" style={{ color: "var(--flagged)" }}>{p.flagged} flagged</div>}</td>
                  <td>{p.lastVerdict ? <><VerdictBadge verdict={p.lastVerdict} /><div className="small muted">{day(p.lastCheckin)}</div></> : <span className="muted">–</span>}</td>
                  <td>{p.credits} left{p.plan !== "none" && p.planExpires && new Date(p.planExpires) > new Date() ? <div className="small muted">{p.plan} to {day(p.planExpires)}</div> : null}</td>
                </tr>
              ))}
              {s.properties.length === 0 && <tr><td colSpan={7} className="muted">No properties yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel admin-table">
        <h2>Recent check-ins</h2>
        <div className="scroll-x">
          <table className="sides">
            <thead><tr><th>When</th><th>Property</th><th>Reporter</th><th>Verdict</th><th>Reason</th><th>Signals</th></tr></thead>
            <tbody>
              {s.recentCheckins.map((c) => (
                <tr key={c.id}>
                  <td>{when(c.time)}</td>
                  <td><Link href={`/properties/${c.propertyId}`}>{c.property}</Link>{c.isAnchor && <div className="small muted">anchor visit</div>}</td>
                  <td>{c.reporter}</td>
                  <td><VerdictBadge verdict={c.verdict} matchType={c.matchType} /></td>
                  <td className="small">{c.reason ?? "–"}</td>
                  <td className="small">
                    {c.emulator && <span className="tag bad">emulator</span>}
                    {c.mocked && <span className="tag bad">mock location</span>}
                    {c.photoMatch === "mismatch" && <span className="tag warn">photos differ</span>}
                    {c.paidBy && <span className="tag">{c.paidBy === "credit" ? "used a credit" : c.paidBy === "plan" ? "on a plan" : "free anchor"}</span>}
                  </td>
                </tr>
              ))}
              {s.recentCheckins.length === 0 && <tr><td colSpan={6} className="muted">No check-ins yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="small muted">Links to a property only open for you if you&apos;re its owner or reporter.</p>
      </section>

      <section className="panel admin-table">
        <h2 id="developers">Developers</h2>
        <div className="scroll-x">
          <table className="sides">
            <thead><tr><th>Company</th><th>Contact</th><th>Estates</th><th>Units</th><th>Status</th></tr></thead>
            <tbody>
              {(s.developers ?? []).map((d) => (
                <tr key={d.user_id}>
                  <td>{d.company}{d.website && <div className="small"><a href={d.website.startsWith("http") ? d.website : `https://${d.website}`} target="_blank" rel="noreferrer">{d.website}</a></div>}</td>
                  <td><a href={`mailto:${d.email}`}>{d.email}</a>{d.phone && <div className="small muted">{d.phone}</div>}</td>
                  <td>{d.estates}</td>
                  <td>{d.units}</td>
                  <td>
                    {d.approved ? "Approved" : approve ? (
                      <form action={approve.bind(null, d.user_id)}><button className="btn secondary" type="submit">Approve</button></form>
                    ) : "Waiting"}
                  </td>
                </tr>
              ))}
              {(s.developers ?? []).length === 0 && <tr><td colSpan={5} className="muted">No developer applications yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {pricing && (
        <AdminPricing
          bands={s.bands ?? []} matches={s.matches ?? []} actions={pricing} notice={show ? undefined : notice}
          matchedFree={s.settings?.matchedVisitsFree ?? true} estatePrice={s.settings?.estateUnitPrice}
          reporters={(s.reporters ?? []).map((r) => ({ id: r.id, name: r.name, email: r.email, where: r.where, suspended: r.suspended, hasProfile: r.hasProfile }))}
          requests={(s.groundRequests ?? []).map((g) => ({ id: g.id, name: g.name, email: g.email, area: g.area, state: g.state, status: g.status }))}
        />
      )}

      <section className="panel admin-table">
        <h2>Reporters by record</h2>
        <p className="small muted">Best first. Offer new owners to the top reporter in their area.</p>
        <div className="scroll-x">
          <table className="sides">
            <thead><tr><th>Reporter</th><th>Covers</th><th>Visits</th><th>Verified</th><th>Flagged</th><th>Properties</th><th>Last visit</th><th>Prices</th><th /></tr></thead>
            <tbody>
              {(s.reporters ?? []).map((r) => (
                <tr key={r.email}>
                  <td>{r.slug ? <a href={`/reporters/${r.slug}`}>{r.name}</a> : r.name ?? <span className="muted">no profile</span>}<div className="small"><a href={`mailto:${r.email}`}>{r.email}</a></div></td>
                  <td>{r.where ?? <span className="muted">-</span>}</td>
                  <td>{r.visits}</td>
                  <td>{r.verified}{r.visits > 0 && <span className="small muted"> ({Math.round((r.verified / r.visits) * 100)}%)</span>}</td>
                  <td style={r.flagged ? { color: "var(--flagged)", fontWeight: 700 } : undefined}>{r.flagged}</td>
                  <td>{r.properties}</td>
                  <td>{r.last ? day(r.last) : "-"}</td>
                  <td className="small">{Object.keys(r.rates ?? {}).length
                    ? Object.entries(r.rates).map(([t, n]) => <div key={t}>{t}: {naira.format(n)}</div>)
                    : <span className="muted">{r.hasProfile ? (r.agreedRules ? "not set" : "rules not agreed") : "-"}</span>}</td>
                  <td>{suspend && r.hasProfile && (
                    <form action={suspend.bind(null, r.id, !r.suspended)}>
                      <button className="link-btn" type="submit" style={r.suspended ? undefined : { color: "var(--flagged)" }}>{r.suspended ? "Unsuspend" : "Suspend"}</button>
                    </form>
                  )}{r.suspended && <span className="tag">suspended</span>}</td>
                </tr>
              ))}
              {(s.reporters ?? []).length === 0 && <tr><td colSpan={9} className="muted">No reporters yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="admin-grid">
        <section className="panel admin-table">
          <h2>Need someone on the ground</h2>
          <table className="sides">
            <thead><tr><th>When</th><th>Who</th><th>Where</th><th>What</th></tr></thead>
            <tbody>
              {(s.groundRequests ?? []).map((g) => (
                <tr key={g.id}>
                  <td>{day(g.created_at)}</td>
                  <td>{g.name}<div className="small"><a href={`mailto:${g.email}?subject=${encodeURIComponent("Your Groundproof request")}`}>{g.email}</a>{g.phone && <> · {g.phone}</>}</div></td>
                  <td>{g.area}, {g.state}</td>
                  <td>{g.kind === "independent" ? <span className="tag">independent check</span> : null}{LEAD_LABEL[g.property_type] ?? g.property_type}, {LEAD_LABEL[g.frequency] ?? g.frequency}{g.notes && <div className="small muted">{g.notes}</div>}</td>
                </tr>
              ))}
              {(s.groundRequests ?? []).length === 0 && <tr><td colSpan={4} className="muted">No requests yet.</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="panel admin-table">
          <h2>Want to do visits</h2>
          <table className="sides">
            <thead><tr><th>When</th><th>Who</th><th>Covers</th><th>About</th></tr></thead>
            <tbody>
              {(s.reporterApplications ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{day(r.created_at)}</td>
                  <td>{r.name}<div className="small"><a href={`mailto:${r.email}`}>{r.email}</a> · {r.phone}</div></td>
                  <td>{r.areas}, {r.state}</td>
                  <td>{LEAD_LABEL[r.occupation] ?? r.occupation}{!r.android && <span className="tag">no Android</span>}{r.notes && <div className="small muted">{r.notes}</div>}</td>
                </tr>
              ))}
              {(s.reporterApplications ?? []).length === 0 && <tr><td colSpan={4} className="muted">No applications yet.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      <div className="admin-grid">
        <section className="panel admin-table">
          <h2>Payments</h2>
          <table className="sides">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {s.payments.map((p, i) => (
                <tr key={i}><td>{day(p.time)}</td><td>{p.who}<div className="small muted">{p.property}</div></td><td>{p.product}</td><td>{naira.format(p.amount)}</td><td>{p.status}</td></tr>
              ))}
              {s.payments.length === 0 && <tr><td colSpan={5} className="muted">No payments yet.</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="panel admin-table">
          <h2>Waitlist</h2>
          <table className="sides">
            <thead><tr><th>Email</th><th>Joined</th></tr></thead>
            <tbody>
              {s.waitlist.map((w) => <tr key={w.email}><td>{w.email}</td><td>{day(w.created_at)}</td></tr>)}
              {s.waitlist.length === 0 && <tr><td colSpan={2} className="muted">Nobody yet.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

const LEAD_LABEL: Record<string, string> = {
  building: "Being built", completed: "Finished house", land: "Land", rental: "Rental",
  once: "one visit", monthly: "monthly", fortnightly: "every 2 weeks", weekly: "weekly",
  surveyor: "Surveyor", agent: "Estate agent", builder: "Builder", corps_member: "Corps member", student: "Student", other: "Other",
};

function Tile({ n, label, sub }: { n: number | string; label: string; sub: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <strong className="tile-n">{n}</strong>
      <span className="tile-sub">{sub}</span>
    </div>
  );
}
