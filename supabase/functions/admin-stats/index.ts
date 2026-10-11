// POST {} -> pilot dashboard data. Only for emails listed in the ADMIN_EMAILS secret (comma-separated).
// Uses the service role, so it sees every property; never expose this to non-admins.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";

const DAY = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const user = await getCaller(req);
  const admins = (Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!user?.email || !admins.includes(user.email.toLowerCase())) return json({ error: "Not found" }, 404);

  const db = adminClient();
  const since7 = new Date(Date.now() - 7 * DAY).toISOString();
  const since1 = new Date(Date.now() - DAY).toISOString();

  // Pilot scale: a few hundred rows at most, so plain selects are fine.
  const [{ data: props }, { data: checkins }, { data: members }, { data: payments }, { data: waitlist }] = await Promise.all([
    db.from("properties").select("id, owner_id, label, postcode, anchor_mode, anchored_at, check_credits, plan, plan_expires_at, created_at, share_token").order("created_at", { ascending: false }),
    db.from("checkins").select("id, property_id, reporter_id, is_anchor, verdict, verdict_reason, match_type, is_emulator, is_mocked, photo_match, server_time, paid_by").order("server_time", { ascending: false }).limit(2000),
    db.from("property_members").select("property_id, user_id, role"),
    db.from("payments").select("id, property_id, user_id, product, amount_ngn, status, created_at, paid_at").order("created_at", { ascending: false }).limit(500),
    db.from("waitlist").select("email, plan, created_at").order("created_at", { ascending: false }).limit(500),
  ]);
  const [{ data: groundRequests }, { data: reporterApps }] = await Promise.all([
    db.from("ground_requests").select("id, name, email, phone, state, area, property_type, frequency, notes, status, created_at").order("created_at", { ascending: false }).limit(100),
    db.from("reporter_applications").select("id, name, email, phone, state, areas, occupation, android, notes, status, created_at").order("created_at", { ascending: false }).limit(100),
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
