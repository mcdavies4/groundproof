// POST { estate_id, labels: string[] } -> adds units (properties) to an estate.
// Only the estate's approved developer. Units start without a postcode: the reporter finds it,
// or anchors by location, at each unit's first visit. Estate reporters are added automatically.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const user = await getCaller(req);
  if (!user) return json({ error: "Sign in first" }, 401);

  const b = await req.json().catch(() => ({})) as { estate_id?: string; labels?: unknown[] };
  const labels = [...new Set((Array.isArray(b.labels) ? b.labels : []).map((l) => String(l).trim().slice(0, 120)).filter(Boolean))];
  if (!labels.length) return json({ error: "Add at least one unit name." }, 400);
  if (labels.length > 100) return json({ error: "Add up to 100 units at a time." }, 400);

  const db = adminClient();
  const [{ data: estate }, { data: dev }] = await Promise.all([
    db.from("estates").select("id, developer_id, name").eq("id", String(b.estate_id ?? "")).maybeSingle(),
    db.from("developers").select("approved, max_units").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!estate || estate.developer_id !== user.id || !dev?.approved) return json({ error: "Not found" }, 404);

  const { data: existing } = await db.from("properties").select("id").eq("owner_id", user.id).not("estate_id", "is", null);
  const { data: inEstate } = await db.from("properties").select("label").eq("estate_id", estate.id);
  const sameEstate = new Set((inEstate ?? []).map((p) => p.label.toLowerCase()));
  const fresh = labels.filter((l) => !sameEstate.has(l.toLowerCase()));
  if ((existing ?? []).length + fresh.length > dev.max_units) {
    return json({ error: `Your account can have up to ${dev.max_units} units. Email us if you need more.` }, 400);
  }
  if (!fresh.length) return json({ error: "Those units are already in this estate." }, 409);

  const { data: props, error } = await db.from("properties")
    .insert(fresh.map((label) => ({ owner_id: user.id, label, postcode: null, estate_id: estate.id })))
    .select("id");
  if (error || !props) { console.error(error); return json({ error: "Couldn't add the units. Try again." }, 500); }
  const { error: mErr } = await db.from("property_members").insert(props.map((p) => ({ property_id: p.id, user_id: user.id, role: "owner" })));
  if (mErr) {
    await db.from("properties").delete().in("id", props.map((p) => p.id));
    console.error(mErr);
    return json({ error: "Couldn't add the units. Try again." }, 500);
  }
  return json({ ok: true, added: props.length, skipped: labels.length - fresh.length });
});
