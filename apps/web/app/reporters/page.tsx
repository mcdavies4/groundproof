import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STATES } from "@/lib/nigeria";
import { ReporterRecord, type ReporterStats } from "@/components/ReporterRecord";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Reporters on the ground — Groundproof",
  description: "Local people in Nigeria who visit properties for owners abroad, with a record built from verified check-ins.",
};

type Row = ReporterStats & { slug: string; display_name: string; state: string; areas: string };

export default async function Reporters({ searchParams }: { searchParams: { state?: string } }) {
  const state = STATES.includes(searchParams.state as (typeof STATES)[number]) ? searchParams.state! : null;
  const supabase = createClient();
  const { data } = await supabase.rpc("reporter_directory", { p_state: state });
  const rows = (data ?? []) as Row[];

  return (
    <main className="wrap page narrow">
      <h1>Reporters on the ground</h1>
      <p className="lede">
        Local people who visit properties for owners abroad. Each record comes from real check-ins, verified against the building&apos;s NIPOST postcode,
        GPS and photos, so nobody can pad it.
      </p>

      <form method="get" className="inline-form" style={{ margin: "1.5rem 0 2rem", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 220px" }}>
          <label htmlFor="state">State</label>
          <select id="state" name="state" defaultValue={state ?? ""}>
            <option value="">All states</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button className="btn secondary" type="submit">Show</button>
      </form>

      {rows.length === 0 ? (
        <div className="empty">
          <h2>No reporters listed {state ? `in ${state}` : ""} yet</h2>
          <p>We&apos;re building the network area by area. Tell us where your property is and we&apos;ll find someone.</p>
          <Link className="btn" href="/find-someone">Find me someone</Link>
        </div>
      ) : (
        <ul className="list reporters">
          {rows.map((r) => (
            <li key={r.slug}>
              <Link className="row-link" href={`/reporters/${r.slug}`}>
                <div style={{ flex: 1 }}>
                  <strong>{r.display_name}</strong>
                  <div className="small muted">{r.areas}, {r.state}</div>
                  <ReporterRecord r={r} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="small muted" style={{ marginTop: "2rem" }}>
        Want to be listed? <Link href="/become-a-reporter">Apply to be a reporter</Link>.
      </p>
    </main>
  );
}
