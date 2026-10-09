import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Report } from "@/components/Report";
import type { ReportData } from "@/lib/report";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shared property report — Groundproof",
  description: "Check-ins verified against the building's NIPOST postcode.",
  robots: { index: false, follow: false },
};

export default async function SharedReport({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const { data } = await supabase.functions.invoke("shared-report", { body: { token: params.token } });

  if (!data?.property) {
    return (
      <main className="wrap page" style={{ maxWidth: 560 }}>
        <h1>This report isn&apos;t available</h1>
        <p>The link may be wrong, or the owner has turned sharing off. Ask them for a new link.</p>
        <Link className="btn secondary" href="/">About Groundproof</Link>
      </main>
    );
  }
  return (
    <main className="wrap page">
      <Report data={data as ReportData} shared />
      <p className="no-print report-cta">
        Building or buying in Nigeria from abroad? <Link href="/">See how Groundproof works</Link>.
      </p>
    </main>
  );
}
