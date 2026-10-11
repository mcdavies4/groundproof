import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { createClient } from "@/lib/supabase/server";
import { REPORTER_RULES, VISIT_ORDER, VISIT_TYPES, matchedVisitsFree, naira, type VisitType } from "@/lib/rates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Visit prices — Groundproof",
  description: "What a Groundproof reporter visit costs in each state. One price per visit, no extras.",
};

type Band = { state: string; visit_type: VisitType; min_ngn: number; max_ngn: number };

export default async function Rates() {
  const supabase = createClient();
  const { data } = await supabase.from("rate_bands").select("state, visit_type, min_ngn, max_ngn").order("state");
  const bands = (data ?? []) as Band[];
  const free = await matchedVisitsFree(supabase);
  const states = [...new Set(bands.map((b) => b.state))];

  return (
    <main className="wrap page narrow">
      <h1>What a visit costs</h1>
      <p className="lede">
        When we find a reporter for you, you pay one price per visit, agreed before the first one. Groundproof sets the range for each state,
        so nobody is overcharged for living abroad.
      </p>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>One price. No extras.</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>The agreed price is the full price: no transport, data or &ldquo;logistics&rdquo; added on later.</li>
          {free
            ? <li>During the pilot, Groundproof&apos;s checks on these visits are free. You pay the reporter only, never twice.</li>
            : <li>The reporter&apos;s price pays for the visit. Your Groundproof plan or check-ins pay for the checks that prove it happened.</li>}
          <li>Sending your own relative or builder instead? Then you only pay Groundproof, as normal.</li>
        </ul>
      </div>

      <h2>Price ranges by state</h2>
      {states.length === 0 ? (
        <p className="muted">We&apos;re setting the first ranges with our reporters now. <Link href="/find-someone">Tell us where your property is</Link> and we&apos;ll quote you before you agree to anything.</p>
      ) : (
        <div className="scroll-x">
          <table className="sides">
            <thead><tr><th>State</th>{VISIT_ORDER.map((t) => <th key={t}>{VISIT_TYPES[t].name}</th>)}</tr></thead>
            <tbody>
              {states.map((s) => (
                <tr key={s}>
                  <td><strong>{s}</strong></td>
                  {VISIT_ORDER.map((t) => {
                    const b = bands.find((x) => x.state === s && x.visit_type === t);
                    return <td key={t}>{b ? `${naira(b.min_ngn)} to ${naira(b.max_ngn)}` : <span className="muted">Ask us</span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <dl className="facts" style={{ marginTop: "1.25rem" }}>
        {VISIT_ORDER.map((t) => (
          <Fragment key={t}><dt>{VISIT_TYPES[t].name}</dt><dd>{VISIT_TYPES[t].hint}</dd></Fragment>
        ))}
      </dl>

      <h2>The rules every reporter agrees to</h2>
      <ol>{REPORTER_RULES.map((r) => <li key={r}>{r}</li>)}</ol>
      <p>If a reporter asks you for more than you agreed, tell us and we&apos;ll deal with it.</p>

      <p style={{ marginTop: "2rem" }}><Link className="btn" href="/find-someone">Find me someone</Link></p>
    </main>
  );
}
