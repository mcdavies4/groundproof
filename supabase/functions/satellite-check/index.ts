// POST { property_id, days_back? } -> an advisory satellite look at the property. Owner only. Deploy with --no-verify-jwt.
// Stores the result on the property. One run per property per day. Never changes a check-in verdict.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { satelliteChange } from "../_shared/satellite.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const user = await getCaller(req);
  if (!user) return json({ error: "Sign in first" }, 401);
  const b = await req.json().catch(() => ({})) as { property_id?: string; days_back?: number };
  if (!b.property_id) return json({ error: "property_id is required" }, 400);
  const daysBack = [90, 180, 365].includes(Number(b.days_back)) ? Number(b.days_back) : 365;

  const db = adminClient();
  const { data: p } = await db.from("properties")
    .select("id, owner_id, anchor_lat, anchor_lng, beacons, satellite_checked_at").eq("id", b.property_id).maybeSingle();
  if (!p || p.owner_id !== user.id) return json({ error: "Not found" }, 404);

  if (p.satellite_checked_at && Date.now() - new Date(p.satellite_checked_at).getTime() < 24 * 3_600_000) {
    return json({ error: "You've already run the satellite check today. Try again tomorrow." }, 429);
  }

  // Where to look: the anchored spot, or the middle of a plot's beacons.
  let lat: number | null = p.anchor_lat, lng: number | null = p.anchor_lng;
  if ((lat === null || lng === null) && Array.isArray(p.beacons) && p.beacons.length) {
    const bs = p.beacons as { lat: number; lng: number }[];
    lat = bs.reduce((t, x) => t + x.lat, 0) / bs.length;
    lng = bs.reduce((t, x) => t + x.lng, 0) / bs.length;
  }
  if (lat === null || lng === null) return json({ error: "This property has no location yet. Do the anchor visit first." }, 400);

  const result = await satelliteChange(lat, lng, daysBack);
  await db.from("properties").update({ satellite_result: { ...result, daysBack }, satellite_checked_at: new Date().toISOString() }).eq("id", p.id);
  return json(result);
});
