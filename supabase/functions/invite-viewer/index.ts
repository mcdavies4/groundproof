// POST { property_id, email } -> invites a family member or co-investor to view a property.
// Only the property's owner can call it. Sends the invite email through Resend.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { sendViewerInvite } from "../_shared/email.ts";

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

  const emailed = await sendViewerInvite(email, user.email ?? "The owner", property.label);
  return json({ ok: true, emailed });
});
