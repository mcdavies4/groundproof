"use server";

import { createClient } from "@/lib/supabase/server";

export type FormState = { ok?: string; error?: string };

export async function joinWaitlist(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const plan = String(form.get("plan") ?? "") || null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter an email address like name@example.com." };
  }
  const supabase = createClient();
  const { error } = await supabase.from("waitlist").insert({ email, plan });
  if (error && error.code !== "23505") return { error: "Couldn't save that. Try again in a minute." };
  return { ok: "You're on the list. We'll email you when pilots open." };
}

/** "Find someone" and "become a reporter" forms. Saved and emailed by the submit-lead edge function. */
export async function submitLead(_prev: FormState, form: FormData): Promise<FormState> {
  const body: Record<string, unknown> = {};
  form.forEach((v, k) => { body[k] = typeof v === "string" ? v : ""; });
  const supabase = createClient();
  const { error } = await supabase.functions.invoke("submit-lead", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const res = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    return { error: res?.error ?? "Couldn't send that. Try again in a minute." };
  }
  return {
    ok: body.kind === "reporter"
      ? "Thanks, you're on our list. We've emailed you a copy, and we'll contact you when an owner near you needs someone."
      : "Thanks, we've got it. Check your email for a copy. We'll come back to you within 3 working days.",
  };
}
