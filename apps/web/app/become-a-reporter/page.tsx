import type { Metadata } from "next";
import Link from "next/link";
import { ReporterApplyForm } from "@/components/LeadForms";

export const metadata: Metadata = {
  title: "Earn from property visits near you — Groundproof",
  description: "Nigerians abroad need trusted people to visit their properties. Apply to do paid check-ins with the Groundproof app in your area.",
};

export default function BecomeAReporter() {
  return (
    <main className="wrap page narrow">
      <h1>Earn from property visits near you</h1>
      <p className="lede">
        Nigerians abroad are building houses and buying land at home, and they need someone reliable to go and look.
        If you know your area and have an Android phone, you can do these visits with the Groundproof app.
      </p>

      <h2>What a visit involves</h2>
      <ul>
        <li>Go to the property and open the Groundproof app.</li>
        <li>Take 1 to 4 photos from the spots the app shows you, and add a short note.</li>
        <li>The app checks the location and sends everything to the owner. A visit usually takes 10 to 15 minutes on site.</li>
      </ul>

      <h2>Who we&apos;re looking for</h2>
      <ul>
        <li>Surveyors, estate agents, builders, corps members and anyone reliable who knows their area</li>
        <li>An Android phone with a working camera and GPS (the app works with no signal and uploads later)</li>
        <li>Happy to be on time and honest about what you see</li>
      </ul>

      <h2>Pay</h2>
      <p>
        You agree a fee per visit with each owner before you start, and they pay you directly. We&apos;re growing the network area by area,
        so we&apos;ll contact you when an owner near you needs someone.
      </p>

      <h2>Apply</h2>
      <ReporterApplyForm />

      <p className="small muted" style={{ marginTop: "2rem" }}>
        Own property in Nigeria and need someone? <Link href="/find-someone">We&apos;ll find someone for you</Link>.
      </p>
    </main>
  );
}
