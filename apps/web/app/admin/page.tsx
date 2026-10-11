import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { AdminView, type Stats } from "@/components/AdminView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pilot dashboard — Groundproof", robots: { index: false, follow: false } };

async function approveDeveloper(userId: string) {
  "use server";
  const supabase = createClient();
  await supabase.functions.invoke("admin-stats", { body: { action: "approve_developer", user_id: userId } });
  revalidatePath("/admin");
}

async function adminAction(body: Record<string, unknown>) {
  "use server";
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("admin-stats", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const res = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    return { ok: false, error: (res?.error as string) ?? "That didn't work." };
  }
  return { ok: true, data };
}

async function setBand(form: FormData) {
  "use server";
  const r = await adminAction({ action: "set_band", state: form.get("state"), visit_type: form.get("visit_type"), min_ngn: form.get("min_ngn"), max_ngn: form.get("max_ngn") });
  redirect(`/admin?notice=${encodeURIComponent(r.ok ? "ok:Range saved." : `error:${r.error}`)}`);
}
async function deleteBand(state: string, visitType: string) {
  "use server";
  await adminAction({ action: "delete_band", state, visit_type: visitType });
  revalidatePath("/admin");
}
async function createMatch(form: FormData) {
  "use server";
  const body: Record<string, unknown> = { action: "create_match" };
  form.forEach((v, k) => { body[k] = typeof v === "string" ? v : ""; });
  const r = await adminAction(body);
  const d = r.data as { invited?: string } | undefined;
  redirect(`/admin?notice=${encodeURIComponent(!r.ok ? `error:${r.error}`
    : d?.invited === "sent" ? "ok:Introduced. Both have the agreement, and the reporter has their invite code."
    : "ok:Introduced. Both have the agreement. Link the property once the owner adds it.")}`);
}
async function reviewApplication(id: string, decision: "approved" | "declined") {
  "use server";
  await adminAction({ action: "review_application", id, decision });
  redirect(`/admin?notice=${encodeURIComponent(decision === "approved" ? "ok:Approved. They've been emailed the app link and next steps." : "ok:Declined, with a polite email.")}`);
}
async function linkMatch(form: FormData) {
  "use server";
  const r = await adminAction({ action: "link_match_property", match_id: form.get("match_id"), property_id: form.get("property_id") });
  const invited = (r.data as { invited?: string } | undefined)?.invited;
  redirect(`/admin?notice=${encodeURIComponent(!r.ok ? `error:${r.error}` : invited === "already" ? "ok:Linked. The reporter was already on that property." : "ok:Linked. The reporter has been emailed their invite code.")}`);
}
async function closeRequest(id: string) {
  "use server";
  await adminAction({ action: "close_request", id });
  revalidatePath("/admin");
}
async function endMatch(id: string) {
  "use server";
  await adminAction({ action: "end_match", match_id: id });
  revalidatePath("/admin");
}
async function suspendReporter(userId: string, on: boolean) {
  "use server";
  await adminAction({ action: "suspend_reporter", user_id: userId, suspended: on });
  revalidatePath("/admin");
}

export default async function AdminPage({ searchParams }: { searchParams: { notice?: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/admin");
  const { data, error } = await supabase.functions.invoke("admin-stats", { body: {} });
  if (error || !data?.totals) notFound();
  const s = data as Stats;
  return (
    <AdminView
      s={s} approve={approveDeveloper} suspend={suspendReporter} notice={searchParams.notice}
      pricing={{ setBand, deleteBand, createMatch, endMatch }}
      todo={{ introduce: createMatch, review: reviewApplication, link: linkMatch, close: closeRequest }}
    />
  );
}

