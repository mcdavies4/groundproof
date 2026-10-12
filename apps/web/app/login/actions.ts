"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/app/actions";

/** The site's own origin, from the request, so links never point at localhost by mistake. */
function siteOrigin() {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function sendLink(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = String(form.get("next") ?? "/dashboard");
  if (!email) return { error: "Enter your email address." };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
      // Only stored when this creates a new account: where they came from, for the pilot funnel.
      data: { signup_via: "web", source: cookies().get("gp_src")?.value ?? "direct", landing: cookies().get("gp_land")?.value ?? null },
    },
  });
  if (error) return { error: error.message };
  return { ok: `Sign-in link sent to ${email}. Open it in this same browser.` };
}
