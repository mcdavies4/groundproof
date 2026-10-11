import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { PostcodePlate } from "@/components/PostcodePlate";
import { VerdictBadge } from "@/components/VerdictBadge";
import type { Property, Verdict } from "@/lib/types";

export default async function Dashboard() {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");

  // Pick up any family-viewer invites sent to this email.
  await supabase.rpc("claim_viewer_invites");

  const [{ data: properties }, { data: viewing }] = await Promise.all([
    supabase.from("properties").select("*").eq("owner_id", user.id).is("estate_id", null).order("created_at", { ascending: false }),
    supabase.from("property_members").select("property_id").eq("user_id", user.id).eq("role", "viewer"),
  ]);
  const sharedIds = (viewing ?? []).map((v) => v.property_id);
  const { data: dev } = await supabase.from("developers").select("approved").eq("user_id", user.id).maybeSingle();
  const { data: shared } = sharedIds.length
    ? await supabase.from("properties").select("*").in("id", sharedIds).order("created_at", { ascending: false })
    : { data: [] as Property[] };

  const ids = [...(properties ?? []), ...(shared ?? [])].map((p) => p.id);
  const latest = new Map<string, { verdict: Verdict; server_time: string; match_type: "postcode" | "coordinates" | null }>();
  if (ids.length) {
    const { data: checkins } = await supabase
      .from("checkins")
      .select("property_id, verdict, server_time, match_type")
      .in("property_id", ids)
      .order("server_time", { ascending: false });
    for (const c of checkins ?? []) if (!latest.has(c.property_id)) latest.set(c.property_id, c);
  }

  return (
    <main className="wrap page">
      <div className="page-head">
        <h1 style={{ margin: 0 }}>Your properties</h1>
        {dev?.approved && <Link className="btn secondary" href="/estates">Your estates</Link>}
        <div className="row-links">
          <Link className="btn secondary" href="/plots/new">Check a plot</Link>
          <Link className="btn" href="/properties/new">Add a property</Link>
        </div>
      </div>

      {(properties ?? []).length === 0 && (shared ?? []).length > 0 ? (
        <p className="muted">You don&apos;t have your own properties yet. <Link href="/properties/new">Add one</Link> any time.</p>
      ) : (properties ?? []).length === 0 ? (
        <div className="empty">
          <h2>Add the first property you want watched</h2>
          <p>If you know its NIPOST postcode, have it ready. If not, your person on the ground finds it at their first visit.</p>
          <Link className="btn" href="/properties/new">Add a property</Link>
        </div>
      ) : (
        <PropertyList items={properties as Property[]} latest={latest} />
      )}

      {(shared ?? []).length > 0 && (
        <section style={{ marginTop: "2.5rem" }} aria-labelledby="shared">
          <h2 id="shared">Shared with you</h2>
          <p className="small muted">Someone added you to watch these. You see every check-in; only they can make changes.</p>
          <PropertyList items={shared as Property[]} latest={latest} />
        </section>
      )}
    </main>
  );
}

type Latest = Map<string, { verdict: Verdict; server_time: string; match_type: "postcode" | "coordinates" | null }>;

function PropertyList({ items, latest }: { items: Property[]; latest: Latest }) {
  return (
        <ul className="list">
          {items.map((p) => {
            const last = latest.get(p.id);
            return (
              <li key={p.id}>
                <Link className="row-link" href={`/properties/${p.id}`}>
                  <div>
                    <strong>{p.label}</strong>
                    <div className="small muted">
                      {p.kind === "plot" ? "Walk every beacon before you buy" : p.anchored_at ? "Anchored" : "Waiting for the anchor visit"}
                      {last && `, last check-in ${new Date(last.server_time).toLocaleDateString("en-GB")}`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {p.kind === "plot" ? <span className="small muted">Plot to check · {(p.beacons ?? []).length} beacons</span>
                      : p.postcode ? <PostcodePlate code={p.postcode} size="sm" /> : <span className="small muted">{p.anchor_mode === "coordinates" ? "Anchored by location" : "Postcode found on first visit"}</span>}
                    {last && <div style={{ marginTop: "0.4rem" }}><VerdictBadge verdict={last.verdict} matchType={last.match_type} /></div>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
  );
}
