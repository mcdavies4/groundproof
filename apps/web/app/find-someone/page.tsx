import type { Metadata } from "next";
import Link from "next/link";
import { OwnerRequestForm } from "@/components/LeadForms";
import { createClient } from "@/lib/supabase/server";
import { matchedVisitsFree } from "@/lib/rates";

export const metadata: Metadata = {
  title: "No one on the ground? We'll find someone — Groundproof",
  description: "Building or buying in Nigeria from abroad, with no trusted relative nearby? We match you with a local person who visits with the Groundproof app, and every visit is still verified.",
};

export default async function FindSomeone({ searchParams }: { searchParams: { reporter?: string } }) {
  const free = await matchedVisitsFree(createClient());
  const reporter = /^[a-z0-9-]{3,40}$/.test(searchParams.reporter ?? "") ? searchParams.reporter! : null;
  return (
    <main className="wrap page narrow">
      <h1>No one on the ground? We&apos;ll find someone.</h1>
      <p className="lede">
        Lots of people building or buying in Nigeria from abroad don&apos;t have a relative they can send, or don&apos;t want to.
        Tell us where your property is and we&apos;ll match you with a local person: a surveyor, estate agent or builder who visits with the Groundproof app.
      </p>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>You don&apos;t have to take their word for it</h2>
        <p style={{ marginBottom: 0 }}>
          That&apos;s the point. Every visit is still checked against the building&apos;s NIPOST postcode, the phone&apos;s GPS and compass, and the anchor photos.
          If someone sends old photos or checks in from somewhere else, you see it flagged.
        </p>
      </div>

      <h2>How it works</h2>
      <ol className="steps-plain">
        <li>Fill in the form. It takes a minute.</li>
        <li>Within 3 working days we email you someone who covers your area, what they charge per visit, and when they can start.</li>
        <li>If you&apos;re happy, you send them your property&apos;s invite code. Their first visit anchors the property, and you see every check-in from then on.</li>
      </ol>
      <p className="small muted">
        You pay one price per visit, inside <Link href="/rates">our range for your state</Link>, agreed in writing before the first visit.
        {free ? " During the pilot, Groundproof's checks on these visits are free, so you never pay twice." : " Groundproof's checks are covered by your plan or check-ins, as normal."} We&apos;re building this network now, so in areas
        where we don&apos;t have anyone yet, we&apos;ll tell you honestly.
      </p>

      <h2>Tell us about your property</h2>
      {reporter && <p className="notice">We&apos;ll ask <Link href={`/reporters/${reporter}`}>this reporter</Link> first.</p>}
      <OwnerRequestForm reporter={reporter} />

      <p className="small muted" style={{ marginTop: "2rem" }}>
        Browse <Link href="/reporters">reporters and their records</Link>. Live in Nigeria and want to earn from visits?{" "}
        <Link href="/become-a-reporter">Apply to be a reporter</Link>.
      </p>
    </main>
  );
}
