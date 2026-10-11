"use client";

import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions";
import { addBuyers, addUnits, applyDeveloper, createEstate, type BuyerState } from "@/app/estates/actions";

function Submit({ label, busy = "Saving…", secondary }: { label: string; busy?: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={`btn${secondary ? " secondary" : ""}`} type="submit" disabled={pending}>{pending ? busy : label}</button>;
}
function Msg({ s }: { s: FormState }) {
  return <>{s.error && <p className="notice error" role="alert">{s.error}</p>}{s.ok && <p className="notice ok" role="status">{s.ok}</p>}</>;
}

export function DeveloperApplyForm() {
  const [s, action] = useFormState<FormState, FormData>(applyDeveloper, {});
  if (s.ok) return <Msg s={s} />;
  return (
    <form action={action} className="lead-form">
      <div className="field"><label htmlFor="company">Company name</label><input id="company" name="company" type="text" required maxLength={120} /></div>
      <div className="field"><label htmlFor="website">Website (optional)</label><input id="website" name="website" type="text" maxLength={200} placeholder="example.com" /></div>
      <div className="field"><label htmlFor="phone">Phone (optional)</label><input id="phone" name="phone" type="tel" maxLength={30} /></div>
      <Submit label="Apply for a developer account" busy="Sending…" />
      <Msg s={s} />
    </form>
  );
}

export function CreateEstateForm() {
  const [s, action] = useFormState<FormState, FormData>(createEstate, {});
  return (
    <form action={action} className="lead-form">
      <div className="field"><label htmlFor="name">Estate name</label><input id="name" name="name" type="text" required maxLength={120} placeholder="Palm Gardens Phase 2" /></div>
      <div className="field"><label htmlFor="location">Location</label><input id="location" name="location" type="text" required maxLength={200} placeholder="Lugbe, Abuja" /></div>
      <Submit label="Create estate" busy="Creating…" />
      <Msg s={s} />
    </form>
  );
}

export function AddUnitsForm({ estateId }: { estateId: string }) {
  const [s, action] = useFormState<FormState, FormData>(addUnits.bind(null, estateId), {});
  const box = useRef<HTMLTextAreaElement>(null);
  const [prefix, setPrefix] = useState("Plot");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(10);
  const fill = () => {
    if (!box.current) return;
    const n = Math.max(0, Math.min(100, to - from + 1));
    box.current.value = Array.from({ length: n }, (_, i) => `${prefix.trim()} ${from + i}`.trim()).join("\n");
  };
  return (
    <form action={action}>
      <div className="unit-gen">
        <div><label htmlFor="g-prefix">Name</label><input id="g-prefix" type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} /></div>
        <div><label htmlFor="g-from">From</label><input id="g-from" type="number" min={1} value={from} onChange={(e) => setFrom(Number(e.target.value))} /></div>
        <div><label htmlFor="g-to">To</label><input id="g-to" type="number" min={1} value={to} onChange={(e) => setTo(Number(e.target.value))} /></div>
        <button type="button" className="btn secondary" onClick={fill}>Fill list</button>
      </div>
      <div className="field">
        <label htmlFor="labels">Units, one per line</label>
        <textarea id="labels" name="labels" ref={box} rows={6} placeholder={"Block A, Unit 1\nBlock A, Unit 2"} />
        <p className="hint">Up to 100 at a time. Use the names your buyers know.</p>
      </div>
      <Submit label="Add units" busy="Adding…" />
      <Msg s={s} />
    </form>
  );
}

export function AddBuyersForm({ estateId }: { estateId: string }) {
  const [s, action] = useFormState<BuyerState, FormData>(addBuyers.bind(null, estateId), {});
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="rows">One buyer per line: unit name, email</label>
        <textarea id="rows" name="rows" rows={5} placeholder={"Plot 1, ada@example.com\nPlot 2, emeka@example.co.uk"} />
        <p className="hint">Each buyer sees only their own unit: its check-ins, photos and alerts. Up to 5 people per unit.</p>
      </div>
      <Submit label="Invite buyers" busy="Inviting…" />
      <Msg s={s} />
      {s.results && (
        <ul className="buyer-results">
          {s.results.map((r, i) => (
            <li key={i} className={r.status.startsWith("invited") || r.status.startsWith("added") ? "ok" : "bad"}>
              <strong>{r.unit || "(no unit)"}</strong>, {r.email || "(no email)"}: {r.status}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
