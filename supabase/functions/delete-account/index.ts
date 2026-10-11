// POST {} -> permanently deletes the caller's account, their properties and those properties' photos.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const user = await getCaller(req);
  if (!user) return json({ error: "Sign in first" }, 401);

  const db = adminClient();

  // Photos, videos and beacon photos for properties this user owns (storage isn't removed by database cascades).
  const { data: owned } = await db.from("properties").select("id").eq("owner_id", user.id);
  for (const p of owned ?? []) {
    for (const bucket of ["checkins", "checkin-videos", "plot-photos"]) {
      const { data: folders } = await db.storage.from(bucket).list(p.id, { limit: 1000 });
      for (const f of folders ?? []) {
        const { data: files } = await db.storage.from(bucket).list(`${p.id}/${f.name}`, { limit: 100 });
        const paths = (files ?? []).map((x) => `${p.id}/${f.name}/${x.name}`);
        if (paths.length) await db.storage.from(bucket).remove(paths);
      }
    }
  }

  // Removes the auth user; database cascades remove owned properties, memberships and stages.
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return json({ error: `Couldn't delete the account: ${error.message}` }, 500);

  // Waitlist entry, if any.
  if (user.email) await db.from("waitlist").delete().eq("email", user.email.toLowerCase());

  return json({ deleted: true });
});
