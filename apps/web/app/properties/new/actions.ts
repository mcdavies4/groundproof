"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/app/actions";

export async function addProperty(_prev: FormState, form: FormData): Promise<FormState> {
  const label = String(form.get("label") ?? "").trim();
  const postcode = String(form.get("postcode") ?? "").trim();
  const unknown = form.get("unknown") === "on";

  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("add-property", { body: { label, postcode, unknown } });

  if (error) {
    // FunctionsHttpError carries the JSON body from the edge function
    let message = "Couldn't add the property. Try again.";
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch { /* keep default */ }
    return { error: message };
  }
  redirect(`/properties/${data.property.id}`);
}
