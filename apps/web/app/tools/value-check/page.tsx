import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { COVERED_STATES } from "@/lib/valuecheck/coverage";
import { ValueCheckForm } from "./ValueCheckForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "ValueCheck: an evidence-based estimate for land and homes — Groundproof",
  description: "An indicative value range for land or a home in Lagos, with the comparable evidence, how reliable it is, and what's missing. Not a formal valuation.",
};

type Params = { area?: string; lat?: string; lng?: string; category?: string };

export default async function ValueCheckPage({ searchParams }: { searchParams: Params }) {
  const { user } = await requireUser();
  const qs = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  const plotArea = Number(searchParams.area);
  const fromPlot = Number.isFinite(plotArea) && plotArea > 0
    ? { area: Math.round(plotArea * 10) / 10, lat: searchParams.lat ?? "", lng: searchParams.lng ?? "" }
    : null;

  return (
    <main className="wrap page narrow">
      <h1>ValueCheck</h1>
      <p className="lede">
        What might this land or home be worth, and what is that based on? ValueCheck shows a range from real market evidence,
        the comparables behind it, how much to trust it, and what&apos;s missing.
      </p>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Straight about what this is</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>An <strong>indicative estimate</strong>, not a formal valuation. For a purchase, loan or dispute, use a registered estate surveyor and valuer.</li>
          <li>Built only from market observations we&apos;ve reviewed. <strong>No evidence near you? We say so</strong> and don&apos;t invent a number.</li>
          <li>Asking prices are shown as asking prices. We never pass them off as sale prices.</li>
          <li>Starting with <strong>{Object.keys(COVERED_STATES).join(", ")}</strong>. {Object.values(COVERED_STATES)[0].note}</li>
        </ul>
      </div>

      {user ? (
        <ValueCheckForm fromPlot={fromPlot} initialCategory={searchParams.category === "residential" ? "residential" : "land"} />
      ) : (
        <div className="panel">
          <p>Sign in to run a ValueCheck. We keep your reports private to your account.</p>
          <Link className="btn" href={`/login?next=${encodeURIComponent(`/tools/value-check${qs ? `?${qs}` : ""}`)}`}>Sign in to continue</Link>
        </div>
      )}

      <p className="small muted" style={{ marginTop: "1.5rem" }}>
        Have survey-plan coordinates for land? <Link href="/tools/plot-check">Check the plot first</Link> and bring its area here.
      </p>
    </main>
  );
}
