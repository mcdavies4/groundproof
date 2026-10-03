import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { PostcodePlate } from "@/components/PostcodePlate";
import { VerdictBadge } from "@/components/VerdictBadge";
import type { Checkin, Milestone, Property } from "@/lib/types";
import { addMilestone, createInvite } from "./actions";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function PropertyPage({ params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");

  const { data: property } = await supabase.from("properties").select("*").eq("id", params.id).single<Property>();
  if (!property) notFound();
  const isOwner = (property as Property & { owner_id: string }).owner_id === user.id;

  const [{ data: milestones }, { data: checkins }, { data: invites }] = await Promise.all([
    supabase.from("milestones").select("*").eq("property_id", property.id).order("sort"),
    supabase.from("checkins").select("*").eq("property_id", property.id).order("server_time", { ascending: false }).limit(50),
    isOwner
      ? supabase.from("invites").select("code, used_at, expires_at").eq("property_id", property.id).order("created_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] as { code: string; used_at: string | null; expires_at: string }[] }),
  ]);

  // Signed URLs for photos (private bucket), one batch call
  const paths = (checkins ?? []).flatMap((c: Checkin) => c.photo_paths);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("checkins").createSignedUrls(paths, 60 * 60);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  const ms = (milestones ?? []) as Milestone[];
  const msName = new Map(ms.map((m) => [m.id, m.name]));
  const invite = invites?.[0];
  const inviteLive = invite && !invite.used_at && new Date(invite.expires_at) > new Date();
  const admin = property.nipost_address?.administrative;

  return (
    <main className="wrap page">
      <div className="page-head">
        <div>
          <h1 style={{ marginBottom: "0.6rem" }}>{property.label}</h1>
          <PostcodePlate code={property.postcode} size="md" />
        </div>
      </div>

      {property.nipost_address?.mock && (
        <p className="notice">This property was checked against the NIPOST mock, not the live registry. Address details are test data.</p>
      )}

      <div className="two-col">
        <section aria-labelledby="log">
          <h2 id="log">Check-ins</h2>
          {!property.anchored_at && (
            <div className="empty" style={{ marginBottom: "1.5rem" }}>
              <h3>Waiting for the anchor visit</h3>
              <p>Share the invite code with your person on the ground. Their first visit, made from inside the app at the house, locks this property to its building.</p>
            </div>
          )}
          {(checkins ?? []).length === 0 ? (
            <p className="muted">No check-ins yet.</p>
          ) : (
            <ol className="timeline">
              {(checkins as Checkin[]).map((c) => (
                <li key={c.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                    <strong>
                      {c.is_anchor ? "Anchor visit" : c.milestone_id ? msName.get(c.milestone_id) ?? "Milestone" : "Routine check-in"}
                    </strong>
                    <VerdictBadge verdict={c.verdict} />
                  </div>
                  <div className="small muted">
                    {when(c.server_time)}. {c.verdict_reason ?? "Waiting for NIPOST."}
                    {c.nipost_mock ? " (mock)" : ""}
                  </div>
                  {c.note && <p style={{ margin: "0.5rem 0 0" }}>{c.note}</p>}
                  <div className="photos">
                    {c.photo_paths.map((p) =>
                      urls.get(p) ? (
                        <a key={p} href={urls.get(p)} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={urls.get(p)} alt={`Photo from check-in on ${when(c.server_time)}`} />
                        </a>
                      ) : null,
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside>
          <div className="panel">
            <h3>On record at NIPOST</h3>
            <dl className="facts">
              <dt>Address</dt><dd>{property.nipost_address?.recent_house_address ?? "Not available at your access level"}</dd>
              <dt>Area</dt><dd>{[admin?.locality_name, admin?.lga_name, admin?.state_name].filter(Boolean).join(", ") || "Not available"}</dd>
              <dt>Use</dt><dd>{property.nipost_building_use ?? "Not available"}</dd>
              <dt>Anchored</dt><dd>{property.anchored_at ? when(property.anchored_at) : "Not yet"}</dd>
            </dl>
          </div>

          {isOwner && (
            <div className="panel">
              <h3>Person on the ground</h3>
              {inviteLive ? (
                <>
                  <p className="small muted" style={{ marginBottom: "0.4rem" }}>Invite code, valid until {new Date(invite.expires_at).toLocaleDateString("en-GB")}:</p>
                  <div className="code">{invite.code}</div>
                  <p className="small muted">They enter this in the Groundproof app after signing in.</p>
                </>
              ) : (
                <form action={createInvite.bind(null, property.id)}>
                  <p className="small muted">Create a one-time code for a relative, contractor or agent to join this property.</p>
                  <button className="btn secondary" type="submit">Create invite code</button>
                </form>
              )}
            </div>
          )}

          <div className="panel">
            <h3>Payment stages</h3>
            {ms.length === 0 && <p className="small muted">Add stages to tie each payment to a verified check-in.</p>}
            <ul className="milestones">
              {ms.map((m) => (
                <li key={m.id}>
                  <span>{m.name}{m.amount_gbp !== null && <span className="muted"> ({gbp.format(Number(m.amount_gbp))})</span>}</span>
                  {m.completed_checkin_id ? <span className="verdict verified">Done</span> : <span className="small muted">Open</span>}
                </li>
              ))}
            </ul>
            {isOwner && (
              <form action={addMilestone.bind(null, property.id)}>
                <div className="field">
                  <label htmlFor="ms-name">Stage</label>
                  <input id="ms-name" name="name" type="text" required maxLength={80} placeholder="Roofing" />
                </div>
                <div className="field">
                  <label htmlFor="ms-amount">Payment (£, optional)</label>
                  <input id="ms-amount" name="amount" type="number" min="0" step="0.01" />
                </div>
                <button className="btn secondary" type="submit">Add stage</button>
              </form>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
