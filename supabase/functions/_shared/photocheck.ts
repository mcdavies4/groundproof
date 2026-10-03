/**
 * AI photo comparison with Claude (vision). Compares a check-in's photos with the anchor photos.
 * Docs: https://docs.claude.com/en/api/overview
 * Location remains the proof; this is a second opinion that can only downgrade "verified" to "review".
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const MODEL = () => Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001";

export type PhotoMatch = "match" | "mismatch" | "unsure" | "unavailable";
export interface PhotoCheck { match: PhotoMatch; reason: string | null; note: string | null }

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function loadImages(db: SupabaseClient, paths: string[]) {
  const out: { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } }[] = [];
  for (const p of paths) {
    const { data, error } = await db.storage.from("checkins").download(p);
    if (error || !data) continue;
    out.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: toBase64(await data.arrayBuffer()) } });
  }
  return out;
}

const COMPARE_PROMPT = `You check photos for a property-monitoring service in Nigeria.
ANCHOR photos show the registered building when monitoring began (front, left side, right side, street).
PREVIOUS photos, if any, are from the last verified visit. NEW photos were just taken at the same GPS location.

1. Decide whether the NEW photos show the same building or plot as the ANCHOR photos.
   Construction progress (new walls, roofing, plastering, painting, scaffolding, materials on site) is expected and does NOT make it a different building.
   Judge by fixed features: plot layout, neighbouring buildings, gate, fence, trees, road, poles, terrain.
   If the NEW photos are only close-ups that can't be matched either way, answer "unsure".
2. Write one short sentence for the owner describing what is visible now and any change since the PREVIOUS (or ANCHOR) photos. Only describe what you can see.

Respond with JSON only, no other text:
{"same_building":"yes"|"no"|"unsure","reason":"<max 20 words>","progress_note":"<max 30 words>"}`;

const DESCRIBE_PROMPT = `You check photos for a property-monitoring service in Nigeria.
These are the ANCHOR photos of a building (front, left side, right side, street), taken when monitoring began.
Write one short sentence for the owner describing the building's current state (e.g. stage of construction, storeys, roof, finish). Only describe what you can see.

Respond with JSON only, no other text:
{"same_building":"yes","reason":"anchor","progress_note":"<max 30 words>"}`;

export async function checkPhotos(
  db: SupabaseClient,
  args: { anchorPaths: string[]; previousPaths: string[]; newPaths: string[]; isAnchor: boolean },
): Promise<PhotoCheck> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { match: "unavailable", reason: "Photo check not configured", note: null };

  try {
    const content: unknown[] = [];
    if (args.isAnchor) {
      content.push({ type: "text", text: "ANCHOR photos:" }, ...(await loadImages(db, args.newPaths.slice(0, 4))));
      content.push({ type: "text", text: DESCRIBE_PROMPT });
    } else {
      const anchor = await loadImages(db, args.anchorPaths.slice(0, 4));
      if (anchor.length === 0) return { match: "unavailable", reason: "No anchor photos to compare", note: null };
      content.push({ type: "text", text: "ANCHOR photos:" }, ...anchor);
      const prev = await loadImages(db, args.previousPaths.slice(0, 2));
      if (prev.length) content.push({ type: "text", text: "PREVIOUS photos:" }, ...prev);
      content.push({ type: "text", text: "NEW photos:" }, ...(await loadImages(db, args.newPaths.slice(0, 4))));
      content.push({ type: "text", text: COMPARE_PROMPT });
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: MODEL(), max_tokens: 400, messages: [{ role: "user", content }] }),
    });
    if (!res.ok) {
      console.error("claude error", res.status, await res.text());
      return { match: "unavailable", reason: `Photo check failed (${res.status})`, note: null };
    }
    const body = await res.json();
    const text: string = (body.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

    const match: PhotoMatch =
      parsed.same_building === "yes" ? "match" : parsed.same_building === "no" ? "mismatch" : "unsure";
    return {
      match,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : null,
      note: typeof parsed.progress_note === "string" ? parsed.progress_note.slice(0, 300) : null,
    };
  } catch (e) {
    console.error("photo check error", e);
    return { match: "unavailable", reason: "Photo check failed", note: null };
  }
}

/** Smallest angle between two compass headings, 0-180. */
export function headingDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
