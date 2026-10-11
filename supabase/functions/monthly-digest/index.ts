// POST {} -> emails last month's summary for every anchored property to the owner and family viewers.
// Called on the 1st of each month by the website's scheduled job (Vercel Cron -> /api/cron/digest).
// Protected by the DIGEST_SECRET secret (sent as the x-digest-secret header); deploy with --no-verify-jwt.
//
// Optional body, for testing:
//   { "month": "2026-10" }          a specific month instead of last month
//   { "property_id": "..." }        one property only
//   { "dry_run": true }             work out the summaries but send nothing
//   { "force": true }               send even if this month's summary already went out
import { cors, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { esc } from "../_shared/email.ts";

type Row = { id: string; owner_id: string; label: string; anchored_at: string; estate_id: string | null };
type C = { id: string; verdict: string; is_anchor: boolean; milestone_id: string | null; photo_paths: string[]; server_time: string; taken_offline: boolean };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const secret = Deno.env.get("DIGEST_SECRET");
  if (!secret || req.headers.get("x-digest-secret") !== secret) return json({ error: "Not found" }, 404);

  const body = await req.json().catch(() => ({})) as { month?: string; property_id?: string; dry_run?: boolean; force?: boolean };
  const now = new Date();
  const month = /^\d{4}-\d{2}$/.test(body.month ?? "")
    ? body.month!
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();
  const monthName = new Date(start).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

  const db = adminClient();
  let q = db.from("properties").select("id, owner_id, label, anchored_at, estate_id").not("anchored_at", "is", null).lt("anchored_at", end);
  if (body.property_id) q = q.eq("id", body.property_id);
  const { data: props, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("ALERT_FROM");
  const site = Deno.env.get("SITE_URL") ?? "https://groundproof.site";
  const results: unknown[] = [];

  for (const p of (props ?? []) as Row[]) {
    const [{ data: cs }, { data: stages }, { data: viewers }, { data: owner }] = await Promise.all([
      db.from("checkins").select("id, verdict, is_anchor, milestone_id, photo_paths, server_time, taken_offline")
        .eq("property_id", p.id).gte("server_time", start).lt("server_time", end).order("server_time", { ascending: false }),
      db.from("milestones").select("id, name, completed_checkin_id").eq("property_id", p.id),
      db.from("viewer_invites").select("email, user_id").eq("property_id", p.id).not("accepted_at", "is", null),
      db.auth.admin.getUserById(p.owner_id),
    ]);
    const C = (cs ?? []) as C[];
    const counted = C.filter((c) => c.verdict !== "pending");
    const n = { verified: 0, review: 0, flagged: 0 } as Record<string, number>;
    for (const c of counted) n[c.verdict] = (n[c.verdict] ?? 0) + 1;
    const ids = new Set(C.map((c) => c.id));
    const doneStages = (stages ?? []).filter((s) => s.completed_checkin_id && ids.has(s.completed_checkin_id)).map((s) => s.name as string);
    const latest = C.find((c) => c.verdict === "verified");
    // Respect "monthly summary: off" on the owner's and viewers' account pages.
    const { data: off } = await db.from("email_prefs").select("user_id").eq("digest", false)
      .in("user_id", [p.owner_id, ...(viewers ?? []).map((v) => v.user_id).filter(Boolean)]);
    const offIds = new Set((off ?? []).map((o) => o.user_id));
    const recipients = [...new Set([
      offIds.has(p.owner_id) || p.estate_id ? null : owner.user?.email,   // developers see estates on the website instead
      ...(viewers ?? []).filter((v) => !offIds.has(v.user_id)).map((v) => v.email),
    ].filter(Boolean) as string[])];

    const total = counted.length;
    const subject = total === 0
      ? `No visits at ${p.label} in ${monthName}`
      : `${monthName} at ${p.label}: ${total} visit${total === 1 ? "" : "s"}${n.flagged ? `, ${n.flagged} flagged` : n.review ? `, ${n.review} to look at` : n.verified === total ? ", all verified" : ""}`;

    const summary = { property: p.label, month, total, ...n, stages: doneStages, recipients: recipients.length };
    if (body.dry_run) { results.push({ ...summary, subject, sent: false }); continue; }
    if (!key || !from || !recipients.length) { results.push({ ...summary, sent: false, why: "no email setup or recipients" }); continue; }

    // Claim this property-month first so a second run can't send it again.
    if (!body.force) {
      const { data: claimed } = await db.from("digest_log").upsert(
        { property_id: p.id, month, recipients: recipients.length },
        { onConflict: "property_id,month", ignoreDuplicates: true },
      ).select("property_id");
      if (!claimed?.length) { results.push({ ...summary, sent: false, why: "already sent" }); continue; }
    }

    let photo: string | null = null;
    if (latest?.photo_paths?.[0]) {
      const { data } = await db.storage.from("checkins").createSignedUrl(latest.photo_paths[0], 60 * 60 * 24 * 14);
      photo = data?.signedUrl ?? null;
    }

    const link = `${site}/properties/${p.id}`;
    const stat = (num: number, label: string, colour: string) =>
      `<td style="padding:10px 8px;text-align:center;border:1px solid #c9cec6"><div style="font-size:26px;font-weight:bold;color:${colour}">${num}</div><div style="font-size:13px;color:#3d5149">${label}</div></td>`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;max-width:520px;margin:0 auto;padding:24px">
  <p style="margin:0 0 6px;font-size:14px;color:#3d5149">Monthly summary · ${esc(p.label)}</p>
  <h1 style="margin:0 0 16px;font-size:24px">${esc(monthName)} at ${esc(p.label)}</h1>
  ${total === 0
    ? `<p style="margin:0 0 18px;font-size:16px;line-height:1.5">Nobody checked in this month. If you'd like eyes on the property, ask for a visit: your person on the ground gets an email and a reminder in the app.</p>
  <p style="margin:0 0 24px"><a href="${link}#ground" style="background:#10251f;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:4px;display:inline-block">Request a check-in</a></p>`
    : `<table role="presentation" style="border-collapse:collapse;width:100%;margin:0 0 18px"><tr>
    ${stat(n.verified, "verified", "#1e7a4e")}${stat(n.review, "to look at", "#a86a12")}${stat(n.flagged, "flagged", "#b3261e")}
  </tr></table>
  ${doneStages.length ? `<p style="margin:0 0 14px;font-size:16px;line-height:1.5"><strong>Stages confirmed:</strong> ${doneStages.map(esc).join(", ")}</p>` : ""}
  ${photo ? `<p style="margin:0 0 6px;font-size:14px;color:#3d5149">Latest verified photo</p><img src="${photo}" alt="Latest verified photo of ${esc(p.label)}" width="472" style="width:100%;max-width:472px;border-radius:4px;display:block;margin:0 0 18px">` : ""}
  <p style="margin:0 0 24px"><a href="${link}" style="background:#10251f;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:4px;display:inline-block">See the progress</a></p>`}
  <p style="margin:0;font-size:13px;color:#3d5149">You get this once a month because you watch ${esc(p.label)} on Groundproof. <a href="${site}/account#emails" style="color:#3d5149">Turn it off</a>.</p>
</div>`;

    let sent = 0;
    await Promise.all(recipients.map(async (to) => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, html }),
      });
      if (res.ok) sent++;
      else console.error("digest email failed", res.status, await res.text());
    }));
    results.push({ ...summary, subject, sent });
  }

  return json({ month, properties: results.length, results });
});
