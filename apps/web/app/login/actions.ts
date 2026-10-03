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
