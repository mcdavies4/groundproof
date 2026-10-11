// POST { token } -> public, read-only view of an estate for prospective buyers.
// Deploy with --no-verify-jwt. Shows each unit's progress and latest verified photo; no names, emails or GPS.
import { cors, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { token } = await req.json().catch(() => ({})) as { token?: string };
  if (!token || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return json({ error: "Not found" }, 404);

  const db = adminClient();
  const { data: estate } = await db.from("estates").select("id, name, location, developer_id, created_at").eq("share_token", token).maybeSingle();
  if (!estate) return json({ error: "Not found" }, 404);

  const [{ data: dev }, { data: units }] = await Promise.all([
    db.from("developers").select("company").eq("user_id", estate.developer_id).maybeSingle(),
    db.from("properties").select("id, label, anchored_at, postcode").eq("estate_id", estate.id).order("label"),
  ]);
  const ids = (units ?? []).map((u) => u.id);
  const { data: cs } = ids.length
    ? await db.from("checkins").select("property_id, verdict, server_time, photo_paths, milestone_id").in("property_id", ids).neq("verdict", "pending").order("server_time", { ascending: false }).limit(2000)
    : { data: [] as { property_id: string; verdict: string; server_time: string; photo_paths: string[]; milestone_id: string | null }[] };
  const { data: stages } = ids.length
    ? await db.from("milestones").select("id, property_id, name, completed_checkin_id").in("property_id", ids)
    : { data: [] as { id: string; property_id: string; name: string; completed_checkin_id: string | null }[] };

  const latestPhoto: string[] = [];
  const out = (units ?? []).map((u) => {
    const mine = (cs ?? []).filter((c) => c.property_id === u.id);
    const lastVerified = mine.find((c) => c.verdict === "verified");
    if (lastVerified?.photo_paths?.[0]) latestPhoto.push(lastVerified.photo_paths[0]);
    const done = (stages ?? []).filter((s) => s.property_id === u.id && s.completed_checkin_id).map((s) => s.name);
    return {
      label: u.label,
      anchored: Boolean(u.anchored_at),
      postcode: u.postcode,
      visits: mine.length,
      verified: mine.filter((c) => c.verdict === "verified").length,
      flagged: mine.filter((c) => c.verdict === "flagged").length,
      lastVerified: lastVerified?.server_time ?? null,
      stagesDone: done,
      photoPath: lastVerified?.photo_paths?.[0] ?? null,
    };
  });

  const urls = new Map<string, string>();
  if (latestPhoto.length) {
    const { data: signed } = await db.storage.from("checkins").createSignedUrls(latestPhoto, 60 * 60);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  return json({
    estate: { name: estate.name, location: estate.location, developer: dev?.company ?? null },
    units: out.map(({ photoPath, ...u }) => ({ ...u, photo: photoPath ? urls.get(photoPath) ?? null : null })),
    generatedAt: new Date().toISOString(),
  });
});
