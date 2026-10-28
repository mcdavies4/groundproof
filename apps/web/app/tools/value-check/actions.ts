"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { estimate } from "@/lib/valuecheck/engine";
import { validateRequest, type Raw } from "@/lib/valuecheck/validate";
import type { Observation } from "@/lib/valuecheck/types";

export type ValueCheckState = { error?: string; fieldErrors?: Record<string, string> };

type CandidateRow = {
  id: string; category: Observation["category"]; state: string; lga: string; neighbourhood: string; property_type: string;
  price_ngn: number | string; price_basis: Observation["priceBasis"]; land_area_sqm: number | string | null;
  building_area_sqm: number | string | null; bedrooms: number | null; condition: Observation["condition"]; observed_on: string;
  source_type: Observation["sourceType"]; source_label: string; verification: Observation["verification"];
  lat: number | null; lng: number | null;
};
const n = (v: number | string | null) => (v === null ? null : Number(v));

export async function runValueCheck(_prev: ValueCheckState, form: FormData): Promise<ValueCheckState> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sign in to run a ValueCheck." };

  const raw: Raw = {};
  form.forEach((v, k) => { if (typeof v === "string" && !k.startsWith("$ACTION")) raw[k] = v; });
  raw.utilities = form.getAll("utilities").filter((x): x is string => typeof x === "string").join(",");

  const v = validateRequest(raw);
  if (!v.ok) return { error: "Check the highlighted details and try again.", fieldErrors: v.errors };
  const subject = v.subject;

  const { data: rows, error: rpcError } = await supabase.rpc("valuecheck_candidates", {
    p_category: subject.category, p_state: subject.state, p_lga: subject.lga,
  });
  if (rpcError) return { error: "Couldn't look up market evidence just now. Try again in a minute." };

  const observations: Observation[] = ((rows ?? []) as CandidateRow[]).map((r) => ({
    id: r.id, category: r.category, state: r.state, lga: r.lga, neighbourhood: r.neighbourhood, propertyType: r.property_type,
    priceNgn: Number(r.price_ngn), priceBasis: r.price_basis, landAreaSqm: n(r.land_area_sqm), buildingAreaSqm: n(r.building_area_sqm),
    bedrooms: r.bedrooms, condition: r.condition, observedOn: r.observed_on, sourceType: r.source_type, sourceLabel: r.source_label,
    verification: r.verification, lat: r.lat, lng: r.lng,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const result = estimate(subject, observations, today);

  const { data: req, error: reqError } = await supabase.from("valuation_requests")
    .insert({ category: subject.category, state: subject.state, lga: subject.lga, neighbourhood: subject.neighbourhood, subject })
    .select("id").single();
  if (reqError || !req) {
    return { error: reqError?.message.includes("VALUECHECK_LIMIT") ? "You've reached today's limit of 30 valuations. Try again tomorrow." : "Couldn't save that. Try again." };
  }

  const { error: resError } = await supabase.from("valuation_results").insert({
    request_id: req.id,
    status: result.status,
    calc_version: result.calcVersion,
    valuation_date: result.valuationDate,
    range_low: result.range?.low ?? null,
    range_high: result.range?.high ?? null,
    central: result.central,
    confidence_score: result.confidence?.score ?? null,
    confidence_level: result.confidence?.level ?? null,
    result,
  });
  if (resError) return { error: "Couldn't save the report. Try again." };

  redirect(`/tools/value-check/report/${req.id}`);
}
