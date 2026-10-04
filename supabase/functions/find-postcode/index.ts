// POST { property_id, lat, lng, accuracy } -> which NIPOST building the reporter is standing at.
// Read-only preview for the anchor visit; verify-checkin re-checks everything when the anchor is submitted.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { nipost, NipostError } from "../_shared/nipost.ts";

const SEARCH_RADIUS_M = 60;
const MATCH_DISTANCE_M = 25;
const MAX_ACCURACY_M = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const user = await getCaller(req);
  if (!user) return json({ error: "Sign in first" }, 401);

  const { property_id, lat, lng, accuracy } = await req.json().catch(() => ({}));
  if (!property_id || typeof lat !== "number" || typeof lng !== "number") {
    return json({ error: "property_id, lat and lng are required" }, 400);
  }

  const db = adminClient();
  const { data: member } = await db.from("property_members").select("role")
    .eq("property_id", property_id).eq("user_id", user.id).maybeSingle();
  if (member?.role !== "reporter") return json({ error: "You're not the reporter on this property" }, 403);

  if (typeof accuracy === "number" && accuracy > MAX_ACCURACY_M) {
    return json({ status: "weak_gps", accuracy: Math.round(accuracy) });
  }

  try {
    const { data } = await nipost.reverse(lat, lng, SEARCH_RADIUS_M);
    const unit = data.found ? data.unit : null;
    if (!unit || unit.distance_m > MATCH_DISTANCE_M || unit.confidence === "low") {
      return json({ status: "not_listed", nearest: unit ? { postcode: unit.postcode, distance_m: Math.round(unit.distance_m) } : null });
    }
    return json({ status: "found", postcode: unit.postcode, distance_m: Math.round(unit.distance_m), confidence: unit.confidence });
  } catch (e) {
    const msg = e instanceof NipostError ? `${e.status} ${e.code}` : String(e);
    return json({ status: "error", error: `NIPOST unavailable (${msg}). Try again in a minute.` }, 502);
  }
});
