import Link from "next/link";

export type ReporterStage = "approved" | "signed_in" | "profile" | "ready" | "matched" | "joined" | "active";
export interface ReporterPerson {
  email: string; name: string; state: string; userId: string | null;
  stage: ReporterStage; since: string; stuck: boolean; waitingOnUs: boolean;
  property: { id: string; label: string } | null;
  nudged: Partial<Record<string, string>>;
}

const STAGES: ReporterStage[] = ["approved", "signed_in", "profile", "ready", "matched", "joined", "active"];
const LABEL: Record<ReporterStage, string> = {
  approved: "Approved, hasn't signed in",
  signed_in: "Signed in, no profile",
  profile: "Profile done, no prices",
  ready: "Ready, waiting for an introduction",
  matched: "Matched, hasn't joined the property",
  joined: "Joined, no first visit",
  active: "Has done a visit",
};
const SHORT: Record<ReporterStage, string> = {
  approved: "No sign-in", signed_in: "No profile", profile: "No prices", ready: "Ready", matched: "Matched", joined: "Joined", active: "Active",
};
const ago = (iso: string) => {
  const h = Math.floor((Date.now() - Date.parse(iso)) / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
};

/** Approved reporters and how far they've got, with a one-click email nudge for anyone stuck. */
export function AdminReporters({ people, nudge, show, notice }: { people: ReporterPerson[]; nudge: (email: string) => Promise<void>; show?: string; notice?: string }) {
  const filter = show === "r-all" || show === "r-stuck" || show?.startsWith("r-") && STAGES.includes(show.slice(2) as ReporterStage) ? show : "r-stuck";
  const shown = people.filter((p) => filter === "r-all" ? true : filter === "r-stuck" ? p.stuck : p.stage === filter.slice(2));
  const count = (st: ReporterStage) => people.filter((p) => p.stage === st).length;
  const stuck = people.filter((p) => p.stuck).length;
  if (people.length === 0) return null;

  return (
    <section className="panel admin-table" id="reporters" aria-labelledby="reporters-h">
      <h2 id="reporters-h">Reporter onboarding {stuck > 0 && <span className="todo-count">{stuck} stuck</span>}</h2>
      {notice && <p className={`notice ${notice.startsWith("error:") ? "error" : "ok"}`} role="status">{notice.replace(/^(error|ok):/, "")}</p>}
      <p className="small muted" style={{ marginTop: 0 }}>
        Every approved reporter and the furthest step they&apos;ve reached. Stuck means more than 48 hours at the same step.
        Each step that needs them gets one automatic email from you; the button here sends the same email again on demand. Replies go to your inbox.
        &ldquo;Ready&rdquo; means they&apos;re waiting on you to introduce them to an owner.
      </p>

      <nav className="pilot-filter" aria-label="Filter reporters">
        <Link href="/admin?show=r-stuck#reporters" aria-current={filter === "r-stuck"}>Stuck ({stuck})</Link>
        {STAGES.map((st) => <Link key={st} href={`/admin?show=r-${st}#reporters`} aria-current={filter === `r-${st}`}>{SHORT[st]} ({count(st)})</Link>)}
        <Link href="/admin?show=r-all#reporters" aria-current={filter === "r-all"}>All ({people.length})</Link>
      </nav>

      <div className="scroll-x">
        <table className="sides">
          <thead><tr><th>Reporter</th><th>Step</th><th>Since</th><th /></tr></thead>
          <tbody>
            {shown.map((p) => {
              const i = STAGES.indexOf(p.stage);
              const last = p.nudged[p.stage];
              const recent = last && Date.now() - Date.parse(last) < 3 * 86_400_000;
              const canNudge = p.stage !== "active" && p.stage !== "ready";
              return (
                <tr key={p.email}>
                  <td>{p.name}<div className="small"><a href={`mailto:${p.email}`}>{p.email}</a></div>
                    <div className="small muted">{p.state}{p.property && <> · {p.property.label}</>}</div></td>
                  <td><span className="stage-dots" aria-hidden="true">{STAGES.map((st, j) => <i key={st} className={j <= i ? "on" : ""} />)}</span>
                    <span className="small">{LABEL[p.stage]}</span></td>
                  <td className="small" style={p.stuck ? { color: "var(--flagged)", fontWeight: 700 } : undefined}>{ago(p.since)}</td>
                  <td>
                    {canNudge && (recent
                      ? <span className="small muted">Nudged {ago(last!)}</span>
                      : <form action={nudge.bind(null, p.email)}><button className="btn secondary small-btn" type="submit">{last ? "Nudge again" : "Nudge"}</button></form>)}
                    {p.waitingOnUs && <span className="small">Introduce them to an owner</span>}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={4} className="muted">{filter === "r-stuck" ? "Nobody stuck. Nice." : "Nobody here yet."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
