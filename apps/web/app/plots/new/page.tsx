import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { PlotForm } from "@/components/PlotForm";

export const metadata: Metadata = { title: "Check a plot before you buy — Groundproof" };

export default async function NewPlot({ searchParams }: { searchParams: { b?: string; acc?: string } }) {
  const { user } = await requireUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/plots/new${searchParams.b ? `?b=${encodeURIComponent(searchParams.b)}&acc=${searchParams.acc ?? ""}` : ""}`)}`);

  // Beacons handed over from the plot check tool.
  let initial = "";
  try {
    const b = JSON.parse(searchParams.b ?? "[]") as { label: string; lat: number; lng: number }[];
    initial = b.slice(0, 30).map((x) => `${String(x.label).replace(/[,\n]/g, " ")}, ${Number(x.lat).toFixed(7)}, ${Number(x.lng).toFixed(7)}`).join("\n");
  } catch { /* typed in by hand instead */ }
  const accuracy = Math.min(50, Math.max(0, Number(searchParams.acc) || 5));

  return (
    <main className="wrap page narrow">
      <h1>Check a plot before you buy</h1>
      <p className="lede">
        Someone on the ground walks to every beacon on the survey plan with the Groundproof app. We compare where each beacon really is,
        and the size and shape of the plot, with the plan. You find out if the land you&apos;re shown is the land on the paper.
      </p>
      <PlotForm initial={initial} accuracy={accuracy} />
      <p className="small muted" style={{ marginTop: "1.5rem" }}>
        After saving, create an invite code for the person who&apos;ll walk the plot, or <Link href="/find-someone">let us find someone</Link>.
        Groundproof checks where the beacons are, not who owns the land: have a lawyer search the title before you pay.
      </p>
    </main>
  );
}
