import type { SupabaseClient } from "@supabase/supabase-js";
import type { Currency, Verdict } from "@/lib/types";

export interface ReportCheckin {
  id: string; time: string; verdict: Verdict; reason: string | null; note: string | null; photoNote: string | null;
  isAnchor: boolean; matchType: "postcode" | "coordinates" | null; stage: string | null; photos: string[];
}
export interface ReportData {
  property: {
    label: string; postcode: string | null; anchorMode: "postcode" | "coordinates" | null; anchoredAt: string | null;
    address: string | null; area: string | null; use: string | null; currency: Currency;
  };
  milestones: { name: string; amount: number | null; done: boolean; doneAt: string | null }[];
  checkins: ReportCheckin[];
  generatedAt: string;
}

const MAX_CHECKINS = 30;

/** Report for a property the signed-in user can see (row-level security applies). Same shape as the shared-report function. */
export async function loadReport(supabase: SupabaseClient, propertyId: string): Promise<ReportData | null> {
  const { data: p } = await supabase.from("properties")
    .select("id, label, postcode, anchor_mode, anchored_at, nipost_address, nipost_building_use, payment_currency")
    .eq("id", propertyId).maybeSingle();
  if (!p) return null;

  const [{ data: ms }, { data: cs }] = await Promise.all([
    supabase.from("milestones").select("id, name, amount, completed_checkin_id").eq("property_id", p.id).order("sort"),
    supabase.from("checkins")
      .select("id, server_time, verdict, verdict_reason, photo_note, note, is_anchor, match_type, milestone_id, photo_paths")
      .eq("property_id", p.id).neq("verdict", "pending")
      .order("server_time", { ascending: false }).limit(MAX_CHECKINS),
  ]);

  const paths = (cs ?? []).flatMap((c) => (c.photo_paths as string[]).slice(0, 4));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("checkins").createSignedUrls(paths, 60 * 60);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const stageName = new Map((ms ?? []).map((m) => [m.id, m.name as string]));
  const timeById = new Map((cs ?? []).map((c) => [c.id, c.server_time as string]));
  const admin = p.nipost_address?.administrative;

  return {
    property: {
      label: p.label, postcode: p.postcode, anchorMode: p.anchor_mode, anchoredAt: p.anchored_at,
      address: p.nipost_address?.recent_house_address ?? null,
      area: [admin?.locality_name, admin?.lga_name, admin?.state_name].filter(Boolean).join(", ") || null,
      use: p.nipost_building_use, currency: (p.payment_currency ?? "NGN") as Currency,
    },
    milestones: (ms ?? []).map((m) => ({
      name: m.name, amount: m.amount === null ? null : Number(m.amount), done: !!m.completed_checkin_id,
      doneAt: m.completed_checkin_id ? timeById.get(m.completed_checkin_id) ?? null : null,
    })),
    checkins: (cs ?? []).map((c) => ({
      id: c.id, time: c.server_time, verdict: c.verdict, reason: c.verdict_reason, note: c.note, photoNote: c.photo_note,
      isAnchor: c.is_anchor, matchType: c.match_type, stage: c.milestone_id ? stageName.get(c.milestone_id) ?? null : null,
      photos: (c.photo_paths as string[]).slice(0, 4).map((x) => urls.get(x)).filter((u): u is string => !!u),
    })),
    generatedAt: new Date().toISOString(),
  };
}
