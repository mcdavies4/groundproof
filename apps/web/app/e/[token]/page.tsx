import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Unit = { label: string; anchored: boolean; postcode: string | null; visits: number; verified: number; flagged: number; lastVerified: string | null; stagesDone: string[]; photo: string | null };
type Data = { estate: { name: string; location: string; developer: string | null }; units: Unit[]; generatedAt: string };

async function load(token: string): Promise<Data | null> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("shared-estate", { body: { token } });
  return error || !data?.estate ? null : (data as Data);
}

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const d = await load(params.token);
  return {
    title: d ? `${d.estate.name}: verified by Groundproof` : "Estate — Groundproof",
    robots: { index: false, follow: false },
  };
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function SharedEstate({ params }: { params: { token: string } }) {
  const d = await load(params.token);
  if (!d) notFound();
  const verifiedVisits = d.units.reduce((t, u) => t + u.verified, 0);

  return (
    <main className="wrap page">
      <p className="small muted" style={{ marginBottom: "0.3rem" }}>Verified by Groundproof</p>
      <h1 style={{ marginBottom: "0.3rem" }}>{d.estate.name}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{d.estate.location}{d.estate.developer && <> · by {d.estate.developer}</>}</p>

      <p className="lede" style={{ maxWidth: "var(--measure)" }}>
        {d.units.length} units, {d.units.filter((u) => u.anchored).length} anchored, {verifiedVisits} verified site visits. Each visit is checked
        independently against the building&apos;s NIPOST postcode (or its anchored spot), the phone&apos;s GPS and compass, and photos from the first visit.
      </p>

      <ul className="estate-grid">
        {d.units.map((u) => (
          <li key={u.label}>
            {u.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.photo} alt={`Latest verified photo of ${u.label}`} loading="lazy" />
            ) : (
              <div className="estate-noimg">{u.anchored ? "No verified photo yet" : "Waiting for first visit"}</div>
            )}
            <strong>{u.label}</strong>
            <span className="small muted">
              {u.lastVerified ? `Last verified ${day(u.lastVerified)}` : "Not verified yet"}
              {u.stagesDone.length > 0 && <><br />Done: {u.stagesDone.join(", ")}</>}
            </span>
          </li>
        ))}
      </ul>

      <p className="small muted" style={{ marginTop: "2rem" }}>
        Updated {day(d.generatedAt)}. <Link href="/">What is Groundproof?</Link>
      </p>
    </main>
  );
}
