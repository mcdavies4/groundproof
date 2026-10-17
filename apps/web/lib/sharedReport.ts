import { cache } from "react";
import type { ReportData } from "@/lib/report";

/** Loads a shared report without cookies, so page metadata and the preview image can use it too. Cached per request. */
export const loadSharedReport = cache(async (token: string): Promise<ReportData | null> => {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/shared-report`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}` },
      body: JSON.stringify({ token }),
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.property ? (data as ReportData) : null;
  } catch {
    return null;
  }
});

export function reportSummary(data: ReportData) {
  const n = (v: string) => data.checkins.filter((c) => c.verdict === v).length;
  const last = data.checkins[0];
  return {
    total: data.checkins.length, verified: n("verified"), review: n("review"), flagged: n("flagged"),
    last: last ? new Date(last.time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null,
  };
}
