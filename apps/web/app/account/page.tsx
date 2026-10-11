import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { DeleteForm } from "./DeleteForm";
import { ReporterProfileForm } from "@/components/ReporterProfileForm";
import { EmailPrefsForm } from "@/components/EmailPrefsForm";
import { ReporterRatesForm, ReporterRulesForm } from "@/components/ReporterRatesForm";
import type { VisitType } from "@/lib/rates";
import { ReporterRecord, type ReporterStats } from "@/components/ReporterRecord";

export default async function Account() {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/account");

  // Reporters (anyone on the ground for at least one property) get a public profile.
  const { count: reporting } = await supabase.from("property_members")
    .select("property_id", { count: "exact", head: true }).eq("user_id", user.id).eq("role", "reporter");
  const isReporter = (reporting ?? 0) > 0;
  const { data: prefs } = await supabase.from("email_prefs").select("tips, digest").eq("user_id", user.id).maybeSingle();
  const [{ data: profile }, { data: record }] = isReporter
    ? await Promise.all([
        supabase.from("reporter_profiles").select("slug, display_name, state, areas, bio, is_public, agreed_rules_at, suspended").eq("user_id", user.id).maybeSingle(),
        supabase.rpc("my_reporter_record").single<ReporterStats>(),
      ])
    : [{ data: null }, { data: null }];
  const [{ data: bands }, { data: myRates }] = profile
    ? await Promise.all([
        supabase.from("rate_bands").select("visit_type, min_ngn, max_ngn").eq("state", profile.state),
        supabase.from("reporter_rates").select("visit_type, price_ngn").eq("user_id", user.id),
      ])
    : [{ data: [] }, { data: [] }];
  const rateMap = Object.fromEntries(((myRates ?? []) as { visit_type: VisitType; price_ngn: number }[]).map((r) => [r.visit_type, r.price_ngn]));

  return (
    <main className="wrap page" style={{ maxWidth: 560 }}>
      <h1>Your account</h1>
      <p>Signed in as <strong>{user.email}</strong>.</p>

      {isReporter && (
        <div className="panel" style={{ marginTop: "2rem" }}>
          <h2>Your reporter profile</h2>
          {record && <ReporterRecord r={record} />}
          <p className="small muted" style={{ marginTop: "1rem" }}>
            Owners looking for someone on the ground can see your profile and your record. The numbers come from your real check-ins:
            every verified visit builds it, and flagged ones count against it.
          </p>
          {profile?.is_public && (
            <p className="small">Your public page: <Link href={`/reporters/${profile.slug}`}>groundproof.site/reporters/{profile.slug}</Link></p>
          )}
          <ReporterProfileForm profile={profile} />
          {profile?.suspended && <p className="notice error">Your profile is paused. Reply to any Groundproof email to talk to us.</p>}
          {profile && !profile.agreed_rules_at && (
            <div style={{ marginTop: "2rem" }}>
              <h3>Reporter rules</h3>
              <p className="small muted">Agree to these before your prices show to owners.</p>
              <ReporterRulesForm />
            </div>
          )}
          {profile?.agreed_rules_at && (
            <div style={{ marginTop: "2rem" }}>
              <h3>Your prices per visit</h3>
              <p className="small muted">Owners see these on your profile. Each must sit inside Groundproof&apos;s range for {profile.state}, and it&apos;s the full price.</p>
              <ReporterRatesForm state={profile.state} bands={(bands ?? []) as { visit_type: VisitType; min_ngn: number; max_ngn: number }[]} rates={rateMap} />
            </div>
          )}
        </div>
      )}

      <div className="panel" id="emails" style={{ marginTop: "2rem" }}>
        <h2>Emails</h2>
        <EmailPrefsForm tips={prefs?.tips ?? true} digest={prefs?.digest ?? true} />
      </div>

      <div className="panel" style={{ marginTop: "2rem" }}>
        <h2>Delete your account</h2>
        <p>
          This permanently deletes your account, the properties you own, and all their photos and check-ins. It
          can&apos;t be undone. <Link href="/delete-account">What gets deleted</Link>
        </p>
        <DeleteForm />
      </div>
    </main>
  );
}
