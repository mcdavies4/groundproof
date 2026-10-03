"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addMilestone(propertyId: string, form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const amountRaw = String(form.get("amount") ?? "").trim();
  if (!name) return;
  const amount = amountRaw ? Number(amountRaw) : null;

  const supabase = createClient();
  const { count } = await supabase
    .from("milestones")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId);

  await supabase.from("milestones").insert({
    property_id: propertyId,
    name,
    amount_gbp: amount !== null && Number.isFinite(amount) ? amount : null,
    sort: count ?? 0,
  });
  revalidatePath(`/properties/${propertyId}`);
}

export async function createInvite(propertyId: string) {
  const supabase = createClient();
  await supabase.from("invites").insert({ property_id: propertyId });
  revalidatePath(`/properties/${propertyId}`);
}
