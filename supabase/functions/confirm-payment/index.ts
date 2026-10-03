// POST { reference } after Paystack redirects back. Verifies and applies immediately,
// so the owner sees the result without waiting for the webhook. Safe to call repeatedly.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { settle } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const user = await getCaller(req);
  if (!user) return json({ error: "Sign in first" }, 401);

  const { reference } = await req.json().catch(() => ({}));
  if (!reference) return json({ error: "reference is required" }, 400);

  const db = adminClient();
  const { data: pay } = await db.from("payments").select("user_id").eq("tx_ref", reference).maybeSingle();
  if (!pay || pay.user_id !== user.id) return json({ error: "Payment not found" }, 404);

  try {
    return json(await settle(db, reference));
  } catch (e) {
    return json({ status: "pending", error: (e as Error).message }, 502);
  }
});
