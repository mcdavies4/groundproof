"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addProperty } from "./actions";
import type { FormState } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? "Checking with NIPOST…" : "Add property"}</button>;
}

export function NewPropertyForm() {
  const [state, action] = useFormState<FormState, FormData>(addProperty, {});
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="label">Name</label>
        <input id="label" name="label" type="text" required maxLength={120} placeholder="Mum's house, Enugu" />
      </div>
      <div className="field">
        <label htmlFor="postcode">NIPOST postcode</label>
        <input id="postcode" name="postcode" type="text" required autoCapitalize="characters" placeholder="EN-05-V19-CD-22" />
        <p className="hint">Spaces, dashes and lower case are fine. Testing? Try LA-11-W06-TC-10.</p>
      </div>
      <Submit />
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
    </form>
  );
}
