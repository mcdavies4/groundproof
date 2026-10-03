"use client";

import { useFormState, useFormStatus } from "react-dom";
import { joinWaitlist, type FormState } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? "Joining…" : "Join the pilot list"}
    </button>
  );
}

export function WaitlistForm({ plan }: { plan?: "watch" | "build" }) {
  const [state, action] = useFormState<FormState, FormData>(joinWaitlist, {});
  return (
    <form action={action}>
      <label htmlFor={`email-${plan ?? "hero"}`}>Email</label>
      <div className="inline-form">
        <input id={`email-${plan ?? "hero"}`} type="email" name="email" required autoComplete="email" placeholder="you@example.com" />
        {plan && <input type="hidden" name="plan" value={plan} />}
        <Submit />
      </div>
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
      {state.ok && <p className="notice ok" role="status">{state.ok}</p>}
    </form>
  );
}
