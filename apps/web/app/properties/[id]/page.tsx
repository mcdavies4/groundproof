import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { PostcodePlate } from "@/components/PostcodePlate";
import { VerdictBadge } from "@/components/VerdictBadge";
import { formatMoney, type Checkin, type Milestone, type Property } from "@/lib/types";
import { addMilestone, cancelRequest, createInvite, requestCheckin, setRequireVideo, createShareLink, inviteViewer, leaveProperty, removeViewer, revokeShareLink, setCurrency } from "./actions";
import Link from "next/link";
import { ShareLink } from "@/components/ShareLink";
import { CurrencySelect } from "@/components/CurrencySelect";
import { PlanPanel } from "@/components/PlanPanel";
import { ProgressView, type ProgressShot } from "@/components/ProgressView";
import { PlotDetail } from "@/components/PlotDetail";
import { VISIT_TYPES, matchedVisitsFree, naira, type VisitType } from "@/lib/rates";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { payment?: string; viewer?: string; request?: string };
}) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");

  const { data: property } = await supabase.from("properties").select("*").eq("id", params.id).single<Property>();
  if (!property) notFound();
  const isOwner = (property as Property & { owner_id: string }).owner_id === user.id;
  const estateId = (property as Property & { estate_id?: string | null }).estate_id ?? null;
  const { data: estate } = estateId
    ? await supabase.from("estates").select("id, name").eq("id", estateId).maybeSingle()
    : { data: null };

  const [{ data: milestones }, { data: checkins }, { data: invites }, { data: viewers }, { data: requests }, { count: reporterCount }] = await Promise.all([
    supabase.from("milestones").select("*").eq("property_id", property.id).order("sort"),
    supabase.from("checkins").select("*").eq("property_id", property.id).order("server_time", { ascending: false }).limit(50),
    isOwner
      ? supabase.from("invites").select("code, used_at, expires_at").eq("property_id", property.id).order("created_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] as { code: string; used_at: string | null; expires_at: string }[] }),
    isOwner
      ? supabase.from("viewer_invites").select("id, email, accepted_at").eq("property_id", property.id).order("created_at")
      : Promise.resolve({ data: [] as { id: string; email: string; accepted_at: string | null }[] }),
    supabase.from("checkin_requests").select("id, note, due_by, created_at, fulfilled_at, cancelled_at")
      .eq("property_id", property.id).order("created_at", { ascending: false }).limit(1),
    supabase.from("property_members").select("user_id", { count: "exact", head: true })
      .eq("property_id", property.id).eq("role", "reporter"),
  ]);
  const lastRequest = requests?.[0] as
    | { id: string; note: string | null; due_by: string | null; created_at: string; fulfilled_at: string | null; cancelled_at: string | null }
    | undefined;
  const openRequest = lastRequest && !lastRequest.fulfilled_at && !lastRequest.cancelled_at ? lastRequest : null;
  const requestMsg = searchParams.request;
  const today = new Date().toISOString().slice(0, 10);
  const viewerMsg = searchParams.viewer;

  // The anchor visit may be older than the 50 most recent check-ins.
  let anchorCheckin = (checkins as Checkin[] | null)?.find((c) => c.is_anchor && c.verdict === "verified") ?? null;
  if (!anchorCheckin && property.anchored_at) {
    const { data } = await supabase.from("checkins").select("*").eq("property_id", property.id)
      .eq("is_anchor", true).eq("verdict", "verified").order("server_time").limit(1).maybeSingle<Checkin>();
    anchorCheckin = data ?? null;
  }

  // Signed URLs for photos (private bucket), one batch call
  const paths = [...(checkins ?? []).flatMap((c: Checkin) => c.photo_paths), ...(anchorCheckin?.photo_paths.slice(0, 1) ?? [])];
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("checkins").createSignedUrls(paths, 60 * 60);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const videoPaths = ((checkins ?? []) as Checkin[]).map((c) => c.video_path).filter((p): p is string => !!p);
  const videoUrls = new Map<string, string>();
  if (videoPaths.length) {
    const { data: signed } = await supabase.storage.from("checkin-videos").createSignedUrls(videoPaths, 60 * 60);
    for (const s of signed ?? []) if (s.path && s.signedUrl) videoUrls.set(s.path, s.signedUrl);
  }

  const ms = (milestones ?? []) as Milestone[];
  const msName = new Map(ms.map((m) => [m.id, m.name]));

  // Progress: the front photo (photo 1) of the anchor and of each verified check-in.
  const shot = (c: Checkin): ProgressShot | null => {
    const url = urls.get(c.photo_paths[0]);
    if (!url) return null;
    const label = c.is_anchor ? "Anchor visit" : c.milestone_id ? msName.get(c.milestone_id) ?? "Stage" : "Routine check-in";
    return { id: c.id, url, date: c.taken_offline ? c.device_time : c.server_time, label };
  };
  const anchorShot = anchorCheckin ? shot(anchorCheckin) : null;
  const laterShots = ((checkins ?? []) as Checkin[])
    .filter((c) => !c.is_anchor && c.verdict === "verified")
    .map(shot).filter((x): x is ProgressShot => !!x);
  // Timeline: latest verified photo in each month, oldest first, anchor included.
  const byMonth = new Map<string, ProgressShot>();
  for (const x of [...laterShots, ...(anchorShot ? [anchorShot] : [])]) {
    const key = x.date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, x);
  }
  const timeline = [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
  const invite = invites?.[0];
  const inviteLive = invite && !invite.used_at && new Date(invite.expires_at) > new Date();
  const admin = property.nipost_address?.administrative;
  const isPlot = property.kind === "plot";
  const { data: activeMatches } = isOwner
    ? await supabase.from("matches").select("visit_type, price_ngn, frequency").eq("property_id", property.id).eq("status", "active")
    : { data: [] as { visit_type: VisitType; price_ngn: number; frequency: string }[] };
  const matchedFree = (activeMatches ?? []).length ? await matchedVisitsFree(supabase) : true;

  return (
    <main className="wrap page">
      <div className="page-head">
        <div>
          {estate && (
            <p className="small" style={{ margin: "0 0 0.3rem" }}>
              {isOwner ? <Link href={`/estates/${estate.id}`}>{estate.name}</Link> : estate.name}
            </p>
          )}
          <h1 style={{ marginBottom: "0.6rem" }}>{property.label}</h1>
          {isPlot ? (
            <p className="muted" style={{ margin: 0 }}>Plot to check before buying · {(property.beacons ?? []).length} beacons</p>
          ) : property.postcode ? (
            <PostcodePlate code={property.postcode} size="md" />
          ) : property.anchor_mode === "coordinates" ? (
            <p className="muted" style={{ margin: 0 }}>Anchored by location. NIPOST has no building listed here yet.</p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Postcode to be found on the first visit.</p>
          )}
        </div>
      </div>

      {!isOwner && (
        <div className="notice viewer-notice">
          <span>Shared with you. You can see every check-in and you&apos;ll get the email alerts. Only the owner can make changes.</span>
          <form action={leaveProperty.bind(null, property.id)}>
            <button type="submit" className="link-btn">Stop watching</button>
          </form>
        </div>
      )}

      {property.anchor_mode === "coordinates" && property.nipost_suggested_postcode && (
        <p className="notice">
          NIPOST now lists a building at this spot: <strong>{property.nipost_suggested_postcode}</strong>. If that&apos;s
          your property, email us and we&apos;ll switch it to full postcode checks.
        </p>
      )}

      {property.nipost_address?.mock && (
        <p className="notice">This property was checked against the NIPOST mock, not the live registry. Address details are test data.</p>
      )}

      <div className="two-col">
        {isPlot ? <PlotDetail supabase={supabase} property={property} /> : (
        <section aria-labelledby="log">
          {anchorShot && <ProgressView anchor={anchorShot} later={laterShots} timeline={timeline} />}

          <h2 id="log">Check-ins</h2>
          {openRequest && (
            <p className="notice">
              Visit requested on {new Date(openRequest.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              {openRequest.due_by && <>, needed by {new Date(openRequest.due_by + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</>}.
              {" "}Waiting for the person on the ground.
            </p>
          )}
          {!property.anchored_at && (
            <div className="empty" style={{ marginBottom: "1.5rem" }}>
              <h3>Waiting for the anchor visit</h3>
              <p>
                {property.postcode
                  ? "Share the invite code with your person on the ground. Their first visit, made from inside the app at the house, locks this property to its building."
                  : "Share the invite code with your person on the ground. At their first visit the app finds the NIPOST postcode for the building they're standing at, or, if it isn't registered yet, locks the property to that exact spot."}
              </p>
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
                    <VerdictBadge verdict={c.verdict} matchType={c.match_type} />
                  </div>
                  <div className="small muted">
                    {when(c.taken_offline ? c.device_time : c.server_time)}. {c.verdict_reason ?? "Waiting for NIPOST."}
                    {c.nipost_mock ? " (mock)" : ""}
                  </div>
                  {c.photo_note && (
                    <p className="photo-note">
                      <span className="small muted">What the photos show: </span>
                      {c.photo_note}
                    </p>
                  )}
                  {c.note && <p style={{ margin: "0.5rem 0 0" }}><span className="small muted">Note from your person: </span>{c.note}</p>}
                  <div className="checks small muted">
                    {c.photo_match === "match" && <span>Photos match the anchored building</span>}
                    {c.photo_match === "mismatch" && <span style={{ color: "var(--review)" }}>Photos don&apos;t look like the anchored building</span>}
                    {c.photo_match === "unsure" && <span>Photos too close-up to compare</span>}
                    {c.heading_ok === true && <span>Facing the right way</span>}
                    {c.heading_ok === false && <span style={{ color: "var(--review)" }}>Facing a different way from the anchor</span>}
                    {c.is_emulator && <span style={{ color: "var(--flagged)" }}>Emulator</span>}
                    {c.taken_offline && <span>Taken offline, uploaded later</span>}
                  </div>
                  {c.video_path && videoUrls.get(c.video_path) && (
                    <video className="walk-video" controls preload="none" playsInline src={videoUrls.get(c.video_path)}>
                      <a href={videoUrls.get(c.video_path)}>Download the walk-round video</a>
                    </video>
                  )}
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
        )}

        <aside>
          {!isPlot && <>
          <div className="panel">
            <h3>On record at NIPOST</h3>
            <dl className="facts">
              <dt>Address</dt><dd>{property.nipost_address?.recent_house_address ?? "Not available at your access level"}</dd>
              <dt>Area</dt><dd>{[admin?.locality_name, admin?.lga_name, admin?.state_name].filter(Boolean).join(", ") || "Not available"}</dd>
              <dt>Use</dt><dd>{property.nipost_building_use ?? "Not available"}</dd>
              <dt>Anchored</dt><dd>{property.anchored_at ? when(property.anchored_at) : "Not yet"}</dd>
            </dl>
          </div>

          <div className="panel">
            <h3>Report</h3>
            <p className="small muted">Every check-in, verdict and photo on one page. Download it as a PDF.</p>
            <Link className="btn secondary" href={`/properties/${property.id}/report`}>Open report</Link>
            {isOwner && (
              <div style={{ marginTop: "1rem" }}>
                {property.share_token ? (
                  <>
                    <p className="small" style={{ marginBottom: "0.4rem" }}>Anyone with this link can view the report, without signing in:</p>
                    <ShareLink url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://groundproof.site"}/r/${property.share_token}`} title={`${property.label}: Groundproof report`} />
                    <form action={revokeShareLink.bind(null, property.id)}>
                      <button type="submit" className="link-btn">Turn off this link</button>
                    </form>
                  </>
                ) : (
                  <form action={createShareLink.bind(null, property.id)}>
                    <p className="small muted" style={{ marginBottom: "0.4rem" }}>Share it with family or co-investors. You can turn the link off any time.</p>
                    <button type="submit" className="btn secondary">Create share link</button>
                  </form>
                )}
              </div>
            )}
          </div>

          </>}

          {isOwner && <PlanPanel property={property} error={searchParams.payment === "error"} />}

          {isOwner && (
            <div className="panel" id="people">
              <h3>Family and co-investors</h3>
              <p className="small muted">Add up to 5 people. They see every check-in and photo and get the same email alerts as you. They can&apos;t change anything.</p>
              {(viewers ?? []).length > 0 && (
                <ul className="viewers">
                  {(viewers ?? []).map((v) => (
                    <li key={v.id}>
                      <span>
                        {v.email}
                        <span className="small muted">{v.accepted_at ? " · watching" : " · invited"}</span>
                      </span>
                      <form action={removeViewer.bind(null, property.id, v.id)}>
                        <button type="submit" className="link-btn" aria-label={`Remove ${v.email}`}>Remove</button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              {viewerMsg === "sent" && <p className="small" role="status">Invite sent. They&apos;ll see this property once they sign in with that email.</p>}
              {viewerMsg === "saved" && <p className="small" role="status">Added. The email didn&apos;t go out, so tell them to sign in at groundproof.site with that address.</p>}
              {viewerMsg?.startsWith("error:") && <p className="small" role="alert" style={{ color: "var(--flagged)" }}>{viewerMsg.slice(6)}</p>}
              {(viewers ?? []).length < 5 && (
                <form action={inviteViewer.bind(null, property.id)}>
                  <div className="field">
                    <label htmlFor="viewer-email">Email address</label>
                    <input id="viewer-email" name="email" type="email" required maxLength={254} autoComplete="off" placeholder="sister@example.com" />
                  </div>
                  <button className="btn secondary" type="submit">Add person</button>
                </form>
              )}
            </div>
          )}

          {isOwner && (
            <div className="panel" id="ground">
              <h3>Person on the ground</h3>
              {(activeMatches ?? []).map((m, i) => (
                <p key={i} className="notice ok small" style={{ marginTop: 0 }}>
                  <strong>Matched by Groundproof.</strong> {VISIT_TYPES[m.visit_type as VisitType]?.name}, {naira(m.price_ngn)} per visit, all in.
                  {matchedFree ? "Groundproof's checks on these visits are free during the pilot." : "Each visit's check uses your plan or check-ins."} <Link href="/rates">Price rules</Link>
                </p>
              ))}
              {!isPlot && <form action={setRequireVideo.bind(null, property.id, !property.require_video)} className="video-toggle">
                <p className="small" style={{ margin: 0 }}>
                  {property.require_video
                    ? <><strong>Video on.</strong> Every check-in needs a 15-second walk-round video to be verified.</>
                    : <>Want more than photos? Ask for a 15-second walk-round video with every check-in.</>}
                </p>
                <button type="submit" className="link-btn">{property.require_video ? "Turn off" : "Ask for video"}</button>
              </form>}
              {!isPlot && (reporterCount ?? 0) > 0 && (
                <div className="request-box">
                  {openRequest ? (
                    <>
                      <p className="small" style={{ margin: 0 }}>
                        <strong>Visit requested.</strong> They&apos;ve been emailed, and the app reminds them until they check in.
                      </p>
                      {openRequest.note && <p className="small muted" style={{ margin: "0.4rem 0 0" }}>&ldquo;{openRequest.note}&rdquo;</p>}
                      <form action={cancelRequest.bind(null, property.id, openRequest.id)}>
                        <button type="submit" className="link-btn">Cancel request</button>
                      </form>
                    </>
                  ) : (
                    <form action={requestCheckin.bind(null, property.id)}>
                      <p className="small muted" style={{ marginTop: 0 }}>
                        Want eyes on it now? Ask for a visit. They get an email, and the app reminds them until it&apos;s done.
                        {lastRequest?.fulfilled_at && <> Last request answered {new Date(lastRequest.fulfilled_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.</>}
                      </p>
                      <div className="field">
                        <label htmlFor="req-note">What should they look at? (optional)</label>
                        <input id="req-note" name="note" type="text" maxLength={300} placeholder="Check the roof after the storm" />
                      </div>
                      <div className="field">
                        <label htmlFor="req-due">Needed by (optional)</label>
                        <input id="req-due" name="due_by" type="date" min={today} />
                      </div>
                      <button className="btn" type="submit">Request a check-in</button>
                    </form>
                  )}
                  {requestMsg === "sent" && <p className="small" role="status">Request sent.</p>}
                  {requestMsg === "saved" && <p className="small" role="status">Saved. The email didn&apos;t go out, but they&apos;ll see it in the app.</p>}
                  {requestMsg?.startsWith("error:") && <p className="small" role="alert" style={{ color: "var(--flagged)" }}>{requestMsg.slice(6)}</p>}
                </div>
              )}
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
                  {(reporterCount ?? 0) === 0 && (
                    <p className="small" style={{ marginTop: "0.75rem" }}>No one to send? <Link href="/find-someone">We&apos;ll find someone</Link>.</p>
                  )}
                </form>
              )}
            </div>
          )}

          {!isPlot && <div className="panel">
            <h3>Payment stages</h3>
            {ms.length === 0 && <p className="small muted">Add stages to tie each payment to a verified check-in.</p>}
            <ul className="milestones">
              {ms.map((m) => (
                <li key={m.id}>
                  <span>{m.name}{m.amount !== null && <span className="muted"> ({formatMoney(Number(m.amount), property.payment_currency ?? "NGN")})</span>}</span>
                  {m.completed_checkin_id ? <span className="verdict verified">Done</span> : <span className="small muted">Open</span>}
                </li>
              ))}
            </ul>
            {isOwner && <CurrencySelect action={setCurrency.bind(null, property.id)} value={property.payment_currency ?? "NGN"} />}
            {isOwner && (
              <form action={addMilestone.bind(null, property.id)}>
                <div className="field">
                  <label htmlFor="ms-name">Stage</label>
                  <input id="ms-name" name="name" type="text" required maxLength={80} placeholder="Roofing" />
                </div>
                <div className="field">
                  <label htmlFor="ms-amount">Payment amount (optional)</label>
                  <input id="ms-amount" name="amount" type="number" min="0" step="0.01" inputMode="decimal" />
                  <p className="hint">Only for your own reference. Groundproof never sends or holds money.</p>
                </div>
                <button className="btn secondary" type="submit">Add stage</button>
              </form>
            )}
          </div>}
        </aside>
      </div>
    </main>
  );
}
