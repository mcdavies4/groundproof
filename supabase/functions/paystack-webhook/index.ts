// Paystack webhook. Deploy with --no-verify-jwt.
// Auth: x-paystack-signature = HMAC-SHA512(raw body, secret key).
import { adminClient } from "../_shared/supabase.ts";
import { isValidSignature, settle } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });

  const raw = await req.text();
  if (!(await isValidSignature(raw, req.headers.get("x-paystack-signature")))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = JSON.parse(raw);
  if (body?.event !== "charge.success" || !body?.data?.reference) {
    return new Response("ignored", { status: 200 });
  }

  try {
    const result = await settle(adminClient(), body.data.reference);
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("webhook settle failed", e);
    return new Response("retry", { status: 500 }); // Paystack retries non-2xx
  }
});
