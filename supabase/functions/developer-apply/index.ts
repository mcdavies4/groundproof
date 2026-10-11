// POST { company, website?, phone? } -> a signed-in user applies for a developer account.
// Emails the admins (ADMIN_EMAILS); they approve it on the admin dashboard.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { esc } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const user = await getCaller(req);
  if (!user) return json({ error: "Sign in first" }, 401);

  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const company = String(b.company ?? "").trim().slice(0, 120);
  const website = String(b.website ?? "").trim().slice(0, 200) || null;
  const phone = String(b.phone ?? "").trim().slice(0, 30) || null;
  if (company.length < 2) return json({ error: "Add your company name." }, 400);

  const db = adminClient();
  const { data: existing } = await db.from("developers").select("approved").eq("user_id", user.id).maybeSingle();
  if (existing?.approved) return json({ ok: true, approved: true });
  const { error } = await db.from("developers").upsert({ user_id: user.id, company, website, phone }, { onConflict: "user_id" });
  if (error) { console.error(error); return json({ error: "Couldn't save that. Try again." }, 500); }

  const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("ALERT_FROM");
  const admins = (Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const site = Deno.env.get("SITE_URL") ?? "https://groundproof.site";
  if (key && from && admins.length) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: admins, reply_to: user.email, subject: `Developer application: ${company}`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;padding:24px;font-size:15px"><h1 style="font-size:20px;margin:0 0 12px">${esc(company)} wants a developer account</h1>
<p>Email: ${esc(user.email ?? "")}<br>Phone: ${esc(phone ?? "-")}<br>Website: ${esc(website ?? "-")}</p>
<p>Approve it on <a href="${site}/admin">${site}/admin</a>.</p></div>`,
      }),
    }).catch((e) => console.error(e));
  }
  return json({ ok: true, approved: false });
});
