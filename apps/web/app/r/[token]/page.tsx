import type { Metadata } from "next";
import Link from "next/link";
import { Report } from "@/components/Report";
import { loadSharedReport, reportSummary } from "@/lib/sharedReport";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const data = await loadSharedReport(params.token);
  const base = { robots: { index: false, follow: false } };
  if (!data) return { ...base, title: "Shared property report — Groundproof" };
  const s = reportSummary(data);
  const title = `${data.property.label}: property report — Groundproof`;
  const description = s.total > 0
    ? `${s.verified} verified check-in${s.verified === 1 ? "" : "s"}${s.flagged ? `, ${s.flagged} flagged` : ""}. Photos taken live in the app and checked against where they were taken.`
    : "Check-ins verified against the building's NIPOST postcode.";
  return { ...base, title, description, openGraph: { title, description, type: "article" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function SharedReport({ params }: { params: { token: string } }) {
  const data = await loadSharedReport(params.token);

  if (!data) {
    return (
      <main className="wrap page" style={{ maxWidth: 560 }}>
        <h1>This report isn&apos;t available</h1>
        <p>The link may be wrong, or the owner has turned sharing off. Ask them for a new link.</p>
        <Link className="btn secondary" href="/?src=shared-report">About Groundproof</Link>
      </main>
    );
  }
  return (
    <main className="wrap page">
      <p className="no-print shared-banner">
        <strong>Checked with Groundproof.</strong> Every photo below was taken live in the app, with the phone&apos;s location and time recorded.
      </p>
      <Report data={data} shared />
      <aside className="no-print report-cta-card">
        <h2>Own a property in Nigeria and can&apos;t be there?</h2>
        <p>Get the same kind of proof for your own house, build or land. The pilot is free: up to 2 properties and 5 verified check-ins on each. No card needed.</p>
        <Link className="btn" href="/pilot?src=shared-report">Start your free pilot</Link>
      </aside>
    </main>
  );
}
