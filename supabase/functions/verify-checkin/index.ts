// POST { checkin_id } -> decides the verdict for a check-in.
// 1. Device: emulators and fake (mock) locations are flagged.
// 2. Location, by the property's anchor mode:
//    - postcode: NIPOST reverse geocode must return the property's postcode, close by, with good GPS.
//    - coordinates (no NIPOST building yet): the photos must be taken close to the anchored spot.
//    Anchor visits for properties without a postcode either confirm the postcode found on site
//    or anchor to the exact coordinates.
// 3. Compass: at least one photo should face roughly the way the anchor's front photo did.
// 4. Photos: Claude compares the photos with the anchor photos and writes a progress note.
// Location decides verified/flagged; compass and photos can only downgrade "verified" to "review".
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { nipost, NipostError, type ReverseData } from "../_shared/nipost.ts";
import { checkPhotos, headingDiff, type PhotoCheck } from "../_shared/photocheck.ts";
import { distanceM } from "../_shared/geo.ts";

const VERIFIED_DISTANCE_M = 25;
const REVIEW_DISTANCE_M = 60;
const MAX_ACCURACY_M = 20;
const MAX_CLOCK_DRIFT_MS = 10 * 60 * 1000;
const HEADING_TOLERANCE_DEG = 45;

// Testing switches (Supabase secrets). Leave both unset in production.
const MOCK_ECHO = Deno.env.get("MOCK_ECHO_POSTCODE") === "true";
const ALLOW_EMULATOR = Deno.env.get("ALLOW_EMULATOR") === "true";

type Verdict = "verified" | "review" | "flagged";
type Unit = NonNullable<ReverseData["unit"]>;

interface Property {
  id: string; postcode: string | null; anchored_at: string | null; anchor_front_heading: number | null;
  anchor_mode: "postcode" | "coordinates" | null; anchor_lat: number | null; anchor_lng: number | null;
  nipost_suggested_postcode: string | null;
}

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
    .select("*, properties(id, postcode, anchored_at, anchor_front_heading, anchor_mode, anchor_lat, anchor_lng, nipost_suggested_postcode)")
    .eq("id", checkin_id)
    .single();
  if (error || !c) return json({ error: "Check-in not found" }, 404);
  if (c.reporter_id !== user.id) return json({ error: "Not your check-in" }, 403);
  if (c.verdict !== "pending") return json({ verdict: c.verdict, reason: c.verdict_reason, note: c.photo_note });

  const property = c.properties as Property;

  // ---- 1. Device ----
  if ((c.is_emulator && !ALLOW_EMULATOR) || c.is_mocked) {
    const reason = c.is_emulator ? "Taken on an emulator, not a real phone." : "The phone reported a fake (mock) location.";
    await db.from("checkins").update({ verdict: "flagged", verdict_reason: reason }).eq("id", c.id);
    return json({ verdict: "flagged", reason });
  }

  // ---- 2. Location ----
  let rev: { data: ReverseData; mock: boolean };
  try {
    rev = await nipost.reverse(c.lat, c.lng, REVIEW_DISTANCE_M);
  } catch (e) {
    const msg = e instanceof NipostError ? `${e.status} ${e.code}` : String(e);
    return json({ error: `NIPOST unavailable (${msg}). Check-in saved, verification will retry.` }, 502);
  }
  let unit: Unit | null = rev.data.found ? rev.data.unit ?? null : null;

  const drift = Math.abs(new Date(c.server_time).getTime() - new Date(c.device_time).getTime());
  const goodSignal = c.gps_accuracy_m <= MAX_ACCURACY_M && drift <= MAX_CLOCK_DRIFT_MS;
  const signalWhy = () => {
    const why: string[] = [];
    if (c.gps_accuracy_m > MAX_ACCURACY_M) why.push(`GPS accuracy ±${Math.round(c.gps_accuracy_m)}m`);
    if (drift > MAX_CLOCK_DRIFT_MS) why.push("phone clock out of sync");
    return why;
  };

  let verdict: Verdict;
  let matchType: "postcode" | "coordinates";
  let distanceFromAnchor: number | null = null;
  let newPostcode: string | null = null;            // postcode confirmed on site at the anchor
  let anchorMode: "postcode" | "coordinates" | null = null;
  let suggestion: string | null = null;              // NIPOST building seen at a coordinates-anchored spot
  const reasons: string[] = [];

  /** The postcode check, against an expected postcode. */
  const postcodeCheck = (expected: string) => {
    if (rev.mock && MOCK_ECHO) unit = { postcode: expected, distance_m: 8, confidence: "high" } as Unit;
    if (!unit) {
      verdict = "flagged";
      reasons.push(`No NIPOST building within ${REVIEW_DISTANCE_M}m of where the photos were taken.`);
    } else if (unit.postcode !== expected) {
      verdict = "flagged";
      reasons.push(`Photos were taken at ${unit.postcode}, not ${expected}.`);
    } else if (unit.distance_m <= VERIFIED_DISTANCE_M && unit.confidence !== "low" && goodSignal) {
      verdict = "verified";
      reasons.push(`Taken at ${expected}, ${Math.round(unit.distance_m)}m from the building.`);
    } else {
      verdict = "review";
      const why = signalWhy();
      if (unit.distance_m > VERIFIED_DISTANCE_M) why.unshift(`${Math.round(unit.distance_m)}m away`);
      if (unit.confidence === "low") why.push("low NIPOST confidence");
      reasons.push(`Right building, but ${why.join(", ")}.`);
    }
  };

  const nipostSeesBuildingHere = () =>
    unit && unit.distance_m <= VERIFIED_DISTANCE_M && unit.confidence !== "low" ? unit.postcode : null;

  if (c.is_anchor && property.postcode) {
    // Anchor visit, postcode already known.
    matchType = "postcode";
    postcodeCheck(property.postcode);
    anchorMode = "postcode";
  } else if (c.is_anchor && c.anchor_choice === "postcode" && c.claimed_postcode) {
    // Anchor visit: reporter confirmed the postcode NIPOST showed them on site.
    matchType = "postcode";
    postcodeCheck(c.claimed_postcode);
    newPostcode = c.claimed_postcode;
    anchorMode = "postcode";
  } else if (c.is_anchor) {
    // Anchor visit with no postcode: lock to this exact spot.
    matchType = "coordinates";
    anchorMode = "coordinates";
    if (goodSignal) {
      verdict = "verified";
      reasons.push("Anchored to this exact spot. NIPOST has no building listed here yet, so check-ins are matched by location.");
    } else {
      verdict = "review";
      reasons.push(`Couldn't anchor: ${signalWhy().join(", ")}. Try again outside, away from walls.`);
    }
    suggestion = nipostSeesBuildingHere();
    if (suggestion) reasons.push(`NIPOST lists ${suggestion} here, but the reporter said it isn't this building.`);
  } else if (property.anchor_mode === "coordinates" && property.anchor_lat !== null && property.anchor_lng !== null) {
    // Check-in on a coordinates-anchored property.
    matchType = "coordinates";
    distanceFromAnchor = distanceM(c.lat, c.lng, property.anchor_lat, property.anchor_lng);
    const d = Math.round(distanceFromAnchor);
    if (distanceFromAnchor > REVIEW_DISTANCE_M) {
      verdict = "flagged";
      reasons.push(`Taken ${d}m from the anchored spot.`);
    } else if (distanceFromAnchor <= VERIFIED_DISTANCE_M && goodSignal) {
      verdict = "verified";
      reasons.push(`Location match: ${d}m from the anchored spot. (No NIPOST postcode here yet.)`);
    } else {
      verdict = "review";
      const why = signalWhy();
      if (distanceFromAnchor > VERIFIED_DISTANCE_M) why.unshift(`${d}m from the anchored spot`);
      reasons.push(`Near the anchored spot, but ${why.join(", ")}.`);
    }
    if (!property.nipost_suggested_postcode) suggestion = nipostSeesBuildingHere();
  } else {
    // Check-in on a postcode-anchored property.
    matchType = "postcode";
    postcodeCheck(property.postcode!);
  }

  // ---- 3. Compass (check-ins only, when we have both headings) ----
  const headings = ((c.photo_headings ?? []) as (number | null)[]).filter((h): h is number => typeof h === "number" && h >= 0);
  let headingOk: boolean | null = null;
  if (!c.is_anchor && verdict! !== "flagged" && property.anchor_front_heading !== null && headings.length > 0) {
    headingOk = headings.some((h) => headingDiff(h, property.anchor_front_heading!) <= HEADING_TOLERANCE_DEG);
    if (!headingOk) {
      if (verdict! === "verified") verdict = "review";
      reasons.push("None of the photos faced the way the anchor's front photo did.");
    }
  }

  // ---- 4. Photos (only worth comparing when the location matched) ----
  let photo: PhotoCheck = { match: "unavailable", reason: null, note: null };
  if (verdict! !== "flagged") {
    let anchorPaths: string[] = [];
    let previousPaths: string[] = [];
    if (!c.is_anchor) {
      const { data: anchor } = await db.from("checkins").select("photo_paths")
        .eq("property_id", property.id).eq("is_anchor", true).eq("verdict", "verified")
        .order("server_time", { ascending: true }).limit(1).maybeSingle();
      anchorPaths = anchor?.photo_paths ?? [];
      const { data: prev } = await db.from("checkins").select("photo_paths")
        .eq("property_id", property.id).eq("is_anchor", false).eq("verdict", "verified")
        .neq("id", c.id).order("server_time", { ascending: false }).limit(1).maybeSingle();
      previousPaths = prev?.photo_paths ?? [];
    }
    photo = await checkPhotos(db, { anchorPaths, previousPaths, newPaths: c.photo_paths, isAnchor: c.is_anchor });
    if (!c.is_anchor && photo.match === "mismatch") {
      if (verdict! === "verified") verdict = "review";
      reasons.push(`Photos don't look like the anchored building${photo.reason ? `: ${photo.reason}` : "."}`);
    }
  }

  const reason = reasons.join(" ");
  const now = new Date().toISOString();
  const finalUnit = unit as Unit | null;
  await db.from("checkins").update({
    verdict: verdict!,
    verdict_reason: reason,
    match_type: matchType!,
    distance_from_anchor_m: distanceFromAnchor,
    nipost_postcode: finalUnit?.postcode ?? null,
    nipost_distance_m: finalUnit?.distance_m ?? null,
    nipost_confidence: finalUnit?.confidence ?? null,
    nipost_mock: rev.mock,
    verified_at: verdict! === "verified" ? now : null,
    heading_ok: headingOk,
    photo_match: photo.match,
    photo_note: photo.note,
  }).eq("id", c.id);

  if (verdict! === "verified" && c.is_anchor && !property.anchored_at) {
    await db.from("properties").update({
      anchored_at: now,
      anchor_lat: c.lat,
      anchor_lng: c.lng,
      anchor_mode: anchorMode,
      ...(newPostcode ? { postcode: newPostcode } : {}),
      ...(suggestion ? { nipost_suggested_postcode: suggestion } : {}),
      anchor_front_heading: headings.length ? (c.photo_headings as (number | null)[])[0] ?? null : null,
    }).eq("id", property.id);
  } else if (suggestion && !c.is_anchor) {
    await db.from("properties").update({ nipost_suggested_postcode: suggestion }).eq("id", property.id);
  }
  if (verdict! === "verified" && c.milestone_id) {
    await db.from("milestones").update({ completed_checkin_id: c.id })
      .eq("id", c.milestone_id).is("completed_checkin_id", null);
  }

  return json({ verdict: verdict!, reason, note: photo.note, match_type: matchType!, mock: rev.mock });
});
