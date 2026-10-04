"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { addProperty } from "./actions";
import type { FormState } from "@/app/actions";

function Submit({ unknown }: { unknown: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? (unknown ? "Adding…" : "Checking with NIPOST…") : "Add property"}
    </button>
  );
}

export function NewPropertyForm() {
  const [state, action] = useFormState<FormState, FormData>(addProperty, {});
  const [unknown, setUnknown] = useState(false);
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="label">Name</label>
        <input id="label" name="label" type="text" required maxLength={120} placeholder="Mum's house, Enugu" />
      </div>

      <div className="field">
        <label className="check">
          <input type="checkbox" name="unknown" checked={unknown} onChange={(e) => setUnknown(e.target.checked)} />
          <span>I don&apos;t know the postcode yet</span>
        </label>
        {unknown && (
          <p className="hint">
            No problem. Your person on the ground finds it at the first visit: the app asks NIPOST which building
            they&apos;re standing at. If the building isn&apos;t registered yet, the property is anchored to its exact
            location instead.
          </p>
        )}
      </div>

      {!unknown && (
        <div className="field">
          <label htmlFor="postcode">NIPOST postcode</label>
          <input id="postcode" name="postcode" type="text" required autoCapitalize="characters" placeholder="FC-02-D43-GT-01" />
          <p className="hint">Spaces, dashes and lower case are fine. Find it at postcode.gov.ng while at the house.</p>
        </div>
      )}
      <Submit unknown={unknown} />
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
    </form>
  );
}
