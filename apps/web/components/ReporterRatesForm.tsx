"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions";
import { agreeReporterRules, saveReporterRates } from "@/app/account/actions";
import { REPORTER_RULES, VISIT_ORDER, VISIT_TYPES, naira, type VisitType } from "@/lib/rates";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn secondary" type="submit" disabled={pending}>{pending ? "Saving…" : label}</button>;
}
function Msg({ s }: { s: FormState }) {
  return <>{s.error && <p className="notice error" role="alert">{s.error}</p>}{s.ok && <p className="notice ok" role="status">{s.ok}</p>}</>;
}

export function ReporterRulesForm() {
  const [s, action] = useFormState<FormState, FormData>(agreeReporterRules, {});
  return (
    <form action={action}>
      <ol className="small" style={{ paddingLeft: "1.2rem" }}>{REPORTER_RULES.map((r) => <li key={r} style={{ marginBottom: "0.4rem" }}>{r}</li>)}</ol>
      <label className="radio"><input type="checkbox" name="agree" required /> I agree to these rules</label>
      <div style={{ marginTop: "0.75rem" }}><Submit label="Agree" /></div>
      <Msg s={s} />
    </form>
  );
}

type Band = { visit_type: VisitType; min_ngn: number; max_ngn: number };

export function ReporterRatesForm({ state, bands, rates }: { state: string; bands: Band[]; rates: Partial<Record<VisitType, number>> }) {
  const [s, action] = useFormState<FormState, FormData>(saveReporterRates, {});
  if (!bands.length) {
    return <p className="small muted">Prices for {state} aren&apos;t set yet. We&apos;ll email you when they are, and then you can set yours.</p>;
  }
  return (
    <form action={action}>
      {VISIT_ORDER.map((t) => {
        const b = bands.find((x) => x.visit_type === t);
        return (
          <div className="field" key={t}>
            <label htmlFor={`rate-${t}`}>{VISIT_TYPES[t].name} (₦)</label>
            <input id={`rate-${t}`} name={t} type="number" inputMode="numeric" min={b?.min_ngn} max={b?.max_ngn} step={500}
              defaultValue={rates[t] ?? ""} disabled={!b} placeholder={b ? `${b.min_ngn}` : "Not set yet"} />
            <p className="hint">{b ? `${state}: ${naira(b.min_ngn)} to ${naira(b.max_ngn)}. ` : ""}{VISIT_TYPES[t].hint}</p>
          </div>
        );
      })}
      <Submit label="Save prices" />
      <Msg s={s} />
    </form>
  );
}
