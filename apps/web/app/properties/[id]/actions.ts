"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CURRENCIES, type Currency, type Product } from "@/lib/types";
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
    amount: amount !== null && Number.isFinite(amount) && amount >= 0 ? amount : null,
    sort: count ?? 0,
  });
  revalidatePath(`/properties/${propertyId}`);
}

export async function createInvite(propertyId: string) {
  const supabase = createClient();
  await supabase.from("invites").insert({ property_id: propertyId });
  revalidatePath(`/properties/${propertyId}`);
}

export async function startCheckout(propertyId: string, product: Product) {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("create-payment", {
    body: { property_id: propertyId, product },
  });
  if (error || !data?.link) {
    redirect(`/properties/${propertyId}?payment=error`);
  }
  redirect(data.link);
}

export async function setCurrency(propertyId: string, form: FormData) {
  const currency = String(form.get("currency") ?? "") as Currency;
  if (!(currency in CURRENCIES)) return;
  const supabase = createClient();
  await supabase.from("properties").update({ payment_currency: currency }).eq("id", propertyId);
  revalidatePath(`/properties/${propertyId}`);
}

export async function createShareLink(propertyId: string) {
  const supabase = createClient();
  const token = randomBytes(18).toString("base64url");
  await supabase.from("properties").update({ share_token: token }).eq("id", propertyId);
  revalidatePath(`/properties/${propertyId}`);
}

export async function revokeShareLink(propertyId: string) {
  const supabase = createClient();
  await supabase.from("properties").update({ share_token: null }).eq("id", propertyId);
  revalidatePath(`/properties/${propertyId}`);
}
