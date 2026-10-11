// Runs on the 1st of each month (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
// It forwards the same secret to the monthly-digest edge function, which checks it against DIGEST_SECRET.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/monthly-digest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-digest-secret": secret },
    body: "{}",
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({ error: "bad response" }));
  return Response.json(body, { status: res.status });
}
