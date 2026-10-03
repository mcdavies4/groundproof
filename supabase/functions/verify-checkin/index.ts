// POST { checkin_id } -> decides the verdict for a check-in.
// 1. Device: emulators and fake (mock) locations are flagged.
// 2. Location: NIPOST reverse geocode must return the anchored postcode, close by, with good GPS.
// 3. Compass: at least one photo should face roughly the way the anchor's front photo did.
// 4. Photos: Claude compares the photos with the anchor photos and writes a progress note.
// Location decides verified/flagged; compass and photos can only downgrade "verified" to "review".
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { nipost, NipostError } from "../_shared/nipost.ts";
import { checkPhotos, headingDiff, type PhotoCheck } from "../_shared/photocheck.ts";

const VERIFIED_DISTANCE_M = 25;
const REVIEW_DISTANCE_M = 60;
const MAX_ACCURACY_M = 20;
const MAX_CLOCK_DRIFT_MS = 10 * 60 * 1000;
const HEADING_TOLERANCE_DEG = 45;

// Testing switches (Supabase secrets). Leave both unset in production.
const MOCK_ECHO = Deno.env.get("MOCK_ECHO_POSTCODE") === "true";   // mock NIPOST treats any spot as the property
const ALLOW_EMULATOR = Deno.env.get("ALLOW_EMULATOR") === "true";  // let emulator check-ins through

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
    .select("*, properties(id, postcode, anchored_at, anchor_front_heading)")
    .eq("id", checkin_id)
    .single();
  if (error || !c) return json({ error: "Check-in not found" }, 404);
  if (c.reporter_id !== user.id) return json({ error: "Not your check-in" }, 403);
  if (c.verdict !== "pending") return json({ verdict: c.verdict, reason: c.verdict_reason, note: c.photo_note });

  const property = c.properties as {
    id: string; postcode: string; anchored_at: string | null; anchor_front_heading: number | null;
  };
  const expected = property.postcode;

  // ---- 1. Device ----
  if ((c.is_emulator && !ALLOW_EMULATOR) || c.is_mocked) {
    const reason = c.is_emulator
      ? "Taken on an emulator, not a real phone."
      : "The phone reported a fake (mock) location.";
    await db.from("checkins").update({ verdict: "flagged", verdict_reason: reason }).eq("id", c.id);
    return json({ verdict: "flagged", reason });
  }

  // ---- 2. Location ----
  let result;
  try {
    result = await nipost.reverse(c.lat, c.lng, REVIEW_DISTANCE_M);
  } catch (e) {
    const msg = e instanceof NipostError ? `${e.status} ${e.code}` : String(e);
    return json({ error: `NIPOST unavailable (${msg}). Check-in saved, verification will retry.` }, 502);
  }

  let unit = result.data.found ? result.data.unit ?? null : null;
  if (result.mock && MOCK_ECHO) unit = { postcode: expected, distance_m: 8, confidence: "high" };

  const drift = Math.abs(new Date(c.server_time).getTime() - new Date(c.device_time).getTime());
  let verdict: Verdict;
  const reasons: string[] = [];

  if (!unit) {
    verdict = "flagged";
    reasons.push(`No NIPOST building within ${REVIEW_DISTANCE_M}m of where the photos were taken.`);
  } else if (unit.postcode !== expected) {
    verdict = "flagged";
    reasons.push(`Photos were taken at ${unit.postcode}, not ${expected}.`);
  } else if (
    unit.distance_m <= VERIFIED_DISTANCE_M &&
    c.gps_accuracy_m <= MAX_ACCURACY_M &&
    unit.confidence !== "low" &&
    drift <= MAX_CLOCK_DRIFT_MS
  ) {
    verdict = "verified";
    reasons.push(`Taken at ${expected}, ${Math.round(unit.distance_m)}m from the building.`);
  } else {
    verdict = "review";
    const why: string[] = [];
    if (unit.distance_m > VERIFIED_DISTANCE_M) why.push(`${Math.round(unit.distance_m)}m away`);
    if (c.gps_accuracy_m > MAX_ACCURACY_M) why.push(`GPS accuracy ±${Math.round(c.gps_accuracy_m)}m`);
    if (unit.confidence === "low") why.push("low NIPOST confidence");
    if (drift > MAX_CLOCK_DRIFT_MS) why.push("phone clock out of sync");
    reasons.push(`Right building, but ${why.join(", ")}.`);
  }

  // ---- 3. Compass (check-ins only, when we have both headings) ----
  const headings = ((c.photo_headings ?? []) as (number | null)[]).filter((h): h is number => typeof h === "number" && h >= 0);
  let headingOk: boolean | null = null;
  if (!c.is_anchor && verdict !== "flagged" && property.anchor_front_heading !== null && headings.length > 0) {
    headingOk = headings.some((h) => headingDiff(h, property.anchor_front_heading!) <= HEADING_TOLERANCE_DEG);
    if (!headingOk) {
      if (verdict === "verified") verdict = "review";
      reasons.push("None of the photos faced the way the anchor's front photo did.");
    }
  }

  // ---- 4. Photos (only worth comparing when the location matched) ----
  let photo: PhotoCheck = { match: "unavailable", reason: null, note: null };
  if (verdict !== "flagged") {
    let anchorPaths: string[] = [];
    let previousPaths: string[] = [];
    if (!c.is_anchor) {
      const { data: anchor } = await db
        .from("checkins").select("photo_paths")
        .eq("property_id", property.id).eq("is_anchor", true).eq("verdict", "verified")
        .order("server_time", { ascending: true }).limit(1).maybeSingle();
      anchorPaths = anchor?.photo_paths ?? [];
      const { data: prev } = await db
        .from("checkins").select("photo_paths")
        .eq("property_id", property.id).eq("is_anchor", false).eq("verdict", "verified")
        .neq("id", c.id).order("server_time", { ascending: false }).limit(1).maybeSingle();
      previousPaths = prev?.photo_paths ?? [];
    }
    photo = await checkPhotos(db, { anchorPaths, previousPaths, newPaths: c.photo_paths, isAnchor: c.is_anchor });
    if (!c.is_anchor && photo.match === "mismatch") {
      if (verdict === "verified") verdict = "review";
      reasons.push(`Photos don't look like the anchored building${photo.reason ? `: ${photo.reason}` : "."}`);
    }
  }

  const reason = reasons.join(" ");
  const now = new Date().toISOString();
  await db.from("checkins").update({
    verdict,
    verdict_reason: reason,
    nipost_postcode: unit?.postcode ?? null,
    nipost_distance_m: unit?.distance_m ?? null,
    nipost_confidence: unit?.confidence ?? null,
    nipost_mock: result.mock,
    verified_at: verdict === "verified" ? now : null,
    heading_ok: headingOk,
    photo_match: photo.match,
    photo_note: photo.note,
  }).eq("id", c.id);

  if (verdict === "verified" && c.is_anchor && !property.anchored_at) {
    await db.from("properties").update({
      anchored_at: now,
      anchor_lat: c.lat,
      anchor_lng: c.lng,
      anchor_front_heading: headings.length ? (c.photo_headings as (number | null)[])[0] ?? null : null,
    }).eq("id", property.id);
  }
  if (verdict === "verified" && c.milestone_id) {
    await db.from("milestones")
      .update({ completed_checkin_id: c.id })
      .eq("id", c.milestone_id)
      .is("completed_checkin_id", null);
  }

  return json({ verdict, reason, note: photo.note, mock: result.mock });
});
