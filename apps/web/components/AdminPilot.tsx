import Link from "next/link";

export type PilotStage = "signed_up" | "added" | "reporter" | "anchored" | "verified";
export interface PilotPerson {
  id: string; email: string; signedUp: string; source: string; landing: string | null; web: boolean;
  stage: PilotStage; since: string; stuck: boolean; properties: { id: string; label: string }[];
  nudged: Partial<Record<PilotStage, string>>;
}
export interface PilotData {
  people: PilotPerson[];
  sources: { source: string; signedUp: number; added: number; verified: number; last7: number }[];
}

const STAGES: PilotStage[] = ["signed_up", "added", "reporter", "anchored", "verified"];
const LABEL: Record<PilotStage, string> = {
  signed_up: "Signed up, no property",
  added: "Property added, nobody on the ground",
  reporter: "Reporter joined, not anchored",
  anchored: "Anchored, no verified visit yet",
  verified: "Had a verified visit",
};
const ago = (iso: string) => {
  const h = Math.floor((Date.now() - Date.parse(iso)) / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
};

/** Every pilot owner and how far they've got, with a one-click personal nudge for anyone stuck. */
export function AdminPilot({ data, nudge, show, notice }: { data: PilotData; nudge: (userId: string) => Promise<void>; show?: string; notice?: string }) {
  const filter = show === "all" || show === "stuck" || STAGES.includes(show as PilotStage) ? show! : "stuck";
  const people = data.people.filter((p) => filter === "all" ? true : filter === "stuck" ? p.stuck : p.stage === filter);
  const count = (st: PilotStage) => data.people.filter((p) => p.stage === st).length;
  const stuck = data.people.filter((p) => p.stuck).length;

  return (
    <section className="panel admin-table" id="pilot" aria-labelledby="pilot-h">
      <h2 id="pilot-h">Pilot owners {stuck > 0 && <span className="todo-count">{stuck} stuck</span>}</h2>
      {notice && <p className={`notice ${notice.startsWith("error:") ? "error" : "ok"}`} role="status">{notice.replace(/^(error|ok):/, "")}</p>}
      <p className="small muted" style={{ marginTop: 0 }}>
        Everyone who signed up to own a property, and the furthest step they&apos;ve reached. Stuck means more than 48 hours at the same step.
        Steps 2 to 4 also get automatic tips; a nudge from here comes from you, and replies go to your inbox.
      </p>

      {data.sources.length > 0 && (
        <>
          <h3 style={{ marginBottom: 0 }}>Where sign-ups came from</h3>
          <div className="pilot-sources">
            {data.sources.map((s) => (
              <span key={s.source} title={`${s.added} added a property, ${s.verified} had a verified visit`}>
                <strong>{s.source}</strong> {s.signedUp}{s.last7 > 0 && <span className="muted"> (+{s.last7} this week)</span>} · {s.verified} verified
              </span>
            ))}
          </div>
        </>
      )}

      <nav className="pilot-filter" aria-label="Filter pilot owners">
        <Link href="/admin?show=stuck#pilot" aria-current={filter === "stuck"}>Stuck ({stuck})</Link>
        {STAGES.map((st) => <Link key={st} href={`/admin?show=${st}#pilot`} aria-current={filter === st}>{LABEL[st].split(",")[0]} ({count(st)})</Link>)}
        <Link href="/admin?show=all#pilot" aria-current={filter === "all"}>All ({data.people.length})</Link>
      </nav>

      <div className="scroll-x">
        <table className="sides">
          <thead><tr><th>Owner</th><th>Step</th><th>Since</th><th>From</th><th /></tr></thead>
          <tbody>
            {people.map((p) => {
              const i = STAGES.indexOf(p.stage);
              const last = p.nudged[p.stage];
              const recent = last && Date.now() - Date.parse(last) < 3 * 86_400_000;
              return (
                <tr key={p.id}>
                  <td><a href={`mailto:${p.email}`}>{p.email}</a>
                    <div className="small muted">joined {ago(p.signedUp)}{p.properties.length > 0 && <> · {p.properties.map((x) => x.label).join(", ")}</>}</div></td>
                  <td><span className="stage-dots" aria-hidden="true">{STAGES.map((st, j) => <i key={st} className={j <= i ? "on" : ""} />)}</span>
                    <span className="small">{LABEL[p.stage]}</span></td>
                  <td className="small" style={p.stuck ? { color: "var(--flagged)", fontWeight: 700 } : undefined}>{ago(p.since)}</td>
                  <td className="small">{p.source}{p.landing && <div className="muted">{p.landing}</div>}</td>
                  <td>
                    {p.stage !== "verified" && (recent
                      ? <span className="small muted">Nudged {ago(last!)}</span>
                      : <form action={nudge.bind(null, p.id)}><button className="btn secondary small-btn" type="submit">{last ? "Nudge again" : "Nudge"}</button></form>)}
                  </td>
                </tr>
              );
            })}
            {people.length === 0 && <tr><td colSpan={5} className="muted">{filter === "stuck" ? "Nobody stuck. Nice." : "Nobody here yet."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
