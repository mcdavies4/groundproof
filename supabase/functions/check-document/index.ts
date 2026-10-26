// POST { document_id } -> reads an uploaded document and tests it for consistency. Deploy with --no-verify-jwt (it checks the caller itself).
// Owner only. Writes what was read, the findings and a status onto the document row.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { areaM2 } from "../_shared/plotcheck.ts";
import { analyseDocument, normalizePlanNumber, readDocument, type DocKind } from "../_shared/doccheck.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const user = await getCaller(req);
  if (!user) return json({ error: "Sign in first" }, 401);
  const { document_id } = await req.json().catch(() => ({})) as { document_id?: string };
  if (!document_id) return json({ error: "document_id is required" }, 400);

  const db = adminClient();
  const { data: doc } = await db.from("property_documents").select("*").eq("id", document_id).maybeSingle();
  if (!doc) return json({ error: "Not found" }, 404);
  const { data: property } = await db.from("properties")
    .select("id, owner_id, beacons, nipost_address").eq("id", doc.property_id).maybeSingle();
  if (!property || property.owner_id !== user.id) return json({ error: "Not found" }, 404);

  const extracted = await readDocument(db, doc.file_path);
  const norm = normalizePlanNumber(extracted?.plan_number);

  // The same plan number on a different property (any owner). Only the count is used, never who.
  let others = 0;
  if (norm) {
    const { count } = await db.from("property_documents").select("id", { count: "exact", head: true })
      .eq("plan_number_norm", norm).neq("property_id", property.id);
    others = count ?? 0;
  }

  const beacons = Array.isArray(property.beacons) ? property.beacons as { lat: number; lng: number }[] : null;
  const admin = property.nipost_address?.administrative;
  const { status, findings } = analyseDocument(extracted, {
    kind: doc.kind as DocKind,
    plotBeaconCount: beacons ? beacons.length : null,
    plotAreaM2: beacons ? areaM2(beacons) : null,
    nipostState: admin?.state_name ?? null,
    nipostLga: admin?.lga_name ?? null,
    otherPropertiesWithSamePlan: others,
    today: new Date(),
  });

  await db.from("property_documents").update({
    status, findings, extracted, plan_number_norm: norm, checked_at: new Date().toISOString(),
  }).eq("id", doc.id);

  return json({ status, findings });
});
