// POST { checkin_id } -> asks NIPOST which building the phone was at and writes the verdict.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { nipost, NipostError } from "../_shared/nipost.ts";

const VERIFIED_DISTANCE_M = 25;
const REVIEW_DISTANCE_M = 60;
const MAX_ACCURACY_M = 20;
const MAX_CLOCK_DRIFT_MS = 10 * 60 * 1000;

// The ng-postcode mock returns random postcodes for reverse lookups. With this on,
// a mock response is treated as matching the property so you can test the happy path.
// Turn it off to test the "flagged" path. Ignored for real NIPOST responses.
const MOCK_ECHO = Deno.env.get("MOCK_ECHO_POSTCODE") === "true";

type Verdict = "verified" | "review" | "flagged";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const user = await getCaller(req);
  if (!user) return json({ error: "Sign in first" }, 401);

  const { checkin_id } = await req.json().catch(() => ({}));
  if (!checkin_id) return json({ error: "checkin_id is required" }, 400);

  const db = adminClient();
  const { data: c, error } = await db
    .from("checkins")
    .select("*, properties(id, postcode, anchored_at, anchor_lat, anchor_lng)")
    .eq("id", checkin_id)
    .single();
  if (error || !c) return json({ error: "Check-in not found" }, 404);
  if (c.reporter_id !== user.id) return json({ error: "Not your check-in" }, 403);
  if (c.verdict !== "pending") return json({ verdict: c.verdict, reason: c.verdict_reason });

  const property = c.properties as {
    id: string; postcode: string; anchored_at: string | null;
  };

  let result;
  try {
    result = await nipost.reverse(c.lat, c.lng, REVIEW_DISTANCE_M);
  } catch (e) {
    // Leave it pending; the app retries.
    const msg = e instanceof NipostError ? `${e.status} ${e.code}` : String(e);
    return json({ error: `NIPOST unavailable (${msg}). Check-in saved, verification will retry.` }, 502);
  }

  let unit = result.data.found ? result.data.unit ?? null : null;
  if (result.mock && MOCK_ECHO) {
    unit = { postcode: property.postcode, distance_m: 8, confidence: "high" };
  }

  const drift = Math.abs(new Date(c.server_time).getTime() - new Date(c.device_time).getTime());
  const expected = property.postcode;
  let verdict: Verdict;
  let reason: string;

  if (!c.is_anchor && !property.anchored_at) {
    [verdict, reason] = ["flagged", "Property hasn't been anchored yet. Do the anchor visit first."];
  } else if (c.is_mocked) {
    [verdict, reason] = ["flagged", "The phone reported a fake (mock) location."];
  } else if (!unit) {
    [verdict, reason] = ["flagged", `No NIPOST building within ${REVIEW_DISTANCE_M}m of where the photos were taken.`];
  } else if (unit.postcode !== expected) {
    [verdict, reason] = ["flagged", `Photos were taken at ${unit.postcode}, not ${expected}.`];
  } else if (
    unit.distance_m <= VERIFIED_DISTANCE_M &&
    c.gps_accuracy_m <= MAX_ACCURACY_M &&
    unit.confidence !== "low" &&
    drift <= MAX_CLOCK_DRIFT_MS
  ) {
    [verdict, reason] = ["verified", `Taken at ${expected}, ${Math.round(unit.distance_m)}m from the building.`];
  } else {
    const why: string[] = [];
    if (unit.distance_m > VERIFIED_DISTANCE_M) why.push(`${Math.round(unit.distance_m)}m away`);
    if (c.gps_accuracy_m > MAX_ACCURACY_M) why.push(`GPS accuracy ±${Math.round(c.gps_accuracy_m)}m`);
    if (unit.confidence === "low") why.push("low NIPOST confidence");
    if (drift > MAX_CLOCK_DRIFT_MS) why.push("phone clock out of sync");
    [verdict, reason] = ["review", `Right building, but ${why.join(", ")}.`];
  }

  const now = new Date().toISOString();
  await db.from("checkins").update({
    verdict,
    verdict_reason: reason,
    nipost_postcode: unit?.postcode ?? null,
    nipost_distance_m: unit?.distance_m ?? null,
    nipost_confidence: unit?.confidence ?? null,
    nipost_mock: result.mock,
    verified_at: verdict === "verified" ? now : null,
  }).eq("id", c.id);

  if (verdict === "verified" && c.is_anchor && !property.anchored_at) {
    await db.from("properties")
      .update({ anchored_at: now, anchor_lat: c.lat, anchor_lng: c.lng })
      .eq("id", property.id);
  }
  if (verdict === "verified" && c.milestone_id) {
    await db.from("milestones")
      .update({ completed_checkin_id: c.id })
      .eq("id", c.milestone_id)
      .is("completed_checkin_id", null);
  }
  // Next: notify the owner by email/push when verdict is flagged or review.

  return json({ verdict, reason, mock: result.mock });
});
