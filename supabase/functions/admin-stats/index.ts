// POST {} -> pilot dashboard data. Only for emails listed in the ADMIN_EMAILS secret (comma-separated).
// Uses the service role, so it sees every property; never expose this to non-admins.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { esc } from "../_shared/email.ts";

const DAY = 24 * 60 * 60 * 1000;

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
    const { data: prof } = await db.from("reporter_profiles").select("display_name, state, suspended").eq("user_id", reporterId).maybeSingle();
    if (!prof) return json({ error: "That reporter hasn't made a profile yet." }, 400);
    if (prof.suspended) return json({ error: "That reporter is suspended." }, 400);
    const { data: band } = await db.from("rate_bands").select("min_ngn, max_ngn").eq("state", prof.state).eq("visit_type", visitType).maybeSingle();
    if (band && (price < band.min_ngn || price > band.max_ngn)) {
      return json({ error: `In ${prof.state} a ${VISIT[visitType].toLowerCase()} is ${ngn(band.min_ngn)} to ${ngn(band.max_ngn)}.` }, 400);
    }
    let propertyLabel: string | null = null;
    if (propertyId) {
      const { data: prop } = await db.from("properties").select("label, owner_id").eq("id", propertyId).maybeSingle();
      const { data: ou } = prop ? await db.auth.admin.getUserById(prop.owner_id) : { data: { user: null } };
      if (!prop || ou.user?.email?.toLowerCase() !== ownerEmail) return json({ error: "That property doesn't belong to that owner's email." }, 400);
      propertyLabel = prop.label;
    }
    const { data: m, error } = await db.from("matches").insert({
      request_id: requestId, owner_name: ownerName, owner_email: ownerEmail, reporter_id: reporterId,
      property_id: propertyId, visit_type: visitType, price_ngn: price, frequency, notes,
    }).select("id").single();
    if (error || !m) return json({ error: error?.message ?? "Couldn't save the match." }, 500);
    if (requestId) await db.from("ground_requests").update({ status: "matched" }).eq("id", requestId);

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
<li>During the pilot, Groundproof's checks are free on these visits. The owner pays the reporter only.</li>
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
      mail(ownerEmail, `${esc(ownerName)}, we've matched you with <b>${esc(prof.display_name)}</b>, a Groundproof reporter in ${esc(prof.state)}. Here's what you've agreed. ${propertyLabel ? "" : `Next: send ${esc(prof.display_name.split(" ")[0])} your property's invite code from its page on Groundproof.`}`),
      reporterEmail ? mail(reporterEmail, `You've been matched with <b>${esc(ownerName)}</b>. Here's what you've agreed. ${propertyLabel ? "Check in from the Groundproof app at the property." : "They'll send you an invite code for their property."}`) : Promise.resolve(),
    ]);
    return json({ ok: true, id: m.id });
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
    db.from("ground_requests").select("id, name, email, phone, state, area, property_type, frequency, notes, status, created_at").order("created_at", { ascending: false }).limit(100),
    db.from("reporter_applications").select("id, name, email, phone, state, areas, occupation, android, notes, status, created_at").order("created_at", { ascending: false }).limit(100),
    db.from("reporter_profiles").select("user_id, slug, display_name, state, areas, is_public, suspended, agreed_rules_at"),
    db.from("developers").select("user_id, company, website, phone, approved, created_at").order("created_at", { ascending: false }),
    db.from("estates").select("id, developer_id"),
    db.from("rate_bands").select("state, visit_type, min_ngn, max_ngn").order("state"),
    db.from("matches").select("id, owner_name, owner_email, reporter_id, property_id, visit_type, price_ngn, frequency, status, created_at").order("created_at", { ascending: false }).limit(100),
    db.from("reporter_rates").select("user_id, visit_type, price_ngn"),
  ]);

  // Emails for owners and reporters
  const emails = new Map<string, string>();
  for (let page = 1; page <= 10; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    for (const u of data?.users ?? []) if (u.email) emails.set(u.id, u.email);
    if (!data || data.users.length < 1000) break;
  }

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
    bands: bands ?? [],
    matches: (matches ?? []).map((m) => ({
      ...m,
      reporter: (profiles ?? []).find((p) => p.user_id === m.reporter_id)?.display_name ?? emails.get(m.reporter_id) ?? "(deleted)",
      property: m.property_id ? P.find((p) => p.id === m.property_id)?.label ?? null : null,
    })),
    groundRequests: groundRequests ?? [],
    reporterApplications: reporterApps ?? [],
    funnel: [
      { step: "Joined waitlist", count: W.length },
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
