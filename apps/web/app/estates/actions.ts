"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/app/actions";

async function fnError(error: unknown, fallback: string) {
  const ctx = (error as { context?: Response }).context;
  const body = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
  return (body?.error as string) ?? fallback;
}

export async function applyDeveloper(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("developer-apply", {
    body: { company: form.get("company"), website: form.get("website"), phone: form.get("phone") },
  });
  if (error) return { error: await fnError(error, "Couldn't send that. Try again.") };
  if (data?.approved) redirect("/estates");
  revalidatePath("/developers");
  return { ok: "Thanks. We'll check your details and email you, usually within 1 working day." };
}

export async function createEstate(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const location = String(form.get("location") ?? "").trim().slice(0, 200);
  if (name.length < 2 || location.length < 2) return { error: "Add the estate's name and location." };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in again." };
  const { data, error } = await supabase.from("estates").insert({ developer_id: user.id, name, location }).select("id").single();
  if (error || !data) return { error: "Couldn't create the estate. Your developer account may still be waiting for approval." };
  redirect(`/estates/${data.id}`);
}

export async function addUnits(estateId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const labels = String(form.get("labels") ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!labels.length) return { error: "Add at least one unit, one per line." };
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("estate-units", { body: { estate_id: estateId, labels } });
  if (error) return { error: await fnError(error, "Couldn't add the units.") };
  revalidatePath(`/estates/${estateId}`);
  return { ok: `Added ${data.added} unit${data.added === 1 ? "" : "s"}${data.skipped ? `, skipped ${data.skipped} already there` : ""}.` };
}

export type BuyerState = FormState & { results?: { unit: string; email: string; status: string }[] };

export async function addBuyers(estateId: string, _prev: BuyerState, form: FormData): Promise<BuyerState> {
  const rows = String(form.get("rows") ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.lastIndexOf(",");
    return i < 0 ? { unit: l, email: "" } : { unit: l.slice(0, i).trim(), email: l.slice(i + 1).trim() };
  });
  if (!rows.length) return { error: "Add at least one line: unit, email." };
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("estate-buyers", { body: { estate_id: estateId, rows } });
  if (error) return { error: await fnError(error, "Couldn't add the buyers.") };
  revalidatePath(`/estates/${estateId}`);
  return { results: data.results };
}

export async function createEstateCode(estateId: string) {
  const supabase = createClient();
  await supabase.from("invites").insert({ estate_id: estateId, property_id: null });
  revalidatePath(`/estates/${estateId}`);
}

export async function setEstateShare(estateId: string, on: boolean) {
  const supabase = createClient();
  await supabase.from("estates").update({ share_token: on ? randomBytes(18).toString("base64url") : null }).eq("id", estateId);
  revalidatePath(`/estates/${estateId}`);
}

export async function startEstateCheckout(estateId: string, product: "estate_30" | "estate_365") {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("create-payment", { body: { estate_id: estateId, product } });
  if (error || !data?.link) redirect(`/estates/${estateId}?payment=error#plan`);
  redirect(data.link);
}
