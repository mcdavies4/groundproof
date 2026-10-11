// POST { estate_id, rows: [{ unit, email }] } -> invites buyers to watch their own unit.
// Each buyer becomes a family viewer on that unit only: they see its check-ins and get its alerts.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { sendViewerInvite } from "../_shared/email.ts";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_PER_UNIT = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const user = await getCaller(req);
  if (!user) return json({ error: "Sign in first" }, 401);

  const b = await req.json().catch(() => ({})) as { estate_id?: string; rows?: { unit?: string; email?: string }[] };
  const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 300);
  if (!rows.length) return json({ error: "Add at least one line: unit, email." }, 400);

  const db = adminClient();
  const [{ data: estate }, { data: dev }] = await Promise.all([
    db.from("estates").select("id, developer_id, name").eq("id", String(b.estate_id ?? "")).maybeSingle(),
    db.from("developers").select("company, approved").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!estate || estate.developer_id !== user.id || !dev?.approved) return json({ error: "Not found" }, 404);

  const { data: units } = await db.from("properties").select("id, label").eq("estate_id", estate.id);
  const byLabel = new Map((units ?? []).map((u) => [u.label.trim().toLowerCase(), u]));
  const ids = (units ?? []).map((u) => u.id);
  const { data: existing } = ids.length
    ? await db.from("viewer_invites").select("property_id, email").in("property_id", ids)
    : { data: [] as { property_id: string; email: string }[] };
  const count = new Map<string, number>();
  const have = new Set<string>();
  for (const v of existing ?? []) { count.set(v.property_id, (count.get(v.property_id) ?? 0) + 1); have.add(`${v.property_id}:${v.email}`); }

  const results: { unit: string; email: string; status: string }[] = [];
  for (const r of rows) {
    const unitName = String(r.unit ?? "").trim(), email = String(r.email ?? "").trim().toLowerCase();
    const unit = byLabel.get(unitName.toLowerCase());
    if (!unit) { results.push({ unit: unitName, email, status: "no unit with that name" }); continue; }
    if (!EMAIL_RE.test(email)) { results.push({ unit: unitName, email, status: "email doesn't look right" }); continue; }
    if (have.has(`${unit.id}:${email}`)) { results.push({ unit: unitName, email, status: "already added" }); continue; }
    if ((count.get(unit.id) ?? 0) >= MAX_PER_UNIT) { results.push({ unit: unitName, email, status: `unit already has ${MAX_PER_UNIT} people` }); continue; }
    const { error } = await db.from("viewer_invites").insert({ property_id: unit.id, email, invited_by: user.id });
    if (error) { results.push({ unit: unitName, email, status: "couldn't save" }); continue; }
    have.add(`${unit.id}:${email}`);
    count.set(unit.id, (count.get(unit.id) ?? 0) + 1);
    const sent = await sendViewerInvite(email, dev.company, `${unit.label}, ${estate.name}`);
    results.push({ unit: unit.label, email, status: sent ? "invited" : "added (email not sent)" });
  }
  return json({ ok: true, results });
});
