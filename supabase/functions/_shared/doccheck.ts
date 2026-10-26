/**
 * Document consistency check. Claude reads a survey plan, Certificate of Occupancy or deed; plain code then tests
 * what it read. Two separate steps on purpose: the AI only transcribes, and every judgement is a rule you can read.
 *
 * This is a consistency check. It cannot tell whether a document is genuine, and it is not a title search.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type DocKind = "survey_plan" | "c_of_o" | "deed" | "other";
export interface Extracted {
  document_type: string | null;
  plan_number: string | null;
  surveyor_name: string | null;
  surveyor_registration: string | null;
  survey_date: string | null;          // YYYY-MM-DD when readable
  state: string | null;
  lga: string | null;
  locality: string | null;
  area_m2: number | null;
  area_text: string | null;            // the area exactly as written on the document
  beacon_count: number | null;
  has_stamp_or_signature: boolean | null;
  legible: "good" | "fair" | "poor";
}
export interface Finding { level: "ok" | "warn" | "info"; text: string }
export interface Context {
  kind: DocKind;
  plotBeaconCount: number | null;      // from the property's own survey plan, when it is a plot
  plotAreaM2: number | null;
  nipostState: string | null;
  nipostLga: string | null;
  otherPropertiesWithSamePlan: number;
  today: Date;
}

/** "LA/2014/123", "la 2014 123" and "LA-2014-123" are the same plan. Needs 4+ characters and a digit to count as a plan number. */
export function normalizePlanNumber(s: string | null | undefined): string | null {
  const n = String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return n.length >= 4 && /\d/.test(n) ? n : null;
}

const place = (s: string | null | undefined) =>
  String(s ?? "").toLowerCase().replace(/local government area|local government|\blga\b|\bstate\b|[^a-z]/g, "");
/** Loose match: one name contains the other ("Ikorodu" and "Ikorodu LGA"). */
const sameplace = (a: string, b: string) => a !== "" && b !== "" && (a.includes(b) || b.includes(a));

export function analyseDocument(x: Extracted | null, ctx: Context): { status: "consistent" | "review" | "unreadable"; findings: Finding[] } {
  if (!x) return { status: "unreadable", findings: [{ level: "warn", text: "The document couldn't be read. Upload a clearer photo or a PDF." }] };

  const f: Finding[] = [];
  const warn = (text: string) => f.push({ level: "warn", text });
  const ok = (text: string) => f.push({ level: "ok", text });
  const info = (text: string) => f.push({ level: "info", text });

  const nothingRead = !x.plan_number && x.area_m2 === null && !x.state && !x.lga;
  if (x.legible === "poor" && nothingRead) {
    return { status: "unreadable", findings: [{ level: "warn", text: "The document is too hard to read. Upload a clearer photo, taken flat and in good light, or a PDF." }] };
  }
  if (x.legible === "poor") warn("Parts of the document were hard to read, so some checks below may be missing.");

  const plan = normalizePlanNumber(x.plan_number);
  const survey = ctx.kind === "survey_plan";

  // Completeness
  if (plan) ok(`Plan number read: ${x.plan_number}.`);
  else if (survey) warn("No plan number could be read. Every registered survey plan has one.");
  if (survey) {
    if (!x.surveyor_name && !x.surveyor_registration) warn("No surveyor's name or registration number could be read.");
    else ok(`Surveyor: ${[x.surveyor_name, x.surveyor_registration].filter(Boolean).join(", ")}.`);
    if (x.has_stamp_or_signature === false) warn("No surveyor's stamp or signature was visible.");
    if (x.beacon_count !== null && x.beacon_count < 3) warn("Fewer than 3 beacon points were listed. A plot needs at least 3.");
    if (x.area_m2 === null) warn("No area could be read.");
  }

  // Date
  if (x.survey_date) {
    const d = new Date(x.survey_date + "T12:00:00Z");
    if (Number.isNaN(d.getTime())) info(`Date as read: ${x.survey_date}.`);
    else if (d.getTime() > ctx.today.getTime() + 86_400_000) warn(`The document is dated ${x.survey_date}, which is in the future.`);
    else ok(`Dated ${x.survey_date}.`);
  } else if (survey) warn("No date could be read.");

  // Area against the plot's own survey plan
  if (x.area_m2 !== null && ctx.plotAreaM2 !== null && ctx.plotAreaM2 > 0) {
    const ratio = x.area_m2 / ctx.plotAreaM2;
    if (ratio >= 0.9 && ratio <= 1.1) ok(`The area on the document (${Math.round(x.area_m2)} m²) matches the plot's beacons (${Math.round(ctx.plotAreaM2)} m²).`);
    else warn(`The document gives ${Math.round(x.area_m2)} m² (${x.area_text ?? "as read"}), but the plot's beacons make ${Math.round(ctx.plotAreaM2)} m². One of them may be wrong.`);
  } else if (x.area_m2 !== null) {
    info(`Area on the document: ${x.area_text ?? `${Math.round(x.area_m2)} m²`}.`);
  }

  // Beacon count against the plot
  if (x.beacon_count !== null && ctx.plotBeaconCount !== null && x.beacon_count !== ctx.plotBeaconCount) {
    warn(`The document lists ${x.beacon_count} beacons, but this plot was set up with ${ctx.plotBeaconCount}.`);
  }

  // Location against the property's NIPOST address
  const dState = place(x.state), dLga = place(x.lga);
  const pState = place(ctx.nipostState), pLga = place(ctx.nipostLga);
  if (pState || pLga) {
    const bad: string[] = [];
    if (dState && pState && !sameplace(dState, pState)) bad.push(`state ${x.state} (NIPOST says ${ctx.nipostState})`);
    if (dLga && pLga && !sameplace(dLga, pLga)) bad.push(`local government ${x.lga} (NIPOST says ${ctx.nipostLga})`);
    if (bad.length) warn(`The document's location doesn't match this property's address: ${bad.join("; ")}.`);
    else if ((dState && pState) || (dLga && pLga)) ok(`The document's location (${[x.lga, x.state].filter(Boolean).join(", ")}) matches this property's address.`);
  }

  // The same plan on another Groundproof property
  if (plan && ctx.otherPropertiesWithSamePlan > 0) {
    warn("This plan number is already attached to another property on Groundproof. The same plan being sold twice is a common fraud: ask your lawyer to search the registry before you pay.");
  }

  const status = f.some((i) => i.level === "warn") ? "review" : "consistent";
  return { status, findings: f };
}

// ---------- reading the document with Claude ----------

const MODEL = () => Deno.env.get("ANTHROPIC_DOC_MODEL") || "claude-sonnet-5-5";

const PROMPT = `You transcribe Nigerian property documents: survey plans, Certificates of Occupancy, deeds of assignment.
Read ONLY what is printed or written on the document. Never guess. Use null for anything you cannot read.
Convert the area to square metres yourself (1 hectare = 10000 m², 1 acre = 4046.86 m²) and also copy the area exactly as written.
Count the beacon points listed (for example PL/Beacon numbers with coordinates), or null if none are listed.

Respond with JSON only, no other text:
{"document_type":"survey plan"|"certificate of occupancy"|"deed"|"other"|null,
 "plan_number":string|null,"surveyor_name":string|null,"surveyor_registration":string|null,
 "survey_date":"YYYY-MM-DD"|null,"state":string|null,"lga":string|null,"locality":string|null,
 "area_m2":number|null,"area_text":string|null,"beacon_count":number|null,
 "has_stamp_or_signature":true|false|null,"legible":"good"|"fair"|"poor"}`;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const str = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** Cleans whatever the model returned into the Extracted shape, so nothing odd reaches the database. */
export function sanitizeExtracted(p: Record<string, unknown>): Extracted {
  const date = str(p.survey_date, 10);
  return {
    document_type: str(p.document_type, 40),
    plan_number: str(p.plan_number, 60),
    surveyor_name: str(p.surveyor_name),
    surveyor_registration: str(p.surveyor_registration, 60),
    survey_date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    state: str(p.state, 60), lga: str(p.lga, 80), locality: str(p.locality, 120),
    area_m2: num(p.area_m2), area_text: str(p.area_text, 60),
    beacon_count: typeof p.beacon_count === "number" && Number.isInteger(p.beacon_count) && p.beacon_count >= 0 && p.beacon_count <= 60 ? p.beacon_count : null,
    has_stamp_or_signature: typeof p.has_stamp_or_signature === "boolean" ? p.has_stamp_or_signature : null,
    legible: p.legible === "good" || p.legible === "poor" ? p.legible : "fair",
  };
}

export async function readDocument(db: SupabaseClient, path: string): Promise<Extracted | null> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return null;
  try {
    const { data, error } = await db.storage.from("property-docs").download(path);
    if (error || !data) return null;
    const mime = path.endsWith(".pdf") ? "application/pdf" : path.endsWith(".png") ? "image/png" : "image/jpeg";
    const block = mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: mime, data: toBase64(await data.arrayBuffer()) } }
      : { type: "image", source: { type: "base64", media_type: mime, data: toBase64(await data.arrayBuffer()) } };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL(), max_tokens: 700, messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }] }),
    });
    if (!res.ok) { console.error("document read error", res.status, await res.text()); return null; }
    const body = await res.json();
    const text: string = (body.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    return sanitizeExtracted(JSON.parse(text.replace(/```json|```/g, "").trim()));
  } catch (e) {
    console.error("document read failed", e);
    return null;
  }
}
