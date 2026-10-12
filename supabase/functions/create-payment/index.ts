// POST -> { link } to Paystack hosted checkout.
//   { property_id, product: pack3 | watch_30 | build_30 | build_365 }  owner of the property
//   { estate_id, product: estate_30 | estate_365 }                    the estate's approved developer
//   { property_id, product: "independent3" }                           a buyer (viewer) on an estate unit
import { cors, json } from "../_shared/cors.ts";
import { adminClient, getCaller } from "../_shared/supabase.ts";
import { createCheckoutLink, ESTATE_MIN_UNITS, ESTATE_PRODUCTS, INDEPENDENT, isEstateProduct, isProduct, PRODUCTS } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const user = await getCaller(req);
  if (!user?.email) return json({ error: "Sign in to pay" }, 401);

  const { property_id, estate_id, product } = await req.json().catch(() => ({}));
  const db = adminClient();
  const site = Deno.env.get("SITE_URL") ?? "http://localhost:3000";
  const reference = `GP-${crypto.randomUUID()}`;

  let row: Record<string, unknown>, amount: number, title: string, callbackUrl: string, metadata: Record<string, string>;

  if (estate_id && isEstateProduct(product)) {
    const { data: estate } = await db.from("estates").select("id, developer_id, name").eq("id", estate_id).maybeSingle();
    if (!estate || estate.developer_id !== user.id) return json({ error: "Only the estate's developer can pay for it" }, 403);
    const { count } = await db.from("properties").select("id", { count: "exact", head: true }).eq("estate_id", estate_id);
    const { data: price } = await db.rpc("estate_unit_price");
    const units = Math.max(count ?? 0, ESTATE_MIN_UNITS);
    const p = ESTATE_PRODUCTS[product];
    amount = units * Number(price ?? 2000) * p.months;
    title = `${p.title}: ${estate.name}, ${units} units`;
    row = { estate_id, units, product };
    callbackUrl = `${site}/estates/${estate_id}/paid`;
    metadata = { estate_id, product, description: title };
  } else if (property_id && product === INDEPENDENT.product) {
    const [{ data: member }, { data: prop }] = await Promise.all([
      db.from("property_members").select("role").eq("property_id", property_id).eq("user_id", user.id).maybeSingle(),
      db.from("properties").select("estate_id").eq("id", property_id).maybeSingle(),
    ]);
    if (member?.role !== "viewer" || !prop?.estate_id) return json({ error: "Independent checks are for buyers on an estate unit" }, 403);
    amount = INDEPENDENT.amount; title = INDEPENDENT.title;
    row = { property_id, product };
    callbackUrl = `${site}/properties/${property_id}/paid`;
    metadata = { property_id, product, description: title };
  } else if (property_id && isProduct(product)) {
    const { data: member } = await db.from("property_members").select("role").eq("property_id", property_id).eq("user_id", user.id).maybeSingle();
    if (member?.role !== "owner") return json({ error: "Only the property owner can pay" }, 403);
    ({ amount, title } = PRODUCTS[product]);
    row = { property_id, product };
    callbackUrl = `${site}/properties/${property_id}/paid`;
    metadata = { property_id, product, description: title };
  } else {
    return json({ error: "Choose a plan" }, 400);
  }

  const { error } = await db.from("payments").insert({ tx_ref: reference, user_id: user.id, amount_ngn: amount, ...row });
  if (error) return json({ error: error.message }, 500);

  try {
    const link = await createCheckoutLink({ reference, amountNgn: amount, email: user.email, callbackUrl, metadata });
    return json({ link });
  } catch (e) {
    await db.from("payments").update({ status: "failed" }).eq("tx_ref", reference);
    return json({ error: `Couldn't start checkout. ${(e as Error).message}` }, 502);
  }
});
