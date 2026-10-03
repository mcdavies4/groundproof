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
  const latest = new Map<string, { verdict: Verdict; server_time: string }>();
  if (ids.length) {
    const { data: checkins } = await supabase
      .from("checkins")
      .select("property_id, verdict, server_time")
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
          <p>You&apos;ll need its NIPOST postcode. Whoever is at the house can find it on postcode.gov.ng by allowing location access.</p>
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
                    <PostcodePlate code={p.postcode} size="sm" />
                    {last && <div style={{ marginTop: "0.4rem" }}><VerdictBadge verdict={last.verdict} /></div>}
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
