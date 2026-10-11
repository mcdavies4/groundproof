"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions";
import { saveReporterProfile } from "@/app/account/actions";
import { STATES } from "@/lib/nigeria";

type Profile = { slug: string; display_name: string; state: string; areas: string; bio: string | null; is_public: boolean } | null;

function Submit({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : isNew ? "Create my profile" : "Save"}</button>;
}

export function ReporterProfileForm({ profile }: { profile: Profile }) {
  const [state, action] = useFormState<FormState, FormData>(saveReporterProfile, {});
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="display_name">Name owners will see</label>
        <input id="display_name" name="display_name" type="text" required maxLength={60} defaultValue={profile?.display_name ?? ""} placeholder="Tunde A." />
        <p className="hint">First name and initial is fine. Your email and phone number are never shown.</p>
      </div>
      <div className="field">
        <label htmlFor="rp-state">State</label>
        <select id="rp-state" name="state" required defaultValue={profile?.state ?? ""}>
          <option value="" disabled>Choose a state</option>
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="areas">Areas you cover</label>
        <input id="areas" name="areas" type="text" required maxLength={200} defaultValue={profile?.areas ?? ""} placeholder="Lekki, Ajah, Sangotedo" />
      </div>
      <div className="field">
        <label htmlFor="bio">About you (optional)</label>
        <textarea id="bio" name="bio" maxLength={400} defaultValue={profile?.bio ?? ""} placeholder="Registered surveyor, 8 years in Lekki. I can visit on weekdays and Saturdays." />
      </div>
      <label className="radio" style={{ marginBottom: "1rem" }}>
        <input type="checkbox" name="is_public" defaultChecked={profile?.is_public ?? true} /> Show my profile in the public list of reporters
      </label>
      <Submit isNew={!profile} />
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
      {state.ok && <p className="notice ok" role="status">{state.ok}</p>}
    </form>
  );
}
