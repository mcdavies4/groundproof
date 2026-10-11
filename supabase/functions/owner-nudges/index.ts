// POST {} -> onboarding nudges for owners who've stalled. Runs daily (website cron -> /api/cron/daily).
// Protected by DIGEST_SECRET (x-digest-secret header); deploy with --no-verify-jwt.
//   invite       1+ day after adding a property, nobody on the ground yet
//   anchor       3+ days after adding it, still not anchored
//   first_visit  7+ days after anchoring, no check-in since and no open request
// Only properties added (or anchored) in the last 21 days, so older properties never get a burst.
// Each nudge goes once per property; owners can turn them off on their account page.
// Body { "dry_run": true } lists what would be sent.
import { cors, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { esc } from "../_shared/email.ts";

const DAY = 86_400_000;
const WINDOW = 21 * DAY;
type Kind = "invite" | "anchor" | "first_visit";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const secret = Deno.env.get("DIGEST_SECRET");
  if (!secret || req.headers.get("x-digest-secret") !== secret) return json({ error: "Not found" }, 404);
  const { dry_run } = await req.json().catch(() => ({})) as { dry_run?: boolean };

  const db = adminClient();
  const now = Date.now();
  const since = new Date(now - WINDOW - 7 * DAY).toISOString();

  const { data: props } = await db.from("properties").select("id, owner_id, label, created_at, anchored_at").gte("created_at", since);
  const P = props ?? [];
  if (!P.length) return json({ sent: [], checked: 0 });
  const ids = P.map((p) => p.id);

  const [{ data: members }, { data: visits }, { data: requests }, { data: log }, { data: prefs }] = await Promise.all([
    db.from("property_members").select("property_id").in("property_id", ids).eq("role", "reporter"),
    db.from("checkins").select("property_id").in("property_id", ids).eq("is_anchor", false),
    db.from("checkin_requests").select("property_id").in("property_id", ids).is("fulfilled_at", null).is("cancelled_at", null),
    db.from("nudge_log").select("property_id, kind").in("property_id", ids),
    db.from("email_prefs").select("user_id, tips").in("user_id", [...new Set(P.map((p) => p.owner_id))]),
  ]);
  const hasReporter = new Set((members ?? []).map((m) => m.property_id));
  const hasVisit = new Set((visits ?? []).map((c) => c.property_id));
  const hasRequest = new Set((requests ?? []).map((r) => r.property_id));
  const sent = new Set((log ?? []).map((l) => `${l.property_id}:${l.kind}`));
  const optedOut = new Set((prefs ?? []).filter((p) => !p.tips).map((p) => p.user_id));

  const due: { p: (typeof P)[number]; kind: Kind }[] = [];
  for (const p of P) {
    if (optedOut.has(p.owner_id)) continue;
    const age = now - Date.parse(p.created_at);
    const pick = (kind: Kind) => { if (!sent.has(`${p.id}:${kind}`)) due.push({ p, kind }); };
    if (!p.anchored_at) {
      if (age > WINDOW) continue;
      if (age >= 3 * DAY) pick("anchor");
      else if (age >= DAY && !hasReporter.has(p.id)) pick("invite");
    } else {
      const sinceAnchor = now - Date.parse(p.anchored_at);
      if (sinceAnchor >= 7 * DAY && sinceAnchor <= WINDOW + 7 * DAY && !hasVisit.has(p.id) && !hasRequest.has(p.id)) pick("first_visit");
    }
  }

  if (dry_run) return json({ checked: P.length, due: due.map((d) => ({ property: d.p.label, kind: d.kind })) });

  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("ALERT_FROM");
  if (!key || !from) return json({ error: "RESEND_API_KEY or ALERT_FROM not set" }, 500);
  const site = Deno.env.get("SITE_URL") ?? "https://groundproof.site";

  const results: unknown[] = [];
  for (const { p, kind } of due) {
    // Claim first, so a second run the same day can't send it again.
    const { data: claimed } = await db.from("nudge_log").upsert({ property_id: p.id, kind }, { onConflict: "property_id,kind", ignoreDuplicates: true }).select("property_id");
    if (!claimed?.length) continue;

    const { data: owner } = await db.auth.admin.getUserById(p.owner_id);
    const to = owner.user?.email;
    if (!to) continue;

    const link = `${site}/properties/${p.id}`;
    const label = esc(p.label);
    const reporterThere = hasReporter.has(p.id);
    const m = {
      invite: {
        subject: `Who's going to check on ${p.label}?`,
        body: `<p>You've added <strong>${label}</strong>. The next step is to send an invite code to the person who'll visit: a relative, your builder's supervisor, or an agent you trust. They install the Groundproof app, enter the code, and their first visit locks the property to its building.</p>
<p>No one you can send? We'll match you with a local surveyor, agent or builder, and every visit they make is still verified.</p>`,
        cta: ["Create an invite code", `${link}#ground`], extra: ["Find me someone", `${site}/find-someone`],
      },
      anchor: {
        subject: `${p.label} isn't anchored yet`,
        body: reporterThere
          ? `<p>Your person on the ground has joined <strong>${label}</strong> but hasn't done the first visit yet. That visit takes about 10 minutes: they stand outside the building, open the app, and take 4 photos. After it, every check-in is verified against that spot.</p>
<p>A quick message to them usually does it. If they've got no signal there, the app saves the visit and uploads it later.</p>`
          : `<p><strong>${label}</strong> still has nobody on the ground, so nothing can be checked yet. Send an invite code to someone who can visit, or let us find someone local for you.</p>`,
        cta: reporterThere ? ["Open the property", link] : ["Create an invite code", `${link}#ground`],
        extra: reporterThere ? null : ["Find me someone", `${site}/find-someone`],
      },
      first_visit: {
        subject: `Time for a first look at ${p.label}?`,
        body: `<p><strong>${label}</strong> was anchored a week ago and there hasn't been a check-in since. You can ask your person on the ground for a visit in one click: they get an email and a reminder in the app, and you get the verified photos.</p>`,
        cta: ["Request a check-in", `${link}#ground`], extra: null,
      },
    }[kind];

    const btn = (t: string, u: string, primary: boolean) =>
      `<a href="${u}" style="${primary ? "background:#10251f;color:#fff" : "color:#10251f;border:2px solid #10251f"};text-decoration:none;font-weight:bold;padding:11px 18px;border-radius:4px;display:inline-block;margin:0 8px 8px 0">${esc(t)}</a>`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;max-width:520px;margin:0 auto;padding:24px;font-size:16px;line-height:1.5">
  <p style="margin:0 0 6px;font-size:14px;color:#3d5149">Groundproof · ${label}</p>
  <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3">${esc(m.subject)}</h1>
  ${m.body}
  <p style="margin:20px 0 24px">${btn(m.cta[0], m.cta[1], true)}${m.extra ? btn(m.extra[0], m.extra[1], false) : ""}</p>
  <p style="margin:0;font-size:13px;color:#3d5149">Tips like this stop once each step is done. <a href="${site}/account#emails" style="color:#3d5149">Turn them off</a>.</p>
</div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: m.subject, html }),
    });
    if (!res.ok) console.error("nudge failed", res.status, await res.text());
    results.push({ property: p.label, kind, ok: res.ok });
  }
  return json({ checked: P.length, sent: results });
});
