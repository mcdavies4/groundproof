import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { PostcodePlate } from "@/components/PostcodePlate";
import { VerdictBadge } from "@/components/VerdictBadge";
import type { Property, Verdict } from "@/lib/types";

export default async function Dashboard() {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");

  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const ids = (properties ?? []).map((p) => p.id);
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
        <Link className="btn" href="/properties/new">Add a property</Link>
      </div>

      {(properties ?? []).length === 0 ? (
        <div className="empty">
          <h2>Add the first property you want watched</h2>
          <p>If you know its NIPOST postcode, have it ready. If not, your person on the ground finds it at their first visit.</p>
          <Link className="btn" href="/properties/new">Add a property</Link>
        </div>
      ) : (
        <ul className="list">
          {(properties as Property[]).map((p) => {
            const last = latest.get(p.id);
            return (
              <li key={p.id}>
                <Link className="row-link" href={`/properties/${p.id}`}>
                  <div>
                    <strong>{p.label}</strong>
                    <div className="small muted">
                      {p.anchored_at ? "Anchored" : "Waiting for the anchor visit"}
                      {last && `, last check-in ${new Date(last.server_time).toLocaleDateString("en-GB")}`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {p.postcode ? <PostcodePlate code={p.postcode} size="sm" /> : <span className="small muted">{p.anchor_mode === "coordinates" ? "Anchored by location" : "Postcode found on first visit"}</span>}
                    {last && <div style={{ marginTop: "0.4rem" }}><VerdictBadge verdict={last.verdict} matchType={last.match_type} /></div>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
