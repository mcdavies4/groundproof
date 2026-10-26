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

export async function inviteViewer(propertyId: string, form: FormData) {
  const email = String(form.get("email") ?? "").trim();
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("invite-viewer", {
    body: { property_id: propertyId, email },
  });
  let msg = "sent";
  if (error) {
    // FunctionsHttpError carries the response; pull our friendly message out of it.
    const ctx = (error as { context?: Response }).context;
    const body = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    msg = "error:" + (body?.error ?? "Couldn't send the invite. Try again.");
  } else if (data && data.emailed === false) {
    msg = "saved";
  }
  revalidatePath(`/properties/${propertyId}`);
  redirect(`/properties/${propertyId}?viewer=${encodeURIComponent(msg)}#people`);
}

export async function removeViewer(propertyId: string, inviteId: string) {
  const supabase = createClient();
  await supabase.rpc("remove_viewer", { p_invite: inviteId });
  revalidatePath(`/properties/${propertyId}`);
}

export async function leaveProperty(propertyId: string) {
  const supabase = createClient();
  await supabase.rpc("leave_property", { p_property: propertyId });
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function requestCheckin(propertyId: string, form: FormData) {
  const note = String(form.get("note") ?? "").trim();
  const dueBy = String(form.get("due_by") ?? "").trim();
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("request-checkin", {
    body: { property_id: propertyId, note, due_by: dueBy || null },
  });
  let msg = "sent";
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const body = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    msg = "error:" + (body?.error ?? "Couldn't send the request. Try again.");
  } else if (data && data.emailed === 0) {
    msg = "saved";
  }
  revalidatePath(`/properties/${propertyId}`);
  redirect(`/properties/${propertyId}?request=${encodeURIComponent(msg)}#ground`);
}

export async function cancelRequest(propertyId: string, requestId: string) {
  const supabase = createClient();
  await supabase.rpc("cancel_checkin_request", { p_request: requestId });
  revalidatePath(`/properties/${propertyId}`);
}

export async function setRequireCode(propertyId: string, on: boolean) {
  const supabase = createClient();
  await supabase.from("properties").update({ require_code: on }).eq("id", propertyId);
  revalidatePath(`/properties/${propertyId}`);
}

export async function setRequireVideo(propertyId: string, on: boolean) {
  const supabase = createClient();
  await supabase.from("properties").update({ require_video: on }).eq("id", propertyId);
  revalidatePath(`/properties/${propertyId}`);
}

/** A buyer on an estate unit asks for an independent Groundproof reporter. */
export async function requestIndependent(propertyId: string, form: FormData) {
  const supabase = createClient();
  const { error } = await supabase.functions.invoke("independent-check", {
    body: {
      property_id: propertyId, name: form.get("name"), state: form.get("state"),
      frequency: form.get("frequency"), notes: form.get("notes"),
    },
  });
  let msg = "sent";
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const res = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    msg = `error:${(res?.error as string) ?? "That didn't work. Try again."}`;
  }
  redirect(`/properties/${propertyId}?independent=${encodeURIComponent(msg)}#independent`);
}
