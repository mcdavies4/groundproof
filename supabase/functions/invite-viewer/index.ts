// POST { property_id, email } -> invites a family member or co-investor to view a property.
// Only the property's owner can call it. Sends the invite email through Resend.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { esc } from "../_shared/email.ts";

const MAX_VIEWERS = 5;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const user = await getCaller(req);
  if (!user) return json({ error: "Sign in first" }, 401);

  let body: { property_id?: string; email?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const propertyId = String(body.property_id ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: "That email address doesn't look right." }, 400);
  if (email === (user.email ?? "").toLowerCase()) return json({ error: "That's your own email. You already see this property." }, 400);

  const db = adminClient();
  const { data: property } = await db.from("properties").select("id, label, owner_id").eq("id", propertyId).maybeSingle();
  if (!property || property.owner_id !== user.id) return json({ error: "Not found" }, 404);

  const { data: existing } = await db.from("viewer_invites").select("id, email").eq("property_id", propertyId);
  if ((existing ?? []).some((v) => v.email === email)) return json({ error: "You've already invited that email." }, 409);
  if ((existing ?? []).length >= MAX_VIEWERS) return json({ error: `You can add up to ${MAX_VIEWERS} people to a property.` }, 400);

  const { error } = await db.from("viewer_invites").insert({ property_id: propertyId, email, invited_by: user.id });
  if (error) {
    console.error("viewer invite insert failed", error);
    return json({ error: "Couldn't save the invite. Try again." }, 500);
  }

  const emailed = await sendInvite(email, user.email ?? "The owner", property.label);
  return json({ ok: true, emailed });
});

async function sendInvite(to: string, inviter: string, label: string): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("ALERT_FROM");
  if (!key || !from) return false;

  const site = Deno.env.get("SITE_URL") ?? "https://groundproof.site";
  const link = `${site}/login?next=/dashboard`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;max-width:520px;margin:0 auto;padding:24px">
  <p style="margin:0 0 6px;font-size:14px;color:#3d5149">Groundproof</p>
  <h1 style="margin:0 0 14px;font-size:24px">You've been added to ${esc(label)}</h1>
  <p style="margin:0 0 14px;font-size:16px;line-height:1.5">${esc(inviter)} is using Groundproof to keep an eye on this property in Nigeria. Every visit from their person on the ground is checked against the building's NIPOST postcode, with photos.</p>
  <p style="margin:0 0 14px;font-size:16px;line-height:1.5">You can now see every check-in and its photos, and you'll get an email after each one. You can't change anything.</p>
  <p style="margin:0 0 24px"><a href="${link}" style="background:#10251f;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:4px;display:inline-block">Open Groundproof</a></p>
  <p style="margin:0;font-size:13px;color:#3d5149">Sign in with this email address (${esc(to)}). No password needed: we send you a code.</p>
</div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: `You've been added to ${label} on Groundproof`, html }),
    });
    if (!res.ok) { console.error("invite email failed", res.status, await res.text()); return false; }
    return true;
  } catch (e) {
    console.error("invite email error", e);
    return false;
  }
}
