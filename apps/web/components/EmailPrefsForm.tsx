"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions";
import { saveEmailPrefs } from "@/app/account/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn secondary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>;
}

export function EmailPrefsForm({ tips, digest }: { tips: boolean; digest: boolean }) {
  const [state, action] = useFormState<FormState, FormData>(saveEmailPrefs, {});
  return (
    <form action={action}>
      <label className="radio"><input type="checkbox" name="digest" defaultChecked={digest} /> Monthly summary of each property</label>
      <label className="radio" style={{ marginBottom: "0.5rem" }}><input type="checkbox" name="tips" defaultChecked={tips} /> Tips when a property is waiting on a next step</label>
      <p className="hint" style={{ marginBottom: "1rem" }}>Check-in alerts and sign-in codes always come through.</p>
      <Submit />
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
      {state.ok && <p className="notice ok" role="status">{state.ok}</p>}
    </form>
  );
}
