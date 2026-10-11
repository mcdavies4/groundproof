// POST { visit_id } -> judges a plot visit: each beacon against the survey plan, plus the plot's shape and size.
// Verdicts: match, partial (needs a surveyor's eye), mismatch, flagged (faked).
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { judgePlot } from "../_shared/plotcheck.ts";
import { esc } from "../_shared/email.ts";

const ALLOW_EMULATOR = Deno.env.get("ALLOW_EMULATOR") === "true";
const TITLE = { match: "Plot matches the survey plan", partial: "Plot needs a closer look", mismatch: "Plot doesn't match the survey plan", flagged: "Plot visit flagged" } as const;
const COLOUR = { match: "#1e7a4e", partial: "#a86a12", mismatch: "#b3261e", flagged: "#b3261e" } as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const user = await getCaller(req);
  if (!user) return json({ error: "Sign in first" }, 401);
  const { visit_id } = await req.json().catch(() => ({})) as { visit_id?: string };
  if (!visit_id) return json({ error: "visit_id is required" }, 400);

  const db = adminClient();
  const { data: v } = await db.from("plot_visits").select("*, properties(id, owner_id, label, beacons, plan_accuracy_m)").eq("id", visit_id).maybeSingle();
  if (!v) return json({ error: "Visit not found" }, 404);
  if (v.reporter_id !== user.id) return json({ error: "Not your visit" }, 403);
  if (v.verdict !== "pending") return json({ verdict: v.verdict, reason: v.verdict_reason });

  const p = v.properties as { id: string; owner_id: string; label: string; beacons: { label: string; lat: number; lng: number }[]; plan_accuracy_m: number | null };
  const { data: checks } = await db.from("beacon_checks").select("id, beacon_index, found, lat, lng, accuracy_m, is_mocked").eq("visit_id", v.id);

  let verdict: keyof typeof TITLE, reasons: string[], results: { index: number; status: string; distance: number | null }[] = [];
  let areaPlan: number | null = null, areaGround: number | null = null;
  if (v.is_emulator && !ALLOW_EMULATOR) {
    verdict = "flagged"; reasons = ["Done on an emulator, not a real phone."];
  } else {
    const r = judgePlot(p.beacons, (checks ?? []).map((c) => ({
      index: c.beacon_index, found: c.found, lat: c.lat, lng: c.lng, accuracy: c.accuracy_m, mocked: c.is_mocked,
    })), p.plan_accuracy_m ?? 5);
    verdict = r.verdict; reasons = r.reasons; results = r.results; areaPlan = r.areaPlan; areaGround = r.areaGround;
  }
  const reason = reasons.join(" ");

  for (const r of results) {
    const c = (checks ?? []).find((x) => x.beacon_index === r.index);
    if (c) await db.from("beacon_checks").update({ distance_m: r.distance, status: r.status }).eq("id", c.id);
  }
  await db.from("plot_visits").update({
    verdict, verdict_reason: reason, checked_at: new Date().toISOString(),
    area_plan_m2: areaPlan, area_ground_m2: areaGround,
  }).eq("id", v.id);

  // Tell the owner (and anyone watching with them).
  const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("ALERT_FROM");
  if (key && from) {
    const [{ data: owner }, { data: viewers }] = await Promise.all([
      db.auth.admin.getUserById(p.owner_id),
      db.from("viewer_invites").select("email").eq("property_id", p.id).not("accepted_at", "is", null),
    ]);
    const to = [...new Set([owner.user?.email, ...(viewers ?? []).map((x) => x.email)].filter(Boolean) as string[])];
    const site = Deno.env.get("SITE_URL") ?? "https://groundproof.site";
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;max-width:520px;margin:0 auto;padding:24px">
  <p style="margin:0 0 6px;font-size:14px;color:#3d5149">Plot visit · ${esc(p.label)}</p>
  <h1 style="margin:0 0 14px;font-size:24px;color:${COLOUR[verdict]}">${TITLE[verdict]}</h1>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.5">${esc(reason)}</p>
  <p style="margin:0 0 24px"><a href="${site}/properties/${p.id}" style="background:#10251f;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:4px;display:inline-block">See plan vs ground</a></p>
  <p style="margin:0;font-size:13px;color:#3d5149">Groundproof checks where the beacons are, not who owns the land. Before paying, have a lawyer search the title.</p>
</div>`;
    await Promise.all(to.map((addr) => fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [addr], subject: `${TITLE[verdict]}: ${p.label}`, html }),
    }).catch((e) => console.error(e))));
  }

  return json({ verdict, reason, results });
});
