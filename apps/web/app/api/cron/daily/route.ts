// Runs every day at 08:00 UTC (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
// Every day: onboarding nudges. On the 1st of the month: the monthly summaries too.
// Both edge functions check the same secret against DIGEST_SECRET.
export const dynamic = "force-dynamic";

async function call(fn: string, secret: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-digest-secret": secret },
    body: "{}",
    cache: "no-store",
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const out: Record<string, unknown> = { nudges: await call("owner-nudges", secret) };
  if (new Date().getUTCDate() === 1) out.digest = await call("monthly-digest", secret);
  return Response.json(out);
}
