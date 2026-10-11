"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitLead, type FormState } from "@/app/actions";
import { STATES } from "@/lib/nigeria";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? "Sending…" : label}</button>;
}

/** Hidden from people; bots fill it in. */
function Honeypot() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
      <label htmlFor="website">Website</label>
      <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
    </div>
  );
}

function Result({ state }: { state: FormState }) {
  return (
    <>
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
      {state.ok && <p className="notice ok" role="status">{state.ok}</p>}
    </>
  );
}

function StateSelect() {
  return (
    <div className="field">
      <label htmlFor="state">State</label>
      <select id="state" name="state" required defaultValue="">
        <option value="" disabled>Choose a state</option>
        {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

export function OwnerRequestForm() {
  const [state, action] = useFormState<FormState, FormData>(submitLead, {});
  if (state.ok) return <Result state={state} />;
  return (
    <form action={action} className="lead-form">
      <input type="hidden" name="kind" value="owner" />
      <Honeypot />
      <div className="field"><label htmlFor="name">Your name</label><input id="name" name="name" type="text" required maxLength={100} autoComplete="name" /></div>
      <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
      <div className="field">
        <label htmlFor="phone">Phone (optional)</label>
        <input id="phone" name="phone" type="tel" maxLength={30} autoComplete="tel" placeholder="+44 7700 900000" />
      </div>
      <StateSelect />
      <div className="field">
        <label htmlFor="area">Area or town</label>
        <input id="area" name="area" type="text" required maxLength={120} placeholder="Lekki Phase 1, or Lugbe" />
      </div>
      <div className="field">
        <label htmlFor="property_type">What is it?</label>
        <select id="property_type" name="property_type" required defaultValue="">
          <option value="" disabled>Choose one</option>
          <option value="building">A house being built</option>
          <option value="completed">A finished house</option>
          <option value="land">Land or an empty plot</option>
          <option value="rental">A property I rent out</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="frequency">How often should someone visit?</label>
        <select id="frequency" name="frequency" required defaultValue="">
          <option value="" disabled>Choose one</option>
          <option value="once">Just once</option>
          <option value="monthly">Monthly</option>
          <option value="fortnightly">Every 2 weeks</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="notes">Anything we should know? (optional)</label>
        <textarea id="notes" name="notes" maxLength={1000} placeholder="Roofing starts next month and I can't travel until Christmas." />
      </div>
      <Submit label="Find me someone" />
      <Result state={state} />
    </form>
  );
}

export function ReporterApplyForm() {
  const [state, action] = useFormState<FormState, FormData>(submitLead, {});
  if (state.ok) return <Result state={state} />;
  return (
    <form action={action} className="lead-form">
      <input type="hidden" name="kind" value="reporter" />
      <Honeypot />
      <div className="field"><label htmlFor="name">Your name</label><input id="name" name="name" type="text" required maxLength={100} autoComplete="name" /></div>
      <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
      <div className="field">
        <label htmlFor="phone">Phone number</label>
        <input id="phone" name="phone" type="tel" required maxLength={30} autoComplete="tel" placeholder="0803 000 0000" />
      </div>
      <StateSelect />
      <div className="field">
        <label htmlFor="areas">Areas you can get to easily</label>
        <input id="areas" name="areas" type="text" required maxLength={300} placeholder="Ikeja, Magodo, Ojodu" />
      </div>
      <div className="field">
        <label htmlFor="occupation">What do you do?</label>
        <select id="occupation" name="occupation" required defaultValue="">
          <option value="" disabled>Choose one</option>
          <option value="surveyor">Surveyor</option>
          <option value="agent">Estate agent</option>
          <option value="builder">Builder or site worker</option>
          <option value="corps_member">NYSC corps member</option>
          <option value="student">Student</option>
          <option value="other">Something else</option>
        </select>
      </div>
      <fieldset className="field">
        <legend>Do you have an Android phone with a working camera and GPS?</legend>
        <label className="radio"><input type="radio" name="android" value="yes" required /> Yes</label>
        <label className="radio"><input type="radio" name="android" value="no" /> No</label>
      </fieldset>
      <div className="field">
        <label htmlFor="notes">Anything else? (optional)</label>
        <textarea id="notes" name="notes" maxLength={1000} placeholder="I have a motorbike and know the Lekki axis well." />
      </div>
      <Submit label="Apply" />
      <Result state={state} />
    </form>
  );
}
