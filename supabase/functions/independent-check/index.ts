// POST { property_id, name, state, frequency, notes? } -> a buyer on an estate unit asks for an independent reporter.
// Saved as a ground request (kind "independent") so it shows in the admin To-do, where Emeka introduces a reporter.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { esc } from "../_shared/email.ts";

const FREQ: Record<string, string> = { once: "One visit", monthly: "Monthly", fortnightly: "Every 2 weeks", weekly: "Weekly" };
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const user = await getCaller(req);
  if (!user?.email) return json({ error: "Sign in first" }, 401);

  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const propertyId = str(b.property_id, 40), name = str(b.name, 100), state = str(b.state, 40), frequency = str(b.frequency, 20);
  const notes = str(b.notes, 900) || null;
  if (!name) return json({ error: "Add your name." }, 400);
  if (!state) return json({ error: "Pick the state the estate is in." }, 400);
  if (!FREQ[frequency]) return json({ error: "Pick how often." }, 400);

  const db = adminClient();
  const [{ data: member }, { data: prop }] = await Promise.all([
    db.from("property_members").select("role").eq("property_id", propertyId).eq("user_id", user.id).maybeSingle(),
    db.from("properties").select("label, estate_id, estates(name, location)").eq("id", propertyId).maybeSingle(),
  ]);
  const estate = (prop as { estates?: { name: string; location: string } | null } | null)?.estates;
  if (member?.role !== "viewer" || !prop?.estate_id || !estate) return json({ error: "This is for buyers watching a unit on an estate." }, 403);

  const email = user.email.toLowerCase();
  const { data: open } = await db.from("ground_requests").select("id").eq("property_id", propertyId).eq("email", email).in("status", ["new", "contacted"]).maybeSingle();
  if (open) return json({ error: "You've already asked. We'll be in touch within 3 working days." }, 409);

  const area = `${prop.label}, ${estate.name}, ${estate.location}`.slice(0, 120);
  const { error } = await db.from("ground_requests").insert({
    name, email, state, area, property_type: "building", frequency, notes, kind: "independent", property_id: propertyId,
  });
  if (error) { console.error(error); return json({ error: "Couldn't save that. Try again in a minute." }, 500); }

  const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("ALERT_FROM");
  const admins = (Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const site = Deno.env.get("SITE_URL") ?? "https://groundproof.site";
  if (key && from && admins.length) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: admins, reply_to: email, subject: `Independent check: ${area}`,
        html: `<div style="font-family:Arial,sans-serif;color:#10251f;font-size:15px;line-height:1.5"><p><b>${esc(name)}</b> (${esc(email)}) wants an independent reporter on <b>${esc(area)}</b>, ${esc(state)}. ${esc(FREQ[frequency])}.</p>${notes ? `<p>${esc(notes)}</p>` : ""}<p><a href="${site}/admin">Introduce someone from the To-do list</a></p></div>`,
      }),
    }).catch((e) => console.error(e));
  }
  return json({ ok: true });
});
