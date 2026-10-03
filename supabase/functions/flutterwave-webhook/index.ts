// Flutterwave webhook. Deploy with --no-verify-jwt.
// Auth: Flutterwave echoes your dashboard "secret hash" in the verif-hash header.
import { adminClient } from "../_shared/supabase.ts";
import { settle } from "../_shared/flutterwave.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });

  const expected = Deno.env.get("FLW_WEBHOOK_HASH");
  if (!expected || req.headers.get("verif-hash") !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json().catch(() => null);
  // Nested v3 shape { event, data: { id } } or flat shape { "event.type", id }
  const event: string = body?.event ?? body?.["event.type"] ?? "";
  const txId = body?.data?.id ?? body?.id;

  if (!txId || !/charge|transaction/i.test(event)) {
    return new Response("ignored", { status: 200 });
  }

  try {
    const result = await settle(adminClient(), txId);
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("webhook settle failed", e);
    return new Response("retry", { status: 500 }); // Flutterwave retries non-2xx
  }
});
