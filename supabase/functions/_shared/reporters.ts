// Where each approved reporter is in onboarding. Shared by admin-stats (dashboard) and owner-nudges (daily emails).
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";

export type RStage = "approved" | "signed_in" | "profile" | "ready" | "matched" | "joined" | "active";
export const RSTAGES: RStage[] = ["approved", "signed_in", "profile", "ready", "matched", "joined", "active"];
/** Steps that get an email. "ready" is waiting on us (an introduction), "active" is done. */
export const NUDGE_STAGES = ["approved", "signed_in", "profile", "matched", "joined"] as const;
export const R_STUCK_AFTER = 48 * 3_600_000;
export const PLAY = "https://play.google.com/store/apps/details?id=ng.the36th.groundproof";

export interface ReporterPerson {
  email: string; name: string; state: string; userId: string | null;
  stage: RStage; since: string; stuck: boolean; waitingOnUs: boolean;
  property: { id: string; label: string } | null;
  nudged: Partial<Record<string, string>>;
}

export async function reporterPeople(db: SupabaseClient, users: User[]): Promise<ReporterPerson[]> {
  const { data: apps } = await db.from("reporter_applications")
    .select("name, email, state, approved_at, created_at").eq("status", "approved").order("approved_at", { ascending: false });
  if (!apps?.length) return [];
  const byEmail = new Map<string, User>();
  for (const u of users) if (u.email) byEmail.set(u.email.toLowerCase(), u);
  const ids = apps.map((a) => byEmail.get(String(a.email).toLowerCase())?.id).filter(Boolean) as string[];

  const [{ data: profs }, { data: rates }, { data: matches }, { data: members }, { data: visits }, { data: nudges }, { data: props }] = await Promise.all([
    db.from("reporter_profiles").select("user_id, created_at").in("user_id", ids),
    db.from("reporter_rates").select("user_id, updated_at").in("user_id", ids),
    db.from("matches").select("reporter_id, property_id, created_at").eq("status", "active").in("reporter_id", ids),
    db.from("property_members").select("user_id, property_id, created_at").eq("role", "reporter").in("user_id", ids),
    db.from("checkins").select("reporter_id, server_time").in("reporter_id", ids).order("server_time"),
    db.from("reporter_nudges").select("email, stage, sent_at"),
    db.from("properties").select("id, label"),
  ]);
  const label = new Map((props ?? []).map((p) => [p.id, p.label as string]));
  const first = <T,>(rows: T[] | null | undefined, uid: string, key: keyof T, at: keyof T) =>
    (rows ?? []).filter((r) => r[key] === uid).map((r) => String(r[at])).sort()[0] as string | undefined;
  const nudgedBy = new Map<string, Partial<Record<string, string>>>();
  for (const n of nudges ?? []) (nudgedBy.get(n.email) ?? nudgedBy.set(n.email, {}).get(n.email)!)[n.stage] = n.sent_at;

  const now = Date.now();
  const out: ReporterPerson[] = [];
  const seen = new Set<string>();
  for (const a of apps) {
    const email = String(a.email).toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const approvedAt = (a.approved_at ?? a.created_at) as string;
    const u = byEmail.get(email);
    let stage: RStage = "approved", since = approvedAt;
    let property: ReporterPerson["property"] = null;
    if (u) {
      const profile = first(profs, u.id, "user_id", "created_at");
      const rate = first(rates, u.id, "user_id", "updated_at");
      const visit = first(visits, u.id, "reporter_id", "server_time");
      const joined = first(members, u.id, "user_id", "created_at");
      const joinedIds = new Set((members ?? []).filter((m) => m.user_id === u.id).map((m) => m.property_id));
      const pending = (matches ?? []).filter((m) => m.reporter_id === u.id && m.property_id && !joinedIds.has(m.property_id))
        .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)))[0];
      stage = "signed_in"; since = u.created_at > approvedAt ? u.created_at : approvedAt;
      if (profile) { stage = "profile"; since = profile; }
      if (profile && rate) { stage = "ready"; since = profile > rate ? profile : rate; }
      if (pending) { stage = "matched"; since = pending.created_at; property = { id: pending.property_id!, label: label.get(pending.property_id!) ?? "a property" }; }
      if (joined) {
        stage = "joined"; since = joined;
        const pid = (members ?? []).find((m) => m.user_id === u.id)?.property_id;
        property = pid ? { id: pid, label: label.get(pid) ?? "a property" } : null;
      }
      if (visit) { stage = "active"; since = visit; }
    }
    out.push({
      email: a.email, name: a.name, state: a.state, userId: u?.id ?? null,
      stage, since,
      stuck: stage !== "active" && now - Date.parse(since) > R_STUCK_AFTER,
      waitingOnUs: stage === "ready",
      property, nudged: nudgedBy.get(a.email) ?? nudgedBy.get(email) ?? {},
    });
  }
  return out;
}

/** The email for a reporter stuck at a step. From Emeka; replies go to him. Null when no email fits (ready or active). */
export function reporterNudgeEmail(p: ReporterPerson, site: string): { subject: string; html: string } | null {
  const e = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const first = e(p.name.split(" ")[0] || "there");
  const m = ({
    approved: {
      subject: "Your Groundproof reporter account is ready",
      body: `<p>You're approved as a Groundproof reporter in ${e(p.state)}, but we haven't seen you sign in yet.</p>
<p>It takes five minutes: install the free Android app, then sign in with <strong>${e(p.email)}</strong>. That's the address we approved, so it has to be that one.</p>`,
      cta: ["Get the Android app", PLAY],
    },
    signed_in: {
      subject: "Next: your reporter profile and prices",
      body: `<p>You're signed in, thank you. Owners can only be matched with you once your profile and prices are set.</p>
<p>Open your account on a computer or phone browser, sign in with the same email, and fill in your profile (we've pre-filled what you told us). Then set your price for each kind of visit. It takes about five minutes.</p>`,
      cta: ["Set up my profile", `${site}/account`],
    },
    profile: {
      subject: "One thing left: set your visit prices",
      body: `<p>Your profile is up. The last step is your prices per visit. Owners are matched with reporters whose prices fit their budget, so until yours are set we can't introduce you.</p>`,
      cta: ["Set my prices", `${site}/account`],
    },
    matched: {
      subject: `Your first property is waiting: ${p.property?.label ?? "an owner needs you"}`,
      body: `<p>We've matched you with an owner for <strong>${e(p.property?.label ?? "their property")}</strong>, and your invite code was emailed to you. Search your inbox for "Groundproof" or "invite code".</p>
<p>Open the app, enter the code, and you're on the property. Can't find the email? Reply to this one and I'll resend it.</p>`,
      cta: ["Open the app", PLAY],
    },
    joined: {
      subject: `Time for your first visit${p.property ? ` at ${p.property.label}` : ""}`,
      body: `<p>You've joined <strong>${e(p.property?.label ?? "the property")}</strong>, and the owner is waiting for the first visit. It takes about 10 minutes: stand outside the building, open the app and take the photos. Every visit after that is checked against that spot.</p>
<p>No signal there? The app saves the visit and uploads it later. If anything is unclear, reply and ask me.</p>`,
      cta: ["Open the app", PLAY],
    },
  } as Record<string, { subject: string; body: string; cta: [string, string] }>)[p.stage];
  if (!m) return null;
  return {
    subject: m.subject,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#10251f;max-width:520px;margin:0 auto;padding:24px;font-size:16px;line-height:1.5">
<p style="margin:0 0 14px">Hi ${first},</p>${m.body}
<p style="margin:20px 0 24px"><a href="${m.cta[1]}" style="background:#10251f;color:#fff;text-decoration:none;font-weight:bold;padding:11px 18px;border-radius:4px;display:inline-block">${e(m.cta[0])}</a></p>
<p style="margin:0 0 4px">Any questions, just reply. It comes straight to me.</p>
<p style="margin:0">Emeka<br><span style="color:#3d5149;font-size:14px">Founder, Groundproof</span></p></div>`,
  };
}
