// After a verified visit: referral thank-yous and the one-time feedback request.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { esc } from "./email.ts";

const SITE = () => Deno.env.get("SITE_URL") ?? "https://groundproof.site";

async function send(to: string, subject: string, inner: string) {
  const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("ALERT_FROM");
  if (!key || !from) return false;
  const replyTo = (Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((x) => x.trim()).filter(Boolean)[0];
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [to], subject, ...(replyTo ? { reply_to: replyTo } : {}),
      html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;max-width:520px;margin:0 auto;padding:24px;font-size:16px;line-height:1.5">${inner}</div>`,
    }),
  }).catch(() => null);
  if (res && !res.ok) console.error("growth email failed", res.status, await res.text());
  return Boolean(res?.ok);
}

/** The owner's invite link, for emails. */
export async function referralLink(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db.rpc("referral_code_for", { uid: userId });
  return typeof data === "string" ? `${SITE()}/pilot?ref=${data}` : null;
}

/** Tell both sides when a referral pays out. Safe to call often: each one is sent once. */
export async function sendReferralNotices(db: SupabaseClient) {
  const { data: due } = await db.from("referrals").update({ notified_at: new Date().toISOString() })
    .not("rewarded_at", "is", null).is("notified_at", null)
    .select("referred_id, referrer_id, referred_property_id, referrer_property_id, referrer_pending, referrer_capped");
  for (const r of due ?? []) {
    const ids = [r.referred_property_id, r.referrer_property_id].filter(Boolean) as string[];
    const [{ data: friend }, { data: referrer }, { data: props }] = await Promise.all([
      db.auth.admin.getUserById(r.referred_id), db.auth.admin.getUserById(r.referrer_id),
      ids.length ? db.from("properties").select("id, label").in("id", ids) : Promise.resolve({ data: [] as { id: string; label: string }[] }),
    ]);
    const label = (id: string | null) => (props ?? []).find((p) => p.id === id)?.label ?? "your property";
    const fEmail = friend.user?.email, rEmail = referrer.user?.email;
    if (fEmail) {
      await send(fEmail, "3 free check-ins added", `<h1 style="margin:0 0 14px;font-size:22px">Your first verified visit, plus 3 on us</h1>
<p style="margin:0 0 14px">You joined Groundproof through a friend's invite, so now that your first visit is verified we've added <strong>3 free check-ins</strong> to <strong>${esc(label(r.referred_property_id))}</strong>. They've got 3 too.</p>
<p style="margin:0"><a href="${SITE()}/properties/${r.referred_property_id}">See the visit</a></p>`);
    }
    if (rEmail) {
      const what = r.referrer_capped
        ? `<p style="margin:0 0 14px">Thank you. You've already earned the most referral check-ins we give, but your friend still got their 3.</p>`
        : r.referrer_pending > 0
        ? `<p style="margin:0 0 14px">You've earned <strong>3 free check-ins</strong>. They'll be added to the first property you set up.</p>`
        : `<p style="margin:0 0 14px">We've added <strong>3 free check-ins</strong> to <strong>${esc(label(r.referrer_property_id))}</strong>.</p>`;
      const link = await referralLink(db, r.referrer_id);
      await send(rEmail, "Your friend's first visit is verified", `<h1 style="margin:0 0 14px;font-size:22px">Thank you for the invite</h1>
<p style="margin:0 0 14px">${esc(fEmail ?? "Someone you invited")} just had their first verified visit on Groundproof.</p>${what}
${link && !r.referrer_capped ? `<p style="margin:0">Know someone else building at home? Your link: <a href="${link}">${esc(link)}</a></p>` : ""}`);
    }
  }
  return (due ?? []).length;
}

/** After an owner's 3rd verified visit (not anchors, not estate units), ask once how it's going. */
export async function maybeAskFeedback(db: SupabaseClient, ownerId: string) {
  const { data: existing } = await db.from("feedback").select("id").eq("user_id", ownerId).maybeSingle();
  if (existing) return;
  const { data: props } = await db.from("properties").select("id").eq("owner_id", ownerId).is("estate_id", null);
  const ids = (props ?? []).map((p) => p.id);
  if (!ids.length) return;
  const { count } = await db.from("checkins").select("id", { count: "exact", head: true })
    .in("property_id", ids).eq("is_anchor", false).eq("verdict", "verified");
  if ((count ?? 0) < 3) return;
  const { data: row } = await db.from("feedback").upsert({ user_id: ownerId }, { onConflict: "user_id", ignoreDuplicates: true }).select("id").maybeSingle();
  if (!row) return;   // another call got there first
  const { data: u } = await db.auth.admin.getUserById(ownerId);
  if (!u.user?.email) return;
  const base = `${SITE()}/feedback/${row.id}?s=`;
  const cells = Array.from({ length: 11 }, (_, n) =>
    `<td style="padding:2px"><a href="${base}${n}" style="display:block;width:34px;line-height:34px;text-align:center;border:2px solid #10251f;border-radius:4px;color:#10251f;text-decoration:none;font-weight:bold;font-size:15px;background:${n >= 9 ? "#f4c531" : "#fff"}">${n}</a></td>`).join("");
  await send(u.user.email, "Three verified visits in: how's Groundproof doing?", `<p style="margin:0 0 14px">Hi,</p>
<p style="margin:0 0 14px">You've now had 3 verified visits on Groundproof. I'm building this for people like us, so I'd really value one honest answer:</p>
<p style="margin:0 0 10px;font-weight:bold">How likely are you to recommend Groundproof to a friend building or buying in Nigeria?</p>
<table style="border-collapse:collapse;margin:0 0 6px"><tr>${cells}</tr></table>
<p style="margin:0 0 18px;font-size:13px;color:#3d5149">0 = not at all, 10 = definitely. One click is enough; there's a box for more if you want it.</p>
<p style="margin:0 0 4px">Or just reply to this email. It comes straight to me.</p>
<p style="margin:0">Emeka<br><span style="color:#3d5149;font-size:14px">Founder, Groundproof</span></p>`);
}
