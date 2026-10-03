"use client";

import { useFormState, useFormStatus } from "react-dom";
import { sendLink } from "./actions";
import type { FormState } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? "Sending…" : "Email me a sign-in link"}</button>;
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useFormState<FormState, FormData>(sendLink, {});
  return (
    <form action={action}>
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <Submit />
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
      {state.ok && <p className="notice ok" role="status">{state.ok}</p>}
    </form>
  );
}
