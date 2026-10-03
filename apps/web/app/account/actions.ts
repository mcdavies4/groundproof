"use server";

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
