"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/app/actions";

/** Lines like "PB 1234, 8.98123, 7.37145" -> beacons. */
function parse(text: string) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const parts = l.split(/[,\t;]+/).map((x) => x.trim()).filter(Boolean);
    const nums = parts.filter((x) => /^-?\d+(\.\d+)?$/.test(x)).map(Number);
    const label = parts.find((x) => !/^-?\d+(\.\d+)?$/.test(x)) ?? `Beacon ${i + 1}`;
    return { label, lat: nums[0], lng: nums[1] };
  });
}

export async function addPlot(_prev: FormState, form: FormData): Promise<FormState> {
  const label = String(form.get("label") ?? "").trim();
  const beacons = parse(String(form.get("beacons") ?? ""));
  if (beacons.some((b) => !Number.isFinite(b.lat) || !Number.isFinite(b.lng))) {
    return { error: "Each line needs a beacon name, then latitude, then longitude, for example: PB 1234, 8.981234, 7.371456" };
  }
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("add-plot", {
    body: { label, beacons, plan_accuracy_m: Number(form.get("plan_accuracy_m") ?? 5) },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const body = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    return { error: body?.error ?? "Couldn't save the plot. Try again." };
  }
  redirect(`/properties/${data.property.id}`);
}
