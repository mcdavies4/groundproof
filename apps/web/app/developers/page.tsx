import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DeveloperApplyForm } from "@/components/EstateForms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "For developers: verified progress for every buyer — Groundproof",
  description: "Selling plots or homes to Nigerians abroad? Give every buyer independently verified progress on their own unit, checked against NIPOST postcodes, GPS and photos.",
};

export default async function Developers() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: dev } = user ? await supabase.from("developers").select("approved").eq("user_id", user.id).maybeSingle() : { data: null };
  if (dev?.approved) redirect("/estates");

  return (
    <main className="wrap page narrow">
      <h1>Your buyers abroad want proof. Give it to them.</h1>
      <p className="lede">
        The question every diaspora buyer asks is &ldquo;is it really being built?&rdquo; With Groundproof, every buyer watches their own unit
        rise, through visits checked independently against the NIPOST postcode, GPS, compass and photos. Not your marketing photos: verified ones.
      </p>

      <h2>How it works for an estate</h2>
      <ol>
        <li>Create the estate and add its units: 40 plots in one go.</li>
        <li>Give your site supervisor or an independent reporter one code. It covers every unit, including ones you add later.</li>
        <li>Paste in your buyers&apos; emails. Each one sees only their own unit, with photos, verdicts, stages and a monthly summary.</li>
        <li>Share a public &ldquo;verified by Groundproof&rdquo; page for the whole estate with prospective buyers.</li>
      </ol>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Why it sells</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>Buyers stop calling to ask for updates: they already have them.</li>
          <li>Stage payments go faster when the stage is verified.</li>
          <li>&ldquo;Independently verified&rdquo; beats any brochure when you&apos;re selling to people 5,000 km away.</li>
        </ul>
      </div>

      <h2>Apply for a developer account</h2>
      {!user ? (
        <p><Link className="btn" href="/login?next=/developers">Sign in to apply</Link></p>
      ) : dev && !dev.approved ? (
        <p className="notice">Thanks, your application is in. We&apos;ll email you once it&apos;s approved.</p>
      ) : (
        <DeveloperApplyForm />
      )}
      <p className="small muted" style={{ marginTop: "1.5rem" }}>Every unit starts with 5 free check-ins. After that, one estate plan covers unlimited visits on every unit, priced per unit per month. Buyers always watch free. We approve developer accounts by hand to keep the service trustworthy.</p>
    </main>
  );
}
