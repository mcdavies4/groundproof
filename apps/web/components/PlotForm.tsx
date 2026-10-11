"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions";
import { addPlot } from "@/app/plots/actions";
import { PlotShape } from "./PlotShape";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Save plot"}</button>;
}

export function PlotForm({ initial, accuracy }: { initial: string; accuracy: number }) {
  const [state, action] = useFormState<FormState, FormData>(addPlot, {});
  const [text, setText] = useState(initial);
  const parsed = useMemo(() => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const parts = l.split(/[,\t;]+/).map((x) => x.trim()).filter(Boolean);
    const nums = parts.filter((x) => /^-?\d+(\.\d+)?$/.test(x)).map(Number);
    return { label: parts.find((x) => !/^-?\d+(\.\d+)?$/.test(x)) ?? `Beacon ${i + 1}`, lat: nums[0], lng: nums[1] };
  }).filter((b) => b.lat >= 4 && b.lat <= 14 && b.lng >= 2.5 && b.lng <= 15), [text]);

  return (
    <form action={action} className="lead-form">
      <div className="field">
        <label htmlFor="label">Name for this plot</label>
        <input id="label" name="label" type="text" required maxLength={120} placeholder="Plot 14, Lugbe (from Mr Bello)" />
      </div>
      <div className="field">
        <label htmlFor="beacons">Beacons, in order around the plot</label>
        <textarea id="beacons" name="beacons" rows={6} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"PB 1234, 8.981234, 7.371456\nPB 1235, 8.981240, 7.371790\nPB 1236, 8.981010, 7.371795\nPB 1237, 8.981005, 7.371460"} />
        <p className="hint">One per line: beacon number, latitude, longitude (GPS coordinates). Plan only has eastings and northings? Convert them with the <a href="/tools/plot-check">plot check tool</a> first.</p>
      </div>
      <input type="hidden" name="plan_accuracy_m" value={accuracy} />
      {parsed.length >= 3 && <PlotShape plan={parsed} labels={parsed.map((b) => b.label)} />}
      <Submit />
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
    </form>
  );
}
