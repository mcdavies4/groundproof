/**
 * Owner (and family viewer) alerts by email through Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Needs RESEND_API_KEY and ALERT_FROM (e.g. "Groundproof <alerts@groundproof.site>") as Supabase secrets.
 * If either is missing, alerts are skipped and check-ins still work.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

type Verdict = "verified" | "review" | "flagged";

const STYLE: Record<Verdict, { label: string; colour: string }> = {
  verified: { label: "Verified at the building", colour: "#1e7a4e" },
  review: { label: "Needs a look", colour: "#a86a12" },
  flagged: { label: "Flagged", colour: "#b3261e" },
};

export async function alertOwner(db: SupabaseClient, args: {
  ownerId: string; propertyId: string; propertyLabel: string; verdict: Verdict; reason: string;
  note: string | null; isAnchor: boolean; matchType: "postcode" | "coordinates"; stageName: string | null;
  answersRequest?: boolean;
}) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("ALERT_FROM");
  if (!key || !from) return;

  try {
    // The owner plus any family viewers they've added.
    const [{ data: owner }, { data: viewers }, { data: prop }] = await Promise.all([
      db.auth.admin.getUserById(args.ownerId),
      db.from("viewer_invites").select("email").eq("property_id", args.propertyId).not("accepted_at", "is", null),
      db.from("properties").select("estate_id").eq("id", args.propertyId).maybeSingle(),
    ]);
    // Developers with many units only hear about visits that need a look; buyers hear about everything.
    const ownerGetsIt = !prop?.estate_id || args.verdict !== "verified";
    const recipients = [...new Set([ownerGetsIt ? owner.user?.email : null, ...(viewers ?? []).map((v) => v.email)].filter(Boolean) as string[])];
    if (!recipients.length) return;

    const site = Deno.env.get("SITE_URL") ?? "https://groundproof.site";
    const link = `${site}/properties/${args.propertyId}`;
    const s = STYLE[args.verdict];
    const label = args.verdict === "verified" && args.matchType === "coordinates" ? "Location match" : s.label;
    const what = args.isAnchor ? "Anchor visit" : args.stageName ? `Check-in for "${args.stageName}"` : "Check-in";

    const subject =
      args.verdict === "flagged" ? `⚠ Flagged check-in at ${args.propertyLabel}`
      : args.verdict === "review" ? `A check-in at ${args.propertyLabel} needs a look`
      : `${what} verified at ${args.propertyLabel}`;

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;max-width:520px;margin:0 auto;padding:24px">
  <p style="margin:0 0 6px;font-size:14px;color:#3d5149">${esc(what)} · ${esc(args.propertyLabel)}</p>
  <h1 style="margin:0 0 14px;font-size:24px;color:${s.colour}">${esc(label)}</h1>
  ${args.answersRequest ? `<p style="margin:0 0 14px;font-size:15px;font-weight:bold">This is the visit you asked for.</p>` : ""}
  <p style="margin:0 0 14px;font-size:16px;line-height:1.5">${esc(args.reason)}</p>
  ${args.note ? `<p style="margin:0 0 18px;padding-left:12px;border-left:4px solid #f4c531;font-size:15px;line-height:1.5;color:#3d5149"><em>${esc(args.note)}</em></p>` : ""}
  <p style="margin:0 0 24px"><a href="${link}" style="background:#10251f;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:4px;display:inline-block">See the photos</a></p>
  <p style="margin:0;font-size:13px;color:#3d5149">You're getting this because you watch ${esc(args.propertyLabel)} on Groundproof.</p>
</div>`;

    // One email each, so nobody sees the others' addresses.
    await Promise.all(recipients.map(async (to) => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, html }),
      });
      if (!res.ok) console.error("alert email failed", res.status, await res.text());
    }));
  } catch (e) {
    console.error("alert email error", e);
  }
}

/** "You've been added to <property>" email for a family viewer or buyer. */
export async function sendViewerInvite(to: string, inviter: string, label: string): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("ALERT_FROM");
  if (!key || !from) return false;

  const site = Deno.env.get("SITE_URL") ?? "https://groundproof.site";
  const link = `${site}/login?next=/dashboard`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;max-width:520px;margin:0 auto;padding:24px">
  <p style="margin:0 0 6px;font-size:14px;color:#3d5149">Groundproof</p>
  <h1 style="margin:0 0 14px;font-size:24px">You've been added to ${esc(label)}</h1>
  <p style="margin:0 0 14px;font-size:16px;line-height:1.5">${esc(inviter)} is using Groundproof to keep an eye on this property in Nigeria. Every visit from their person on the ground is checked against the building's NIPOST postcode, with photos.</p>
  <p style="margin:0 0 14px;font-size:16px;line-height:1.5">You can now see every check-in and its photos, and you'll get an email after each one. You can't change anything.</p>
  <p style="margin:0 0 24px"><a href="${link}" style="background:#10251f;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:4px;display:inline-block">Open Groundproof</a></p>
  <p style="margin:0;font-size:13px;color:#3d5149">Sign in with this email address (${esc(to)}). No password needed: we send you a code.</p>
</div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: `You've been added to ${label} on Groundproof`, html }),
    });
    if (!res.ok) { console.error("invite email failed", res.status, await res.text()); return false; }
    return true;
  } catch (e) {
    console.error("invite email error", e);
    return false;
  }
}
