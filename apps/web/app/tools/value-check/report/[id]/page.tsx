import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { ValueReport } from "@/components/ValueReport";
import { PrintButton } from "@/components/PrintButton";
import type { Subject, ValuationResult } from "@/lib/valuecheck/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ValueCheck report — Groundproof", robots: { index: false, follow: false } };

export default async function ValueCheckReport({ params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tools/value-check/report/${params.id}`)}`);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  // Row-level security limits both reads to the signed-in user's own rows.
  const { data: req } = await supabase.from("valuation_requests").select("id, subject, created_at").eq("id", params.id).maybeSingle();
  const { data: res } = req ? await supabase.from("valuation_results").select("result").eq("request_id", req.id).maybeSingle() : { data: null };
  if (!req || !res) notFound();

  const subject = req.subject as Subject;
  return (
    <main className="wrap page">
      <p className="small"><Link href="/tools/value-check">← New ValueCheck</Link></p>
      <h1>ValueCheck report</h1>
      <p className="lede" style={{ maxWidth: "62ch" }}>{subject.neighbourhood}, {subject.lga}, {subject.state}</p>
      <ValueReport subject={subject} result={res.result as ValuationResult} />
      <p style={{ marginTop: "1.5rem" }}><PrintButton /></p>
    </main>
  );
}
