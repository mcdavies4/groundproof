"use client";

import { useFormState, useFormStatus } from "react-dom";
import { deleteAccount } from "./actions";
import type { FormState } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending} style={{ background: "var(--flagged)", borderColor: "var(--flagged)" }}>
      {pending ? "Deleting…" : "Delete my account"}
    </button>
  );
}

export function DeleteForm() {
  const [state, action] = useFormState<FormState, FormData>(deleteAccount, {});
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="confirm">Type DELETE to confirm</label>
        <input id="confirm" name="confirm" type="text" autoComplete="off" required />
      </div>
      <Submit />
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
    </form>
  );
}
