// POST { label, beacons: [{ label, lat, lng }], plan_accuracy_m? } -> creates a plot to visit before buying.
// Beacons come from the survey plan (converted to GPS coordinates by the plot check tool, or typed in).
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { areaM2 } from "../_shared/plotcheck.ts";
import { distanceM } from "../_shared/geo.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const user = await getCaller(req);
  if (!user) return json({ error: "Sign in first" }, 401);

  const b = await req.json().catch(() => ({})) as { label?: string; beacons?: unknown[]; plan_accuracy_m?: number };
  const label = String(b.label ?? "").trim().slice(0, 120);
  if (!label) return json({ error: "Give the plot a name, for example \"Plot 14, Lugbe\"." }, 400);

  const beacons = (Array.isArray(b.beacons) ? b.beacons : []).map((x, i) => {
    const o = x as Record<string, unknown>;
    return { label: String(o.label ?? `Beacon ${i + 1}`).trim().slice(0, 30) || `Beacon ${i + 1}`, lat: Number(o.lat), lng: Number(o.lng) };
  });
  if (beacons.length < 3 || beacons.length > 30) return json({ error: "A plot needs between 3 and 30 beacons." }, 400);
  if (beacons.some((p) => !(p.lat >= 4 && p.lat <= 14) || !(p.lng >= 2.5 && p.lng <= 15))) {
    return json({ error: "Some beacons aren't in Nigeria. Check the coordinates, or convert them with the plot check tool first." }, 400);
  }
  const span = Math.max(...beacons.flatMap((a, i) => beacons.slice(i + 1).map((c) => distanceM(a.lat, a.lng, c.lat, c.lng))));
  if (span > 3000) return json({ error: "Those beacons are more than 3 km apart. Check for a typing mistake." }, 400);
  if (areaM2(beacons) < 20) return json({ error: "Those beacons don't make a plot shape. Check the order and the numbers." }, 400);
  const acc = Math.min(50, Math.max(0, Number(b.plan_accuracy_m ?? 5) || 5));

  const db = adminClient();
  const maxProps = Number(Deno.env.get("PILOT_MAX_PROPERTIES") ?? "2");
  if (maxProps > 0) {
    const { count } = await db.from("properties").select("id", { count: "exact", head: true }).eq("owner_id", user.id).is("estate_id", null);
    if ((count ?? 0) >= maxProps) return json({ error: `During the pilot each account can watch up to ${maxProps} properties or plots. Email us if you need more.` }, 403);
  }

  const { data: property, error } = await db.from("properties")
    .insert({ owner_id: user.id, label, postcode: null, kind: "plot", beacons, plan_accuracy_m: acc })
    .select("id").single();
  if (error || !property) { console.error(error); return json({ error: "Couldn't save the plot. Try again." }, 500); }
  const { error: mErr } = await db.from("property_members").insert({ property_id: property.id, user_id: user.id, role: "owner" });
  if (mErr) { await db.from("properties").delete().eq("id", property.id); return json({ error: "Couldn't save the plot. Try again." }, 500); }
  return json({ property });
});
