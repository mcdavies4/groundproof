// POST {} -> pilot dashboard data. Only for emails listed in the ADMIN_EMAILS secret (comma-separated).
// Uses the service role, so it sees every property; never expose this to non-admins.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { esc } from "../_shared/email.ts";
import { allUsers, nudgeEmail, pilotPeople, STAGES } from "../_shared/pilot.ts";
import { reporterNudgeEmail, reporterPeople } from "../_shared/reporters.ts";

const DAY = 24 * 60 * 60 * 1000;
const PLAY = "https://play.google.com/store/apps/details?id=ng.the36th.groundproof";

type Db = ReturnType<typeof adminClient>;

async function userIdByEmail(db: Db, email: string): Promise<string | null> {
  const want = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    const hit = data?.users.find((u) => u.email?.toLowerCase() === want);
    if (hit) return hit.id;
    if (!data || data.users.length < 1000) break;
  }
  return null;
}

async function sendMail(to: string, subject: string, inner: string, replyTo?: string) {
  const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("ALERT_FROM");
  if (!key || !from) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [to], subject, ...(replyTo ? { reply_to: replyTo } : {}),
      html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;max-width:540px;margin:0 auto;padding:24px;font-size:16px;line-height:1.5"><p style="margin:0 0 6px;font-size:14px;color:#3d5149">Groundproof</p>${inner}</div>`,
    }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

/** Put a matched reporter on a property: an invite code, emailed straight to them. */
async function inviteReporter(db: Db, propertyId: string, reporterId: string) {
  const { data: already } = await db.from("property_members").select("role").eq("property_id", propertyId).eq("user_id", reporterId).maybeSingle();
  if (already) return "already";
  const { data: prop } = await db.from("properties").select("label, owner_id, kind").eq("id", propertyId).maybeSingle();
  if (!prop) return "missing";
  const { data: inv } = await db.from("invites").insert({ property_id: propertyId, created_by: prop.owner_id }).select("code, expires_at").single();
  const { data: ru } = await db.auth.admin.getUserById(reporterId);
  if (!inv || !ru.user?.email) return "failed";
  const what = prop.kind === "plot" ? "walk the beacons of" : "check in at";
  await sendMail(ru.user.email, `Your invite code for ${prop.label}`, `<h1 style="margin:0 0 14px;font-size:22px">You're on ${esc(prop.label)}</h1>
<p style="margin:0 0 14px">Open the Groundproof app, sign in with this email address, and enter this code under <b>Join a property</b>:</p>
<p style="margin:0 0 18px;font-size:30px;font-weight:bold;letter-spacing:4px;background:#f4c531;display:inline-block;padding:10px 18px;border:3px solid #10251f;border-radius:6px">${esc(inv.code)}</p>
<p style="margin:0 0 14px">Then go to the property and ${what} it from the app. Your first visit there sets it up.</p>
<p style="margin:0"><a href="${PLAY}">Get the Groundproof app</a> (Android). The code works until ${new Date(inv.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.</p>`);
  return "sent";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const user = await getCaller(req);
  const admins = (Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!user?.email || !admins.includes(user.email.toLowerCase())) return json({ error: "Not found" }, 404);

  const db = adminClient();

  // Actions from the dashboard.
  const body = await req.json().catch(() => ({})) as Record<string, unknown> & { action?: string; user_id?: string };
  const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("ALERT_FROM");
  const SITE = Deno.env.get("SITE_URL") ?? "https://groundproof.site";
  const VISIT: Record<string, string> = { standard: "Standard visit", distance: "Distance visit", first: "First visit or plot visit" };
  const FREQ: Record<string, string> = { once: "one visit", monthly: "monthly", fortnightly: "every 2 weeks", weekly: "weekly" };
  const ngn = (n: number) => "₦" + n.toLocaleString("en-GB");

  if (body.action === "set_setting" && body.key === "matched_visits_free") {
    await db.from("app_settings").upsert({ key: "matched_visits_free", value: body.value === true, updated_at: new Date().toISOString() });
    return json({ ok: true });
  }
  if (body.action === "set_setting" && body.key === "estate_unit_price_ngn") {
    const n = Math.round(Number(body.value));
    if (!(n >= 100 && n <= 1_000_000)) return json({ error: "Enter a price per unit per month in naira." }, 400);
    await db.from("app_settings").upsert({ key: "estate_unit_price_ngn", value: n, updated_at: new Date().toISOString() });
    return json({ ok: true });
  }
  const { data: freeRow } = await db.from("app_settings").select("value").eq("key", "matched_visits_free").maybeSingle();
  const matchedFree = freeRow ? freeRow.value === true : true;

  if (body.action === "nudge_user" && body.user_id) {
    const users = await allUsers(db);
    const u = users.find((x) => x.id === body.user_id);
    const person = u ? (await pilotPeople(db, [u]))[0] : null;
    if (!person) return json({ error: "That person isn't a pilot owner." }, 404);
    const mail = nudgeEmail(person, SITE);
    if (!mail) return json({ error: "They've already had a verified visit." }, 400);
    const admins = (Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!key || !from) return json({ error: "Email isn't set up (RESEND_API_KEY / ALERT_FROM)." }, 500);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [person.email], reply_to: admins[0], subject: mail.subject, html: mail.html }),
    }).catch(() => null);
    if (!res?.ok) return json({ error: "The email didn't send. Try again." }, 502);
    await db.from("pilot_nudges").upsert({ user_id: person.id, stage: person.stage, sent_at: new Date().toISOString(), auto: false });
    return json({ ok: true, stage: person.stage });
  }
  if (body.action === "nudge_reporter" && body.email) {
    const users = await allUsers(db);
    const person = (await reporterPeople(db, users)).find((r) => r.email.toLowerCase() === String(body.email).toLowerCase());
    if (!person) return json({ error: "That isn't an approved reporter." }, 404);
    const mail = reporterNudgeEmail(person, SITE);
    if (!mail) return json({ error: person.stage === "active" ? "They've already done a visit." : "They're ready and waiting for an introduction, so there's nothing to nudge." }, 400);
    const admins = (Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!key || !from) return json({ error: "Email isn't set up (RESEND_API_KEY / ALERT_FROM)." }, 500);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [person.email], reply_to: admins[0], subject: mail.subject, html: mail.html }),
    }).catch(() => null);
    if (!res?.ok) return json({ error: "The email didn't send. Try again." }, 502);
    await db.from("reporter_nudges").upsert({ email: person.email.toLowerCase(), stage: person.stage, sent_at: new Date().toISOString(), auto: false });
    return json({ ok: true, stage: person.stage });
  }
  if (body.action === "set_band") {
    const state = String(body.state ?? "").trim(), visitType = String(body.visit_type ?? "");
    const min = Math.round(Number(body.min_ngn)), max = Math.round(Number(body.max_ngn));
    if (!state || !VISIT[visitType] || !(min > 0) || !(max >= min)) return json({ error: "Check the state, visit type and prices." }, 400);
    const { error } = await db.from("rate_bands").upsert({ state, visit_type: visitType, min_ngn: min, max_ngn: max, updated_at: new Date().toISOString() });
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }
  if (body.action === "delete_band") {
    await db.from("rate_bands").delete().eq("state", String(body.state ?? "")).eq("visit_type", String(body.visit_type ?? ""));
    return json({ ok: true });
  }
  if (body.action === "suspend_reporter" && body.user_id) {
    await db.from("reporter_profiles").update({ suspended: body.suspended === true }).eq("user_id", body.user_id);
    return json({ ok: true });
  }
  if (body.action === "link_match_property" && body.match_id && body.property_id) {
    const { data: m } = await db.from("matches").select("owner_email, reporter_id").eq("id", String(body.match_id)).maybeSingle();
    const { data: prop } = await db.from("properties").select("label, owner_id").eq("id", String(body.property_id)).maybeSingle();
    const { data: ou } = prop ? await db.auth.admin.getUserById(prop.owner_id) : { data: { user: null } };
    if (!m || !prop || ou.user?.email?.toLowerCase() !== m.owner_email) return json({ error: "That property doesn't belong to this owner." }, 400);
    await db.from("matches").update({ property_id: String(body.property_id) }).eq("id", String(body.match_id));
    const invited = await inviteReporter(db, String(body.property_id), m.reporter_id);
    return json({ ok: true, invited });
  }
  if (body.action === "review_application" && body.id && (body.decision === "approved" || body.decision === "declined")) {
    const { data: app } = await db.from("reporter_applications").update({ status: body.decision, ...(body.decision === "approved" ? { approved_at: new Date().toISOString() } : {}) }).eq("id", String(body.id)).select("name, email, state").maybeSingle();
    if (!app) return json({ error: "Application not found." }, 404);
    if (body.decision === "approved") {
      await sendMail(app.email, "You're approved as a Groundproof reporter", `<h1 style="margin:0 0 14px;font-size:22px">Welcome, ${esc(app.name.split(" ")[0])}</h1>
<p style="margin:0 0 14px">You're approved to do Groundproof visits in ${esc(app.state)}. Three quick steps:</p>
<ol style="margin:0 0 18px;padding-left:20px">
<li style="margin-bottom:8px"><a href="${PLAY}">Install the Groundproof app</a> (Android) and sign in with this email address.</li>
<li style="margin-bottom:8px">On a computer or phone browser, go to <a href="${SITE}/account">${SITE}/account</a>, sign in with the same email, and set up your reporter profile. We've filled in what you told us.</li>
<li>Agree to the reporter rules and set your prices per visit.</li></ol>
<p style="margin:0">When an owner near you needs someone, we'll introduce you, and your invite code arrives by email.</p>`);
    } else {
      await sendMail(app.email, "Your Groundproof application", `<p style="margin:0 0 14px">Hi ${esc(app.name.split(" ")[0])}, thank you for applying to be a Groundproof reporter. We're not taking on more reporters in your area right now. We'll keep your details and get in touch if that changes.</p>`);
    }
    return json({ ok: true });
  }
  if (body.action === "close_request" && body.id) {
    await db.from("ground_requests").update({ status: "closed" }).eq("id", String(body.id));
    return json({ ok: true });
  }
  if (body.action === "end_match" && body.match_id) {
    await db.from("matches").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", String(body.match_id));
    return json({ ok: true });
  }
  if (body.action === "create_match") {
    const ownerName = String(body.owner_name ?? "").trim().slice(0, 100);
    const ownerEmail = String(body.owner_email ?? "").trim().toLowerCase();
    const reporterId = String(body.reporter_id ?? "");
    const visitType = String(body.visit_type ?? ""), frequency = String(body.frequency ?? "");
    const price = Math.round(Number(body.price_ngn));
    const propertyId = String(body.property_id ?? "").trim() || null;
    const requestId = String(body.request_id ?? "").trim() || null;
    const notes = String(body.notes ?? "").trim().slice(0, 500) || null;
    if (!ownerName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail) || !reporterId || !VISIT[visitType] || !FREQ[frequency] || !(price > 0)) {
      return json({ error: "Fill in the owner, reporter, visit type, how often and the price." }, 400);
    }
    // A buyer's independent check on an estate unit: the unit comes from the request, and the buyer must be watching it.
    const { data: req0 } = requestId ? await db.from("ground_requests").select("kind, property_id").eq("id", requestId).maybeSingle() : { data: null };
    const independent = req0?.kind === "independent" && Boolean(req0.property_id);
    let buyerId: string | null = null;
    if (independent) {
      buyerId = await userIdByEmail(db, ownerEmail);
      const { data: watching } = buyerId
        ? await db.from("property_members").select("role").eq("property_id", req0!.property_id).eq("user_id", buyerId).maybeSingle()
        : { data: null };
      if (watching?.role !== "viewer") return json({ error: "That buyer isn't watching the unit any more." }, 400);
    }
    const { data: prof } = await db.from("reporter_profiles").select("display_name, state, suspended").eq("user_id", reporterId).maybeSingle();
    if (!prof) return json({ error: "That reporter hasn't made a profile yet." }, 400);
    if (prof.suspended) return json({ error: "That reporter is suspended." }, 400);
    const { data: band } = await db.from("rate_bands").select("min_ngn, max_ngn").eq("state", prof.state).eq("visit_type", visitType).maybeSingle();
    if (band && (price < band.min_ngn || price > band.max_ngn)) {
      return json({ error: `In ${prof.state} a ${VISIT[visitType].toLowerCase()} is ${ngn(band.min_ngn)} to ${ngn(band.max_ngn)}.` }, 400);
    }
    let propertyLabel: string | null = null;
    let linkedId = independent ? req0!.property_id as string : propertyId;
    if (independent) {
      const { data: unit } = await db.from("properties").select("label").eq("id", linkedId).maybeSingle();
      propertyLabel = unit?.label ?? null;
    } else if (!linkedId) {
      // Owner already has exactly one property? Link it, so there's nothing for them to do.
      const ownerId = await userIdByEmail(db, ownerEmail);
      if (ownerId) {
        const { data: own } = await db.from("properties").select("id, label").eq("owner_id", ownerId).is("estate_id", null);
        if (own?.length === 1) { linkedId = own[0].id; propertyLabel = own[0].label; }
      }
    }
    if (propertyId && !independent) {
      const { data: prop } = await db.from("properties").select("label, owner_id").eq("id", propertyId).maybeSingle();
      const { data: ou } = prop ? await db.auth.admin.getUserById(prop.owner_id) : { data: { user: null } };
      if (!prop || ou.user?.email?.toLowerCase() !== ownerEmail) return json({ error: "That property doesn't belong to that owner's email." }, 400);
      propertyLabel = prop.label;
    }
    const { data: m, error } = await db.from("matches").insert({
      request_id: requestId, owner_name: ownerName, owner_email: ownerEmail, reporter_id: reporterId,
      property_id: linkedId, visit_type: visitType, price_ngn: price, frequency, notes,
      kind: independent ? "independent" : "owner", buyer_id: buyerId,
    }).select("id").single();
    if (error || !m) return json({ error: error?.message ?? "Couldn't save the match." }, 500);
    if (requestId) await db.from("ground_requests").update({ status: "matched" }).eq("id", requestId);
    const invited = linkedId ? await inviteReporter(db, linkedId, reporterId) : null;

    // The written agreement, to both sides.
    const { data: ru } = await db.auth.admin.getUserById(reporterId);
    const reporterEmail = ru.user?.email ?? null;
    const terms = [
      ["Visit", VISIT[visitType]],
      ["Price", `${ngn(price)} per visit, all in`],
      ["How often", FREQ[frequency]],
      ...(propertyLabel ? [["Property", propertyLabel]] : []),
      ...(notes ? [["Notes", notes]] : []),
    ] as [string, string][];
    const rows = terms.map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:#3d5149;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-weight:bold">${esc(v)}</td></tr>`).join("");
    const admins = (Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const rules = `<ul style="margin:0 0 18px;padding-left:20px;font-size:15px;line-height:1.6">
<li>The price above is the full price. No extra charges (transport, data, "logistics") unless the owner agrees in writing first.</li>
<li>Every visit is done in the Groundproof app at the property, so it can be verified.</li>
${independent
  ? `<li>This is an independent check on the buyer's unit. The reporter works for the buyer, not the developer, and reports only what they see.</li>${matchedFree ? "<li>During the pilot, Groundproof's checks are free on these visits. The buyer pays the reporter only.</li>" : "<li>The buyer's independent checks on Groundproof cover the verification of each visit. The reporter's price above is separate.</li>"}`
  : matchedFree ? "<li>During the pilot, Groundproof's checks are free on these visits. The owner pays the reporter only.</li>" : "<li>The owner's Groundproof plan or check-ins cover the verification of each visit. The reporter's price above is separate.</li>"}
<li>For 12 months from this introduction, all visits between you are arranged and done through Groundproof, not around it. That keeps every visit verified, and keeps the reporter's record growing.</li>
<li>Any problem, just reply to this email.</li></ul>`;
    const mail = (to: string, intro: string) => key && from ? fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [to], reply_to: admins[0], subject: "Your Groundproof visit agreement",
        html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;max-width:540px;margin:0 auto;padding:24px;font-size:16px;line-height:1.5">
<p style="margin:0 0 6px;font-size:14px;color:#3d5149">Groundproof</p><h1 style="margin:0 0 14px;font-size:22px">Your visit agreement</h1>
<p style="margin:0 0 14px">${intro}</p><table style="border-collapse:collapse;margin:0 0 18px">${rows}</table>${rules}
<p style="margin:0;font-size:13px;color:#3d5149">Rate card: <a href="${SITE}/rates">${SITE}/rates</a></p></div>`,
      }),
    }).catch((e) => console.error(e)) : Promise.resolve();
    await Promise.all([
      mail(ownerEmail, `${esc(ownerName)}, we've matched you with <b>${esc(prof.display_name)}</b>, a Groundproof reporter in ${esc(prof.state)}. Here's what you've agreed. ${invited === "sent" || invited === "already"
        ? `We've given ${esc(prof.display_name.split(" ")[0])} access to ${esc(propertyLabel ?? "your property")}, so there's nothing else for you to do. You'll get an email after each visit.`
        : `Next: <a href="${SITE}/properties/new">add your property on Groundproof</a> (sign in with this email). We'll link it and send ${esc(prof.display_name.split(" ")[0])} the invite code.`}`),
      reporterEmail ? mail(reporterEmail, `You've been matched with <b>${esc(ownerName)}</b>. Here's what you've agreed. ${invited === "sent" ? "Your invite code is in a separate email." : invited === "already" ? "You're already on the property: check in from the app." : "We'll email you the invite code as soon as the property is set up."}`) : Promise.resolve(),
    ]);
    // Tell the developer: the reporter will need access to the site.
    if (independent && linkedId) {
      const { data: unit } = await db.from("properties").select("owner_id, label, estates(name)").eq("id", linkedId).maybeSingle();
      const { data: dev } = unit ? await db.auth.admin.getUserById(unit.owner_id) : { data: { user: null } };
      const estateName = (unit as { estates?: { name: string } | null } | null)?.estates?.name ?? "your estate";
      if (dev.user?.email) {
        await sendMail(dev.user.email, `Independent check on ${unit!.label}`, `<h1 style="margin:0 0 14px;font-size:22px">An independent reporter is joining ${esc(unit!.label)}</h1>
<p style="margin:0 0 14px">The buyer of <b>${esc(unit!.label)}</b> at ${esc(estateName)} has asked Groundproof for independent checks on their unit. <b>${esc(prof.display_name)}</b> will visit ${esc(FREQ[frequency])}, using the Groundproof app like your own site reporter.</p>
<p style="margin:0 0 14px">Please let them onto the site when they arrive. Their visits appear on the unit alongside yours, and they don't use your estate plan: the buyer covers them.</p>
<p style="margin:0">Questions? Reply to this email.</p>`, admins[0]);
      }
    }
    return json({ ok: true, id: m.id, linked: Boolean(linkedId), invited });
  }
  if (body.action === "approve_developer" && body.user_id) {
    const { data: dev } = await db.from("developers").update({ approved: true }).eq("user_id", body.user_id).select("company").maybeSingle();
    const { data: u } = await db.auth.admin.getUserById(body.user_id);
    const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("ALERT_FROM"), site = Deno.env.get("SITE_URL") ?? "https://groundproof.site";
    if (dev && u.user?.email && key && from) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from, to: [u.user.email], subject: "Your Groundproof developer account is ready",
          html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;max-width:520px;margin:0 auto;padding:24px;font-size:16px;line-height:1.5"><h1 style="font-size:22px;margin:0 0 12px">You're approved</h1><p>You can now create estates, add units, give one code to your site reporter, and invite buyers to watch their own unit.</p><p><a href="${site}/estates" style="background:#10251f;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:4px;display:inline-block">Create your first estate</a></p></div>`,
        }),
      }).catch((e) => console.error(e));
    }
    return json({ ok: Boolean(dev) });
  }

  const since7 = new Date(Date.now() - 7 * DAY).toISOString();
  const since1 = new Date(Date.now() - DAY).toISOString();

  // Pilot scale: a few hundred rows at most, so plain selects are fine.
  const [{ data: props }, { data: checkins }, { data: members }, { data: payments }, { data: waitlist }] = await Promise.all([
    db.from("properties").select("id, owner_id, label, postcode, anchor_mode, anchored_at, check_credits, plan, plan_expires_at, created_at, share_token, estate_id").order("created_at", { ascending: false }),
    db.from("checkins").select("id, property_id, reporter_id, is_anchor, verdict, verdict_reason, match_type, is_emulator, is_mocked, photo_match, server_time, paid_by").order("server_time", { ascending: false }).limit(2000),
    db.from("property_members").select("property_id, user_id, role"),
    db.from("payments").select("id, property_id, user_id, product, amount_ngn, status, created_at, paid_at").order("created_at", { ascending: false }).limit(500),
    db.from("waitlist").select("email, plan, created_at").order("created_at", { ascending: false }).limit(500),
  ]);
  const [{ data: groundRequests }, { data: reporterApps }, { data: profiles }, { data: developers }, { data: estates }, { data: bands }, { data: matches }, { data: rates }] = await Promise.all([
    db.from("ground_requests").select("id, name, email, phone, state, area, property_type, frequency, notes, status, created_at, kind, property_id").order("created_at", { ascending: false }).limit(100),
    db.from("reporter_applications").select("id, name, email, phone, state, areas, occupation, android, notes, status, created_at").order("created_at", { ascending: false }).limit(100),
    db.from("reporter_profiles").select("user_id, slug, display_name, state, areas, is_public, suspended, agreed_rules_at"),
    db.from("developers").select("user_id, company, website, phone, approved, created_at").order("created_at", { ascending: false }),
    db.from("estates").select("id, developer_id"),
    db.from("rate_bands").select("state, visit_type, min_ngn, max_ngn").order("state"),
    db.from("matches").select("id, owner_name, owner_email, reporter_id, property_id, visit_type, price_ngn, frequency, status, created_at").order("created_at", { ascending: false }).limit(100),
    db.from("reporter_rates").select("user_id, visit_type, price_ngn"),
  ]);
  const [{ data: referralRows }, { data: feedbackRows }] = await Promise.all([
    db.from("referrals").select("referred_id, referrer_id, created_at, rewarded_at, referrer_capped").order("created_at", { ascending: false }).limit(300),
    db.from("feedback").select("user_id, created_at, score, useful, improve, quote_ok, quote_name, answered_at").order("created_at", { ascending: false }).limit(300),
  ]);
  const { data: staleReqs } = await db.from("checkin_requests").select("property_id, created_at")
    .is("fulfilled_at", null).is("cancelled_at", null).lt("created_at", new Date(Date.now() - 3 * DAY).toISOString());

  // Emails for owners and reporters
  const users = await allUsers(db);
  const emails = new Map<string, string>();
  for (const u of users) if (u.email) emails.set(u.id, u.email);
  const pilot = await pilotPeople(db, users);
  const reporterFunnel = await reporterPeople(db, users);

  const P = props ?? [], C = checkins ?? [], M = members ?? [], Pay = payments ?? [], W = waitlist ?? [];
  const byProp = new Map<string, typeof C>();
  for (const c of C) { if (!byProp.has(c.property_id)) byProp.set(c.property_id, []); byProp.get(c.property_id)!.push(c); }
  const propLabel = new Map(P.map((p) => [p.id, p.label]));
  const reporters = new Set(M.filter((m) => m.role === "reporter").map((m) => m.user_id));
  const owners = new Set(P.map((p) => p.owner_id));
  const paid = Pay.filter((p) => p.status === "successful");
  const nonPending = C.filter((c) => c.verdict !== "pending");

  const verdicts = { verified: 0, review: 0, flagged: 0, pending: 0 } as Record<string, number>;
  for (const c of C) verdicts[c.verdict] = (verdicts[c.verdict] ?? 0) + 1;

  return json({
    generatedAt: new Date().toISOString(),
    totals: {
      waitlist: W.length,
      owners: owners.size,
      reporters: reporters.size,
      viewers: new Set(M.filter((m) => m.role === "viewer").map((m) => m.user_id)).size,
      properties: P.length,
      anchored: P.filter((p) => p.anchored_at).length,
      checkins: nonPending.length,
      checkins7d: nonPending.filter((c) => c.server_time >= since7).length,
      paidCount: paid.length,
      paidNgn: paid.reduce((t, p) => t + p.amount_ngn, 0),
      shareLinks: P.filter((p) => p.share_token).length,
    },
    // Reporters ranked by record: most verified visits, then fewest flags. Pending check-ins don't count.
    reporters: [...reporters].map((uid) => {
      const mine = nonPending.filter((c) => c.reporter_id === uid);
      const prof = (profiles ?? []).find((p) => p.user_id === uid);
      return {
        id: uid,
        suspended: prof?.suspended ?? false,
        hasProfile: Boolean(prof),
        agreedRules: Boolean(prof?.agreed_rules_at),
        rates: Object.fromEntries((rates ?? []).filter((r) => r.user_id === uid).map((r) => [r.visit_type, r.price_ngn])),
        email: emails.get(uid) ?? "(deleted)",
        name: prof?.display_name ?? null, slug: prof?.is_public ? prof.slug : null,
        where: prof ? `${prof.areas}, ${prof.state}` : null,
        state: prof?.state ?? null,
        visits: mine.length,
        verified: mine.filter((c) => c.verdict === "verified").length,
        flagged: mine.filter((c) => c.verdict === "flagged").length,
        properties: M.filter((m) => m.user_id === uid && m.role === "reporter").length,
        last: mine[0]?.server_time ?? null,
      };
    }).sort((a, b) => b.verified - a.verified || a.flagged - b.flagged || b.visits - a.visits),
    developers: (developers ?? []).map((d) => ({
      ...d,
      email: emails.get(d.user_id) ?? "(deleted)",
      estates: (estates ?? []).filter((e) => e.developer_id === d.user_id).length,
      units: P.filter((p) => p.owner_id === d.user_id && (p as { estate_id?: string | null }).estate_id).length,
    })),
    settings: { matchedVisitsFree: matchedFree, estateUnitPrice: Number((await db.rpc("estate_unit_price")).data ?? 2000) },
    referrals: (referralRows ?? []).map((r) => ({
      referrer: emails.get(r.referrer_id) ?? "(deleted)", friend: emails.get(r.referred_id) ?? "(deleted)",
      joined: r.created_at, rewarded: r.rewarded_at, capped: r.referrer_capped,
    })),
    feedback: (feedbackRows ?? []).map((f) => ({ ...f, user_id: undefined, email: emails.get(f.user_id) ?? "(deleted)" })),
    pilot: {
      people: pilot.slice(0, 300),
      // Sign-ups by where they came from, and how far each source's people got.
      sources: Object.values(pilot.reduce((acc, p) => {
        const r = (acc[p.source] ??= { source: p.source, signedUp: 0, added: 0, verified: 0, last7: 0 });
        r.signedUp++;
        if (STAGES.indexOf(p.stage) >= 1) r.added++;
        if (p.stage === "verified") r.verified++;
        if (p.signedUp >= since7) r.last7++;
        return acc;
      }, {} as Record<string, { source: string; signedUp: number; added: number; verified: number; last7: number }>)).sort((a, b) => b.signedUp - a.signedUp),
    },
    reporterFunnel,
    bands: bands ?? [],
    // Each owner's own properties (not estate units), for linking matches.
    ownerProperties: (() => {
      const wanted = new Set([...(matches ?? []).map((m) => m.owner_email), ...(groundRequests ?? []).map((g) => g.email.toLowerCase())]);
      const out: Record<string, { id: string; label: string }[]> = {};
      for (const p of P) {
        const e = emails.get(p.owner_id)?.toLowerCase();
        if (!e || !wanted.has(e) || (p as { estate_id?: string | null }).estate_id) continue;
        (out[e] ??= []).push({ id: p.id, label: p.label });
      }
      return out;
    })(),
    staleRequests: (staleReqs ?? []).map((r) => ({ property: P.find((p) => p.id === r.property_id)?.label ?? "?", propertyId: r.property_id, since: r.created_at })),
    matches: (matches ?? []).map((m) => ({
      ...m,
      reporter: (profiles ?? []).find((p) => p.user_id === m.reporter_id)?.display_name ?? emails.get(m.reporter_id) ?? "(deleted)",
      property: m.property_id ? P.find((p) => p.id === m.property_id)?.label ?? null : null,
    })),
    groundRequests: groundRequests ?? [],
    reporterApplications: reporterApps ?? [],
    funnel: [
      { step: "Signed up", count: pilot.length },
      { step: "Added a property", count: owners.size },
      { step: "Invited a reporter", count: new Set(M.filter((m) => m.role === "reporter").map((m) => P.find((p) => p.id === m.property_id)?.owner_id)).size },
      { step: "Property anchored", count: new Set(P.filter((p) => p.anchored_at).map((p) => p.owner_id)).size },
      { step: "Had a check-in after anchoring", count: new Set(P.filter((p) => (byProp.get(p.id) ?? []).some((c) => !c.is_anchor && c.verdict !== "pending")).map((p) => p.owner_id)).size },
      { step: "Paid", count: new Set(paid.map((p) => p.user_id)).size },
    ],
    verdicts,
    nipost: {
      // Estimates: one reverse geocode per check-in, up to three lookups per property added.
      reverse24h: C.filter((c) => c.server_time >= since1).length,
      reverse7d: C.filter((c) => c.server_time >= since7).length,
      lookups7d: P.filter((p) => p.created_at >= since7).length * 3,
    },
    properties: P.map((p) => {
      const cs = byProp.get(p.id) ?? [];
      const last = cs[0];
      return {
        id: p.id, label: p.label, owner: emails.get(p.owner_id) ?? "(deleted)",
        postcode: p.postcode, anchorMode: p.anchor_mode, anchoredAt: p.anchored_at, createdAt: p.created_at,
        checkins: cs.filter((c) => c.verdict !== "pending").length,
        flagged: cs.filter((c) => c.verdict === "flagged").length,
        lastCheckin: last?.server_time ?? null, lastVerdict: last?.verdict ?? null,
        credits: p.check_credits, plan: p.plan, planExpires: p.plan_expires_at,
        reporters: M.filter((m) => m.property_id === p.id && m.role === "reporter").map((m) => emails.get(m.user_id) ?? "(deleted)"),
      };
    }),
    recentCheckins: C.slice(0, 40).map((c) => ({
      id: c.id, time: c.server_time, property: propLabel.get(c.property_id) ?? "(deleted)", propertyId: c.property_id,
      reporter: c.reporter_id ? emails.get(c.reporter_id) ?? "(deleted)" : "(deleted)",
      isAnchor: c.is_anchor, verdict: c.verdict, reason: c.verdict_reason, matchType: c.match_type,
      emulator: c.is_emulator, mocked: c.is_mocked, photoMatch: c.photo_match, paidBy: c.paid_by,
    })),
    payments: Pay.slice(0, 30).map((p) => ({
      time: p.paid_at ?? p.created_at, property: propLabel.get(p.property_id) ?? "(deleted)", who: p.user_id ? emails.get(p.user_id) ?? "(deleted)" : "(deleted)",
      product: p.product, amount: p.amount_ngn, status: p.status,
    })),
    waitlist: W.slice(0, 30),
  });
});
