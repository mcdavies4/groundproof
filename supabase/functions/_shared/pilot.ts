// Where each pilot owner is in the funnel. Shared by admin-stats (dashboard) and owner-nudges (daily emails).
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";

export type Stage = "signed_up" | "added" | "reporter" | "anchored" | "verified";
export const STAGES: Stage[] = ["signed_up", "added", "reporter", "anchored", "verified"];
export const STUCK_AFTER = 48 * 3_600_000;

export interface PilotPerson {
  id: string; email: string; signedUp: string; source: string; landing: string | null; web: boolean;
  stage: Stage; since: string; stuck: boolean; properties: { id: string; label: string }[];
  nudged: Partial<Record<Stage, string>>;
}

export async function allUsers(db: SupabaseClient): Promise<User[]> {
  const out: User[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    out.push(...(data?.users ?? []));
    if (!data || data.users.length < 1000) break;
  }
  return out;
}

/** Owners and would-be owners, with their furthest step. Reporters, family viewers, developers and admins are left out. */
export async function pilotPeople(db: SupabaseClient, users: User[]): Promise<PilotPerson[]> {
  const [{ data: props }, { data: members }, { data: visits }, { data: profs }, { data: apps }, { data: devs }, { data: nudges }] = await Promise.all([
    db.from("properties").select("id, owner_id, label, created_at, anchored_at").is("estate_id", null),
    db.from("property_members").select("property_id, user_id, role, created_at"),
    db.from("checkins").select("property_id, server_time").eq("is_anchor", false).eq("verdict", "verified").order("server_time"),
    db.from("reporter_profiles").select("user_id"),
    db.from("reporter_applications").select("email"),
    db.from("developers").select("user_id"),
    db.from("pilot_nudges").select("user_id, stage, sent_at"),
  ]);
  const admins = new Set((Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const notOwner = new Set<string>([
    ...(profs ?? []).map((p) => p.user_id), ...(devs ?? []).map((d) => d.user_id),
    ...(members ?? []).filter((m) => m.role === "reporter" || m.role === "viewer").map((m) => m.user_id),
  ]);
  const applicants = new Set((apps ?? []).map((a) => String(a.email).toLowerCase()));
  const byOwner = new Map<string, NonNullable<typeof props>>();
  for (const p of props ?? []) { if (!byOwner.has(p.owner_id)) byOwner.set(p.owner_id, []); byOwner.get(p.owner_id)!.push(p); }
  const firstVisit = new Map<string, string>();
  for (const v of visits ?? []) if (!firstVisit.has(v.property_id)) firstVisit.set(v.property_id, v.server_time);
  const reporterJoined = new Map<string, string>();
  for (const m of members ?? []) if (m.role === "reporter") {
    const prev = reporterJoined.get(m.property_id);
    if (!prev || m.created_at < prev) reporterJoined.set(m.property_id, m.created_at);
  }
  const nudged = new Map<string, Partial<Record<Stage, string>>>();
  for (const n of nudges ?? []) (nudged.get(n.user_id) ?? nudged.set(n.user_id, {}).get(n.user_id)!)[n.stage as Stage] = n.sent_at;

  const earliest = (xs: (string | null | undefined)[]) => xs.filter(Boolean).sort()[0] as string | undefined;
  const now = Date.now();
  const out: PilotPerson[] = [];
  for (const u of users) {
    const email = u.email?.toLowerCase();
    if (!email || admins.has(email)) continue;
    const own = byOwner.get(u.id) ?? [];
    if (!own.length && (notOwner.has(u.id) || applicants.has(email))) continue;
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    let stage: Stage = "signed_up", since = u.created_at;
    if (own.length) {
      const verified = earliest(own.map((p) => firstVisit.get(p.id)));
      const anchored = earliest(own.map((p) => p.anchored_at));
      const reporter = earliest(own.map((p) => reporterJoined.get(p.id)));
      if (verified) { stage = "verified"; since = verified; }
      else if (anchored) { stage = "anchored"; since = anchored; }
      else if (reporter) { stage = "reporter"; since = reporter; }
      else { stage = "added"; since = earliest(own.map((p) => p.created_at))!; }
    }
    out.push({
      id: u.id, email: u.email!, signedUp: u.created_at,
      source: typeof meta.source === "string" && meta.source ? meta.source : "direct",
      landing: typeof meta.landing === "string" ? meta.landing : null,
      web: meta.signup_via === "web",
      stage, since, stuck: stage !== "verified" && now - Date.parse(since) > STUCK_AFTER,
      properties: own.map((p) => ({ id: p.id, label: p.label })),
      nudged: nudged.get(u.id) ?? {},
    });
  }
  return out.sort((a, b) => b.signedUp.localeCompare(a.signedUp));
}

/** The email for someone stuck at a step. Personal, from Emeka; replies go to him. */
export function nudgeEmail(p: PilotPerson, site: string): { subject: string; html: string } | null {
  const prop = p.properties[0];
  const label = prop?.label ?? "your property";
  const link = prop ? `${site}/properties/${prop.id}` : `${site}/properties/new`;
  const e = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const m = ({
    signed_up: {
      subject: "Your Groundproof pilot: one step to go",
      body: `<p>Thanks for signing up for the Groundproof pilot. The next step is adding your property: the address or NIPOST postcode, and what you're building. It takes about two minutes.</p>
<p>The pilot covers up to 2 properties and 5 verified check-ins on each, free.</p>`,
      cta: ["Add your property", `${site}/properties/new`],
    },
    added: {
      subject: `Who'll visit ${label}?`,
      body: `<p>You've added <strong>${e(label)}</strong>. Now it needs someone on the ground: a relative, your builder's supervisor or an agent you trust. Send them an invite code from the property page, and they join on our free Android app.</p>
<p>No one you can send? Reply to this email or use <a href="${site}/find-someone">Find me someone</a> and I'll match you with a vetted local reporter.</p>`,
      cta: ["Create an invite code", `${link}#ground`],
    },
    reporter: {
      subject: `${label} is waiting for its first visit`,
      body: `<p>Your person on the ground has joined <strong>${e(label)}</strong>, but hasn't done the first visit yet. It takes about 10 minutes: they stand outside the property, open the app and take the photos. Every visit after that is checked against that spot.</p>
<p>A quick message to them usually does it. If they're stuck, they can reply to this email too.</p>`,
      cta: ["Open the property", link],
    },
    anchored: {
      subject: `Ready for a first check-in at ${label}?`,
      body: `<p><strong>${e(label)}</strong> is set up and anchored. You can ask for a check-in in one click: your person on the ground gets an email and a reminder in the app, and you get verified photos.</p>`,
      cta: ["Request a check-in", `${link}#ground`],
    },
  } as Record<string, { subject: string; body: string; cta: [string, string] }>)[p.stage];
  if (!m) return null;
  return {
    subject: m.subject,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;max-width:520px;margin:0 auto;padding:24px;font-size:16px;line-height:1.5">
<p style="margin:0 0 14px">Hi,</p>${m.body}
<p style="margin:20px 0 24px"><a href="${m.cta[1]}" style="background:#10251f;color:#fff;text-decoration:none;font-weight:bold;padding:11px 18px;border-radius:4px;display:inline-block">${e(m.cta[0])}</a></p>
<p style="margin:0 0 4px">Any questions, just reply. It comes straight to me.</p>
<p style="margin:0">Emeka<br><span style="color:#3d5149;font-size:14px">Founder, Groundproof</span></p></div>`,
  };
}
