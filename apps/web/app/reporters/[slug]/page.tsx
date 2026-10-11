import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReporterPrices, ReporterRecord, type ReporterStats } from "@/components/ReporterRecord";
import { matchedVisitsFree } from "@/lib/rates";

export const dynamic = "force-dynamic";

type Profile = ReporterStats & { slug: string; display_name: string; state: string; areas: string; bio: string | null; joined: string; rates: Record<string, number> };

async function load(slug: string) {
  const supabase = createClient();
  const { data } = await supabase.rpc("reporter_public", { p_slug: slug }).maybeSingle<Profile>();
  return data;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await load(params.slug);
  if (!p) return { title: "Reporter — Groundproof" };
  return {
    title: `${p.display_name}, reporter in ${p.state} — Groundproof`,
    description: `${p.verified} verified property visits in ${p.areas}, ${p.state}.`,
  };
}

export default async function ReporterPage({ params }: { params: { slug: string } }) {
  const p = await load(params.slug);
  if (!p) notFound();
  const free = await matchedVisitsFree(createClient());

  return (
    <main className="wrap page narrow">
      <p className="small"><Link href={`/reporters?state=${encodeURIComponent(p.state)}`}>← Reporters in {p.state}</Link></p>
      <h1 style={{ marginBottom: "0.3rem" }}>{p.display_name}</h1>
      <p className="muted" style={{ marginTop: 0 }}>Covers {p.areas}, {p.state}</p>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Track record</h2>
        <ReporterRecord r={p} />
        <p className="small muted" style={{ marginBottom: 0, marginTop: "0.8rem" }}>
          Every visit is checked by Groundproof against the building&apos;s NIPOST postcode, the phone&apos;s GPS and compass, and photos
          from the first visit. These numbers can&apos;t be edited by the reporter.
        </p>
      </div>

      {p.bio && (
        <>
          <h2>About</h2>
          <p style={{ whiteSpace: "pre-line" }}>{p.bio}</p>
        </>
      )}

      {Object.keys(p.rates ?? {}).length > 0 && (
        <>
          <h2>Prices per visit</h2>
          <ReporterPrices rates={p.rates} />
          <p className="small muted">Full prices, no extras, inside <Link href="/rates">Groundproof&apos;s range for {p.state}</Link>.{free ? " During the pilot, Groundproof's checks on these visits are free." : ""}</p>
        </>
      )}

      <h2>Want {p.display_name.split(" ")[0]} to visit your property?</h2>
      <p>Tell us about your property and we&apos;ll introduce you. You agree the visit fee with them directly.</p>
      <Link className="btn" href={`/find-someone?reporter=${p.slug}`}>Ask for an introduction</Link>
    </main>
  );
}
