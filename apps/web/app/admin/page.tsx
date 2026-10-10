import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { AdminView, type Stats } from "@/components/AdminView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pilot dashboard — Groundproof", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/admin");
  const { data, error } = await supabase.functions.invoke("admin-stats", { body: {} });
  if (error || !data?.totals) notFound();
  const s = data as Stats;
  return <AdminView s={s} />;
}

