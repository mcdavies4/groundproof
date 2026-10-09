import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { loadReport } from "@/lib/report";
import { Report } from "@/components/Report";

export const metadata: Metadata = { title: "Property report — Groundproof", robots: { index: false } };

export default async function ReportPage({ params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect(`/login?next=/properties/${params.id}/report`);
  const data = await loadReport(supabase, params.id);
  if (!data) notFound();
  return <main className="wrap page"><Report data={data} /></main>;
}
