// POST { kind: "owner" | "reporter", ...fields } from the website's two forms.
// Saves the lead, emails the admins (ADMIN_EMAILS) and sends the person a short confirmation.
// Deploy with --no-verify-jwt: the forms are public. A hidden "website" field catches simple bots.
import { cors, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { esc } from "../_shared/email.ts";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

const PROPERTY = { building: "House being built", completed: "Finished house", land: "Land / empty plot", rental: "Rented-out property" } as Record<string, string>;
const FREQ = { once: "One visit", monthly: "Monthly", fortnightly: "Every 2 weeks", weekly: "Weekly" } as Record<string, string>;
const JOB = { surveyor: "Surveyor", agent: "Estate agent", builder: "Builder / site worker", corps_member: "NYSC corps member", student: "Student", other: "Other" } as Record<string, string>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return json({ error: "Bad request" }, 400);
  if (str(b.website, 200)) return json({ ok: true });            // honeypot: pretend it worked

  const name = str(b.name, 100), email = str(b.email, 254).toLowerCase(), phone = str(b.phone, 30) || null;
  const state = str(b.state, 40), notes = str(b.notes, 1000) || null;
  if (!name) return json({ error: "Add your name." }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: "Enter an email address like name@example.com." }, 400);
  if (!state) return json({ error: "Pick a state." }, 400);

  const db = adminClient();
  let summary: [string, string][];
  let subject: string;
  let confirm: { subject: string; text: string };

  if (b.kind === "owner") {
    const area = str(b.area, 120), propertyType = str(b.property_type, 20), frequency = str(b.frequency, 20);
    if (!area) return json({ error: "Tell us the area or town." }, 400);
    if (!PROPERTY[propertyType] || !FREQ[frequency]) return json({ error: "Pick the property type and how often." }, 400);
    const { error } = await db.from("ground_requests").insert({ name, email, phone, state, area, property_type: propertyType, frequency, notes });
    if (error) { console.error(error); return json({ error: "Couldn't save that. Try again in a minute." }, 500); }
    subject = `Find someone: ${area}, ${state}`;
    summary = [["Name", name], ["Email", email], ["Phone", phone ?? "-"], ["Where", `${area}, ${state}`], ["Property", PROPERTY[propertyType]], ["Visits", FREQ[frequency]], ["Notes", notes ?? "-"]];
    confirm = {
      subject: "We're finding someone for your property",
      text: `Thanks, ${name}. We've got your request for ${area}, ${state}. We'll email you within 3 working days with a person who can visit, what they charge, and next steps.`,
    };
  } else if (b.kind === "reporter") {
    const areas = str(b.areas, 300), occupation = str(b.occupation, 20);
    const android = b.android === true || b.android === "yes";
    if (!phone || phone.replace(/\D/g, "").length < 7) return json({ error: "Add a phone number we can reach you on." }, 400);
    if (!areas) return json({ error: "Tell us which areas you can cover." }, 400);
    if (!JOB[occupation]) return json({ error: "Pick what you do." }, 400);
    const { error } = await db.from("reporter_applications").insert({ name, email, phone, state, areas, occupation, android, notes });
    if (error) { console.error(error); return json({ error: "Couldn't save that. Try again in a minute." }, 500); }
    subject = `Reporter application: ${name}, ${state}`;
    summary = [["Name", name], ["Email", email], ["Phone", phone], ["State", state], ["Areas", areas], ["Does", JOB[occupation]], ["Android phone", android ? "Yes" : "No"], ["Notes", notes ?? "-"]];
    confirm = {
      subject: "Thanks for applying to Groundproof",
      text: `Thanks, ${name}. We've got your application to do property visits in ${state}. When an owner near you needs someone, we'll contact you on ${phone} or by email.`,
    };
  } else {
    return json({ error: "Bad request" }, 400);
  }

  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("ALERT_FROM");
  const admins = (Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (key && from) {
    const send = (to: string[], subj: string, html: string, replyTo?: string) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject: subj, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
      }).then(async (r) => { if (!r.ok) console.error("lead email failed", r.status, await r.text()); }).catch((e) => console.error(e));

    const rows = summary.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#3d5149;vertical-align:top">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`).join("");
    const site = Deno.env.get("SITE_URL") ?? "https://groundproof.site";
    await Promise.all([
      admins.length ? send(admins, subject, `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;max-width:560px;padding:24px"><h1 style="font-size:20px;margin:0 0 12px">${esc(subject)}</h1><table style="border-collapse:collapse;font-size:15px">${rows}</table><p style="margin:18px 0 0;font-size:14px">Reply to this email to answer them. All leads: <a href="${site}/admin">${site}/admin</a></p></div>`, email) : Promise.resolve(),
      send([email], confirm.subject, `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;max-width:520px;margin:0 auto;padding:24px"><p style="margin:0 0 6px;font-size:14px;color:#3d5149">Groundproof</p><h1 style="margin:0 0 14px;font-size:22px">${esc(confirm.subject)}</h1><p style="margin:0;font-size:16px;line-height:1.5">${esc(confirm.text)}</p></div>`),
    ]);
  }

  return json({ ok: true });
});
