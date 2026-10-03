// POST { label, postcode } -> creates a property owned by the caller after NIPOST validation.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { nipost, NipostError, normalisePostcode, type LookupData } from "../_shared/nipost.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const user = await getCaller(req);
  if (!user) return json({ error: "Sign in to add a property" }, 401);

  const { label, postcode } = await req.json().catch(() => ({}));
  if (!label || typeof label !== "string" || label.trim().length === 0) {
    return json({ error: "Give the property a name, for example \"Mum's house, Enugu\"" }, 400);
  }
  const code = normalisePostcode(String(postcode ?? ""));
  if (!code) {
    return json({ error: "That postcode isn't in NIPOST format. It looks like LA-11-W06-TC-10." }, 400);
  }

  // 1. Does the postcode exist? (L1, free)
  let l1;
  try {
    l1 = await nipost.lookup(code, 1);
  } catch (e) {
    const msg = e instanceof NipostError ? `${e.status} ${e.code}` : String(e);
    return json({ error: `NIPOST lookup failed (${msg}). Try again shortly.` }, 502);
  }
  if (!l1.data?.valid) {
    return json({ error: `NIPOST has no active building at ${code}. Check the code on postcode.gov.ng.` }, 422);
  }

  // 2. Best available detail: try L3, fall back to L2, then L1 only.
  let detail: LookupData = l1.data;
  let level: 1 | 2 | 3 = 1;
  for (const lv of [3, 2] as const) {
    try {
      const r = await nipost.lookup(code, lv);
      detail = r.data;
      level = lv;
      break;
    } catch (e) {
      // Key not granted this level yet, or out of credits: fall back to the next level down.
      if (
        e instanceof NipostError &&
        ([402, 403].includes(e.status) ||
          ["level_not_granted", "insufficient_scope", "insufficient_credits"].includes(e.code))
      ) continue;
      throw e;
    }
  }

  const db = adminClient();
  const { data: property, error } = await db
    .from("properties")
    .insert({
      owner_id: user.id,
      label: label.trim(),
      postcode: code,
      nipost_address: {
        administrative: detail.administrative_address ?? null,
        recent_house_address: detail.recent_house_address?.recent ?? null,
        mock: l1.mock,
      },
      nipost_building_use: detail.building_use_status ?? null,
      nipost_level: level,
    })
    .select()
    .single();
  if (error) return json({ error: error.message }, 500);

  const { error: memberErr } = await db
    .from("property_members")
    .insert({ property_id: property.id, user_id: user.id, role: "owner" });
  if (memberErr) {
    await db.from("properties").delete().eq("id", property.id);
    return json({ error: memberErr.message }, 500);
  }

  return json({ property });
});
