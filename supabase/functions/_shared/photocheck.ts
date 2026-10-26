/**
 * AI photo comparison with Claude (vision). Compares a check-in's photos with the anchor photos.
 * Docs: https://docs.claude.com/en/api/overview
 * Location remains the proof; this is a second opinion that can only downgrade "verified" to "review".
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const MODEL = () => Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001";

export type PhotoMatch = "match" | "mismatch" | "unsure" | "unavailable";
export interface PhotoCheck {
  match: PhotoMatch; reason: string | null; note: string | null;
  /** Do the photos fit the stage the owner is paying for? null when no stage was named. */
  stage: { match: PhotoMatch; reason: string | null } | null;
  /** Four-digit numbers Claude could read in the photos, when a challenge code was required. null otherwise. */
  digits: string[] | null;
}
const NONE = { stage: null, digits: null } as const;

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

/** Extra questions, added to the compare prompt only when they apply. */
const stagePrompt = (stage: string) => `
3. The owner is paying for the stage "${stage}". Say whether the NEW photos fit that stage being under way or finished.
   Answer "no" only when the photos clearly contradict it (for example "Roofing" but no roof, only walls or foundation).
   Answer "unsure" when the photos don't show the part of the building that would tell.`;
const CODE_PROMPT = `
4. If a handwritten or printed number of exactly four digits is clearly visible in any NEW photo (for example on a sheet of paper), list it. Read only what is there; never guess digits.`;
const jsonLine = (stage: boolean, code: boolean) =>
  `{"same_building":"yes"|"no"|"unsure","reason":"<max 20 words>","progress_note":"<max 30 words>"${stage ? `,"stage_fits":"yes"|"no"|"unsure","stage_reason":"<max 20 words>"` : ""}${code ? `,"code_digits":["<4 digits>"]` : ""}}`;

const DESCRIBE_PROMPT = `You check photos for a property-monitoring service in Nigeria.
These are the ANCHOR photos of a building (front, left side, right side, street), taken when monitoring began.
Write one short sentence for the owner describing the building's current state (e.g. stage of construction, storeys, roof, finish). Only describe what you can see.

Respond with JSON only, no other text:
{"same_building":"yes","reason":"anchor","progress_note":"<max 30 words>"}`;

export async function checkPhotos(
  db: SupabaseClient,
  args: { anchorPaths: string[]; previousPaths: string[]; newPaths: string[]; isAnchor: boolean; stageName?: string | null; wantCode?: boolean },
): Promise<PhotoCheck> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { match: "unavailable", reason: "Photo check not configured", note: null, ...NONE };

  try {
    const content: unknown[] = [];
    if (args.isAnchor) {
      content.push({ type: "text", text: "ANCHOR photos:" }, ...(await loadImages(db, args.newPaths.slice(0, 4))));
      content.push({ type: "text", text: DESCRIBE_PROMPT });
    } else {
      const anchor = await loadImages(db, args.anchorPaths.slice(0, 4));
      if (anchor.length === 0) return { match: "unavailable", reason: "No anchor photos to compare", note: null, ...NONE };
      content.push({ type: "text", text: "ANCHOR photos:" }, ...anchor);
      const prev = await loadImages(db, args.previousPaths.slice(0, 2));
      if (prev.length) content.push({ type: "text", text: "PREVIOUS photos:" }, ...prev);
      content.push({ type: "text", text: "NEW photos:" }, ...(await loadImages(db, args.newPaths.slice(0, 4))));
      const stage = args.stageName?.trim() || null;
      const base = COMPARE_PROMPT.slice(0, COMPARE_PROMPT.indexOf("\nRespond with JSON only"));
      content.push({
        type: "text",
        text: `${base}${stage ? stagePrompt(stage) : ""}${args.wantCode ? CODE_PROMPT : ""}\n\nRespond with JSON only, no other text:\n${jsonLine(Boolean(stage), Boolean(args.wantCode))}`,
      });
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
      return { match: "unavailable", reason: `Photo check failed (${res.status})`, note: null, ...NONE };
    }
    const body = await res.json();
    const text: string = (body.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

    const match: PhotoMatch =
      parsed.same_building === "yes" ? "match" : parsed.same_building === "no" ? "mismatch" : "unsure";
    const stageName = args.stageName?.trim() || null;
    const stage = !args.isAnchor && stageName
      ? {
          match: (parsed.stage_fits === "yes" ? "match" : parsed.stage_fits === "no" ? "mismatch" : "unsure") as PhotoMatch,
          reason: typeof parsed.stage_reason === "string" ? parsed.stage_reason.slice(0, 200) : null,
        }
      : null;
    const digits = args.wantCode && !args.isAnchor
      ? (Array.isArray(parsed.code_digits) ? parsed.code_digits : []).map((d: unknown) => String(d).replace(/\D/g, "")).filter((d: string) => d.length === 4)
      : null;
    return {
      match,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : null,
      note: typeof parsed.progress_note === "string" ? parsed.progress_note.slice(0, 300) : null,
      stage, digits,
    };
  } catch (e) {
    console.error("photo check error", e);
    return { match: "unavailable", reason: "Photo check failed", note: null, ...NONE };
  }
}

/** Smallest angle between two compass headings, 0-180. */
export function headingDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}


export type AuditResult = "agree" | "disagree" | "unsure" | "unavailable";

const AUDIT_PROMPT = (stage: string | null) => `You compare two independent visits to the same building site in Nigeria, done by two different reporters.
ORIGINAL photos are from the first visit, with that reporter's notes. SECOND photos are from the second reporter, taken separately and possibly some days later.
${stage ? `The owner is paying for the stage "${stage}".` : ""}

Decide whether the SECOND visit agrees with the ORIGINAL about what is there and how far the work has got.
- "yes": same building and a consistent state of work. Some progress between the two dates is normal.
- "no": only when they clearly contradict each other, for example one shows a finished roof and the other no roof, or they appear to be different buildings.
- "unsure": the photos don't show the same parts, or you can't tell.
Describe only what you can see.

Respond with JSON only, no other text:
{"agree":"yes"|"no"|"unsure","reason":"<max 25 words>"}`;

/** Compares an audit visit with the visit it double-checks. Can only inform the owner; never changes a verdict. */
export async function compareVisits(
  db: SupabaseClient,
  args: { originalPaths: string[]; newPaths: string[]; stageName: string | null; originalNote: string | null; originalProgress: string | null },
): Promise<{ result: AuditResult; reason: string | null }> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { result: "unavailable", reason: null };
  try {
    const orig = await loadImages(db, args.originalPaths.slice(0, 4));
    const next = await loadImages(db, args.newPaths.slice(0, 4));
    if (!orig.length || !next.length) return { result: "unavailable", reason: null };
    const said = [args.originalNote && `Reporter's note: ${args.originalNote}`, args.originalProgress && `Earlier description: ${args.originalProgress}`].filter(Boolean).join("\n");
    const content: unknown[] = [
      { type: "text", text: `ORIGINAL photos:${said ? `\n${said}` : ""}` }, ...orig,
      { type: "text", text: "SECOND photos:" }, ...next,
      { type: "text", text: AUDIT_PROMPT(args.stageName) },
    ];
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL(), max_tokens: 300, messages: [{ role: "user", content }] }),
    });
    if (!res.ok) { console.error("audit compare error", res.status, await res.text()); return { result: "unavailable", reason: null }; }
    const body = await res.json();
    const text: string = (body.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return {
      result: parsed.agree === "yes" ? "agree" : parsed.agree === "no" ? "disagree" : "unsure",
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : null,
    };
  } catch (e) {
    console.error("audit compare failed", e);
    return { result: "unavailable", reason: null };
  }
}
