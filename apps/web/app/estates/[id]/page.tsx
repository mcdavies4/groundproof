import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { VerdictBadge } from "@/components/VerdictBadge";
import { ShareLink } from "@/components/ShareLink";
import { AddBuyersForm, AddUnitsForm } from "@/components/EstateForms";
import { createEstateCode, setEstateShare } from "../actions";
import type { Verdict } from "@/lib/types";

export const dynamic = "force-dynamic";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function EstatePage({ params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect(`/login?next=/estates/${params.id}`);

  const { data: estate } = await supabase.from("estates").select("*").eq("id", params.id).eq("developer_id", user.id).maybeSingle();
  if (!estate) notFound();

  const [{ data: units }, { data: codes }, { count: reporters }] = await Promise.all([
    supabase.from("properties").select("id, label, postcode, anchored_at, anchor_mode").eq("estate_id", estate.id).order("label"),
    supabase.from("invites").select("code, used_at, expires_at").eq("estate_id", estate.id).order("created_at", { ascending: false }).limit(1),
    supabase.from("estate_reporters").select("user_id", { count: "exact", head: true }).eq("estate_id", estate.id),
  ]);
  const ids = (units ?? []).map((u) => u.id);
  const [{ data: cs }, { data: buyers }] = ids.length
    ? await Promise.all([
        supabase.from("checkins").select("property_id, verdict, server_time, match_type").in("property_id", ids).order("server_time", { ascending: false }).limit(2000),
        supabase.from("viewer_invites").select("property_id, accepted_at").in("property_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const last = new Map<string, { verdict: Verdict; server_time: string; match_type: "postcode" | "coordinates" | null }>();
  for (const c of (cs ?? []) as { property_id: string; verdict: Verdict; server_time: string; match_type: "postcode" | "coordinates" | null }[]) {
    if (!last.has(c.property_id)) last.set(c.property_id, c);
  }
  const buyerCount = (pid: string) => (buyers ?? []).filter((b: { property_id: string }) => b.property_id === pid).length;
  const code = codes?.[0];
  const codeLive = code && !code.used_at && new Date(code.expires_at) > new Date();
  const anchored = (units ?? []).filter((u) => u.anchored_at).length;
  const flagged = [...last.values()].filter((l) => l.verdict === "flagged").length;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://groundproof.site";

  return (
    <main className="wrap page">
      <p className="small"><Link href="/estates">← All estates</Link></p>
      <h1 style={{ marginBottom: "0.3rem" }}>{estate.name}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{estate.location}</p>

      <div className="admin-tiles" style={{ margin: "1.5rem 0 2rem" }}>
        <div className="tile"><span className="tile-label">Units</span><strong className="tile-n">{(units ?? []).length}</strong><span className="tile-sub">{anchored} anchored</span></div>
        <div className="tile"><span className="tile-label">Reporters</span><strong className="tile-n">{reporters ?? 0}</strong><span className="tile-sub">on every unit</span></div>
        <div className="tile"><span className="tile-label">Buyers</span><strong className="tile-n">{(buyers ?? []).length}</strong><span className="tile-sub">{(buyers ?? []).filter((b: { accepted_at: string | null }) => b.accepted_at).length} signed in</span></div>
        <div className="tile"><span className="tile-label">Latest flagged</span><strong className="tile-n" style={flagged ? { color: "var(--flagged)" } : undefined}>{flagged}</strong><span className="tile-sub">units</span></div>
      </div>

      <div className="two-col">
        <section>
          <h2>Units</h2>
          {(units ?? []).length === 0 ? (
            <p className="muted">No units yet. Add them on the right.</p>
          ) : (
            <div className="scroll-x">
              <table className="sides">
                <thead><tr><th>Unit</th><th>Status</th><th>Latest visit</th><th>Buyers</th></tr></thead>
                <tbody>
                  {(units ?? []).map((u) => {
                    const l = last.get(u.id);
                    return (
                      <tr key={u.id}>
                        <td><Link href={`/properties/${u.id}`}>{u.label}</Link></td>
                        <td className="small">{u.anchored_at ? (u.postcode ?? "Anchored by location") : "Waiting for first visit"}</td>
                        <td>{l ? <><VerdictBadge verdict={l.verdict} matchType={l.match_type} /><div className="small muted">{day(l.server_time)}</div></> : <span className="muted small">None yet</span>}</td>
                        <td>{buyerCount(u.id)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted" style={{ marginTop: "1rem" }}>
            Open a unit to see its photos, set payment stages, or request a visit. You get an email when a visit is flagged or needs a look;
            buyers get every update for their own unit.
          </p>
        </section>

        <aside>
          <div className="panel">
            <h3>Reporter code for the whole estate</h3>
            {codeLive ? (
              <>
                <div className="code">{code!.code}</div>
                <p className="small muted">Valid until {day(code!.expires_at)}. Whoever enters it in the Groundproof app can check in on every unit, including units you add later.</p>
              </>
            ) : (
              <form action={createEstateCode.bind(null, estate.id)}>
                <p className="small muted">One code covers every unit. Give it to your site supervisor or an independent reporter.</p>
                <button className="btn secondary" type="submit">Create estate code</button>
              </form>
            )}
            <p className="small" style={{ marginTop: "0.75rem" }}>Want an independent reporter? <Link href="/find-someone">We&apos;ll find one</Link>.</p>
          </div>

          <div className="panel">
            <h3>Public estate page</h3>
            {estate.share_token ? (
              <>
                <p className="small">Show prospective buyers independently verified progress, without names or exact locations:</p>
                <ShareLink url={`${site}/e/${estate.share_token}`} title={`${estate.name}: verified by Groundproof`} />
                <form action={setEstateShare.bind(null, estate.id, false)}><button type="submit" className="link-btn">Turn off this page</button></form>
              </>
            ) : (
              <form action={setEstateShare.bind(null, estate.id, true)}>
                <p className="small muted">A shareable &ldquo;verified by Groundproof&rdquo; page for marketing. You can turn it off any time.</p>
                <button className="btn secondary" type="submit">Create public page</button>
              </form>
            )}
          </div>

          <div className="panel"><h3>Add units</h3><AddUnitsForm estateId={estate.id} /></div>
          <div className="panel" id="buyers"><h3>Invite buyers</h3><AddBuyersForm estateId={estate.id} /></div>
        </aside>
      </div>
    </main>
  );
}
