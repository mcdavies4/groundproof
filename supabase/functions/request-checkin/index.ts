// POST { property_id, note?, due_by?, audit_of? } -> the owner asks for a visit.
// With audit_of (a check-in id) it asks a DIFFERENT reporter to repeat that visit independently (a second opinion).
// Creates the open request (one per property) and emails everyone on the ground for that property.
// The app shows the request and reminds the reporter until a check-in answers it.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { esc } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const user = await getCaller(req);
  if (!user) return json({ error: "Sign in first" }, 401);

  let body: { property_id?: string; note?: string; due_by?: string; audit_of?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const propertyId = String(body.property_id ?? "");
  const auditOf = /^[0-9a-f-]{36}$/i.test(String(body.audit_of ?? "")) ? String(body.audit_of) : null;
  const note = String(body.note ?? "").trim().slice(0, 300)
    || (auditOf ? "Second opinion: please visit on your own and take your own photos." : null);
  const dueBy = /^\d{4}-\d{2}-\d{2}$/.test(String(body.due_by ?? "")) ? String(body.due_by) : null;
  if (dueBy && dueBy < new Date().toISOString().slice(0, 10)) return json({ error: "Pick a date from today onwards." }, 400);

  const db = adminClient();
  const { data: property } = await db.from("properties").select("id, label, owner_id").eq("id", propertyId).maybeSingle();
  if (!property || property.owner_id !== user.id) return json({ error: "Not found" }, 404);

  let excludeReporter: string | null = null;
  if (auditOf) {
    const { data: target } = await db.from("checkins")
      .select("id, property_id, reporter_id, is_anchor, verdict, audit_status").eq("id", auditOf).maybeSingle();
    if (!target || target.property_id !== propertyId) return json({ error: "Not found" }, 404);
    if (target.is_anchor || !["verified", "review"].includes(target.verdict)) return json({ error: "Only a completed check-in can be double-checked." }, 400);
    if (target.audit_status === "agreed" || target.audit_status === "disputed") return json({ error: "This visit already has a second opinion." }, 409);
    excludeReporter = target.reporter_id;
  }

  const { data: allReporters } = await db.from("property_members").select("user_id").eq("property_id", propertyId).eq("role", "reporter");
  const reporters = (allReporters ?? []).filter((r) => r.user_id !== excludeReporter);
  if (!reporters.length) {
    return json({ error: auditOf
      ? "A second opinion needs a different person on the ground. Create another invite code for someone else."
      : "Nobody is on the ground for this property yet. Create an invite code first." }, 400);
  }

  const { error } = await db.from("checkin_requests").insert({
    property_id: propertyId, requested_by: user.id, note, due_by: dueBy, audit_of: auditOf, exclude_reporter: excludeReporter,
  });
  if (error) {
    if (error.code === "23505") return json({ error: "There's already an open request for this property." }, 409);
    console.error("request insert failed", error);
    return json({ error: "Couldn't save the request. Try again." }, 500);
  }

  let emailed = 0;
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("ALERT_FROM");
  if (key && from) {
    const due = dueBy ? new Date(dueBy + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : null;
    const subject = auditOf ? `Second opinion requested: ${property.label}` : `Visit requested: ${property.label}`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;max-width:520px;margin:0 auto;padding:24px">
  <p style="margin:0 0 6px;font-size:14px;color:#3d5149">Groundproof · ${esc(property.label)}</p>
  <h1 style="margin:0 0 14px;font-size:24px">${auditOf ? "The owner wants a second opinion" : "The owner has asked for a visit"}${due ? ` by ${esc(due)}` : ""}</h1>
  ${note ? `<p style="margin:0 0 18px;padding-left:12px;border-left:4px solid #f4c531;font-size:16px;line-height:1.5"><em>${esc(note)}</em></p>` : ""}
  <p style="margin:0 0 14px;font-size:16px;line-height:1.5">${auditOf ? "Please visit on your own, without asking the previous reporter what they saw, and take your own photos. " : ""}Open the Groundproof app at the property and check in as usual. No signal there? Take the photos anyway: the app uploads them when you're back online.</p>
  <p style="margin:0;font-size:13px;color:#3d5149">You're getting this because you're the person on the ground for ${esc(property.label)}.</p>
</div>`;
    await Promise.all(reporters.map(async (r) => {
      try {
        const { data } = await db.auth.admin.getUserById(r.user_id);
        const to = data.user?.email;
        if (!to) return;
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [to], subject, html }),
        });
        if (res.ok) emailed++;
        else console.error("request email failed", res.status, await res.text());
      } catch (e) {
        console.error("request email error", e);
      }
    }));
  }

  return json({ ok: true, emailed });
});
