"use server";

import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/app/actions";

export async function sendLink(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = String(form.get("next") ?? "/dashboard");
  if (!email) return { error: "Enter your email address." };

  const supabase = createClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: error.message };
  return { ok: `Sign-in link sent to ${email}. Open it on this device.` };
}
