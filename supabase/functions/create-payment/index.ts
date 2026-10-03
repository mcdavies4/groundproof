// POST { property_id, product } -> { link } to Paystack hosted checkout. Owner only.
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { createCheckoutLink, isProduct, PRODUCTS } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const user = await getCaller(req);
  if (!user?.email) return json({ error: "Sign in to pay" }, 401);

  const { property_id, product } = await req.json().catch(() => ({}));
  if (!property_id || !isProduct(product)) return json({ error: "Choose a plan" }, 400);

  const db = adminClient();
  const { data: member } = await db
    .from("property_members")
    .select("role")
    .eq("property_id", property_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (member?.role !== "owner") return json({ error: "Only the property owner can pay" }, 403);

  const { amount, title } = PRODUCTS[product];
  const reference = `GP-${crypto.randomUUID()}`;

  const { error } = await db.from("payments").insert({
    tx_ref: reference, user_id: user.id, property_id, product, amount_ngn: amount,
  });
  if (error) return json({ error: error.message }, 500);

  const site = Deno.env.get("SITE_URL") ?? "http://localhost:3000";
  try {
    const link = await createCheckoutLink({
      reference,
      amountNgn: amount,
      email: user.email,
      callbackUrl: `${site}/properties/${property_id}/paid`,
      metadata: { property_id, product, description: title },
    });
    return json({ link });
  } catch (e) {
    await db.from("payments").update({ status: "failed" }).eq("tx_ref", reference);
    return json({ error: `Couldn't start checkout. ${(e as Error).message}` }, 502);
  }
});
