"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/app/actions";

export async function deleteAccount(_prev: FormState, form: FormData): Promise<FormState> {
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }
  const supabase = createClient();
  const { error } = await supabase.functions.invoke("delete-account", { body: {} });
  if (error) return { error: "Couldn't delete your account. Try again, or email us." };
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 30).replace(/^-|-$/g, "");

/** Create or update the signed-in reporter's public profile. The track record isn't editable. */
export async function saveReporterProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const displayName = String(form.get("display_name") ?? "").trim().slice(0, 60);
  const state = String(form.get("state") ?? "").trim();
  const areas = String(form.get("areas") ?? "").trim().slice(0, 200);
  const bio = String(form.get("bio") ?? "").trim().slice(0, 400) || null;
  const isPublic = form.get("is_public") === "on";
  if (displayName.length < 2) return { error: "Add the name owners will see, for example Tunde A." };
  if (!state) return { error: "Pick your state." };
  if (areas.length < 2) return { error: "Add the areas you cover." };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in again." };

  const { data: existing } = await supabase.from("reporter_profiles").select("slug").eq("user_id", user.id).maybeSingle();
  const fields = { display_name: displayName, state, areas, bio, is_public: isPublic, updated_at: new Date().toISOString() };

  if (existing) {
    const { error } = await supabase.from("reporter_profiles").update(fields).eq("user_id", user.id);
    if (error) return { error: "Couldn't save. Try again." };
    return { ok: "Saved." };
  }

  // New profile: a readable link that stays the same even if they change their name later.
  const base = slugify(displayName) || "reporter";
  for (let i = 0; i < 4; i++) {
    const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase.from("reporter_profiles").insert({ user_id: user.id, slug, ...fields });
    if (!error) return { ok: "Profile created." };
    if (error.code !== "23505") return { error: "Couldn't create your profile. You need to be the reporter on at least one property." };
  }
  return { error: "Couldn't create your profile. Try again." };
}

export async function saveEmailPrefs(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in again." };
  const { error } = await supabase.from("email_prefs").upsert({
    user_id: user.id,
    tips: form.get("tips") === "on",
    digest: form.get("digest") === "on",
    updated_at: new Date().toISOString(),
  });
  return error ? { error: "Couldn't save. Try again." } : { ok: "Saved." };
}

export async function agreeReporterRules(_prev: FormState, form: FormData): Promise<FormState> {
  if (form.get("agree") !== "on") return { error: "Tick the box to agree to the rules." };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in again." };
  const { error } = await supabase.from("reporter_profiles").update({ agreed_rules_at: new Date().toISOString() }).eq("user_id", user.id);
  if (error) return { error: "Create your reporter profile first, then agree to the rules." };
  revalidatePath("/account");
  return { ok: "Thanks. You can set your prices now." };
}

export async function saveReporterRates(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in again." };
  for (const t of ["standard", "distance", "first"] as const) {
    const raw = String(form.get(t) ?? "").replace(/[^\d]/g, "");
    if (!raw) {
      await supabase.from("reporter_rates").delete().eq("user_id", user.id).eq("visit_type", t);
      continue;
    }
    const { error } = await supabase.from("reporter_rates").upsert({ user_id: user.id, visit_type: t, price_ngn: Number(raw) });
    if (error) return { error: error.message.replace(/^[A-Z_]+:\s*/, "") };
  }
  revalidatePath("/account");
  return { ok: "Prices saved." };
}
