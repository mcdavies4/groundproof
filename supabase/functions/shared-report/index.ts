// POST { token } -> read-only report for a property the owner has shared. Deploy with --no-verify-jwt.
// Returns only what the report shows: no emails, user ids or GPS coordinates.
import { cors, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";

const MAX_CHECKINS = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const { token } = await req.json().catch(() => ({}));
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return json({ error: "Not found" }, 404);

  const db = adminClient();
  const { data: p } = await db.from("properties")
    .select("id, label, postcode, anchor_mode, anchored_at, nipost_address, nipost_building_use, payment_currency")
    .eq("share_token", token).maybeSingle();
  if (!p) return json({ error: "Not found" }, 404);

  const [{ data: ms }, { data: cs }] = await Promise.all([
    db.from("milestones").select("id, name, amount, completed_checkin_id").eq("property_id", p.id).order("sort"),
    db.from("checkins")
      .select("id, server_time, verdict, verdict_reason, photo_note, note, is_anchor, match_type, milestone_id, photo_paths")
      .eq("property_id", p.id).neq("verdict", "pending")
      .order("server_time", { ascending: false }).limit(MAX_CHECKINS),
  ]);

  const paths = (cs ?? []).flatMap((c) => (c.photo_paths as string[]).slice(0, 4));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await db.storage.from("checkins").createSignedUrls(paths, 60 * 60);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  const stageName = new Map((ms ?? []).map((m) => [m.id, m.name]));
  const timeById = new Map((cs ?? []).map((c) => [c.id, c.server_time]));

  return json({
    property: {
      label: p.label,
      postcode: p.postcode,
      anchorMode: p.anchor_mode,
      anchoredAt: p.anchored_at,
      address: p.nipost_address?.recent_house_address ?? null,
      area: [p.nipost_address?.administrative?.locality_name, p.nipost_address?.administrative?.lga_name, p.nipost_address?.administrative?.state_name]
        .filter(Boolean).join(", ") || null,
      use: p.nipost_building_use,
      currency: p.payment_currency ?? "NGN",
    },
    milestones: (ms ?? []).map((m) => ({
      name: m.name, amount: m.amount, done: !!m.completed_checkin_id,
      doneAt: m.completed_checkin_id ? timeById.get(m.completed_checkin_id) ?? null : null,
    })),
    checkins: (cs ?? []).map((c) => ({
      id: c.id, time: c.server_time, verdict: c.verdict, reason: c.verdict_reason, note: c.note, photoNote: c.photo_note,
      isAnchor: c.is_anchor, matchType: c.match_type, stage: c.milestone_id ? stageName.get(c.milestone_id) ?? null : null,
      photos: (c.photo_paths as string[]).slice(0, 4).map((x) => urls.get(x)).filter(Boolean),
    })),
    generatedAt: new Date().toISOString(),
  });
});
