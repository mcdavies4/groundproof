"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { CONDITIONS, COVERED_STATES, HOME_TYPES, LAND_USES, TITLE_TYPES, UTILITIES } from "@/lib/valuecheck/coverage";
import { runValueCheck, type ValueCheckState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? "Checking the evidence…" : "Run ValueCheck"}</button>;
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="hint" style={{ color: "var(--flagged)", fontWeight: 600 }} id={`${id}-err`}>{error}</p>}
    </div>
  );
}

const describe = (id: string, hint?: string, error?: string) => ({ "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-err` : hint ? `${id}-hint` : undefined });

export function ValueCheckForm({ fromPlot, initialCategory }: { fromPlot: { area: number; lat: string; lng: string } | null; initialCategory: "land" | "residential" }) {
  const [state, action] = useFormState<ValueCheckState, FormData>(runValueCheck, {});
  const [category, setCategory] = useState<"land" | "residential">(fromPlot ? "land" : initialCategory);
  const [propertyType, setPropertyType] = useState("");
  const [landArea, setLandArea] = useState(fromPlot ? String(fromPlot.area) : "");
  const e = state.fieldErrors ?? {};
  const states = Object.keys(COVERED_STATES);
  const [stateName, setStateName] = useState(states[0]);
  const lgas = COVERED_STATES[stateName]?.lgas ?? [];
  const usingPlotArea = !!fromPlot && category === "land" && landArea === String(fromPlot.area);

  return (
    <form action={action} className="lead-form" noValidate>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 1.1rem" }}>
        <legend style={{ fontWeight: 600, marginBottom: "0.35rem" }}>What are you valuing?</legend>
        <div className="mode-toggle" role="radiogroup">
          <label className={category === "land" ? "on" : ""}>
            <input type="radio" name="category" value="land" checked={category === "land"} onChange={() => { setCategory("land"); setPropertyType(""); }} />
            Land (empty plot)
          </label>
          <label className={category === "residential" ? "on" : ""}>
            <input type="radio" name="category" value="residential" checked={category === "residential"} onChange={() => { setCategory("residential"); setPropertyType(""); }} />
            A house or flat
          </label>
        </div>
        {e.category && <p className="hint" style={{ color: "var(--flagged)" }}>{e.category}</p>}
      </fieldset>

      <h2>Where is it?</h2>
      <Field id="state" label="State" error={e.state}>
        <select id="state" name="state" value={stateName} onChange={(ev) => setStateName(ev.target.value)} {...describe("state", undefined, e.state)}>
          {states.map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <Field id="lga" label="Local government area" error={e.lga}>
        <select id="lga" name="lga" required defaultValue="" {...describe("lga", undefined, e.lga)}>
          <option value="" disabled>Choose…</option>
          {lgas.map((l) => <option key={l}>{l}</option>)}
        </select>
      </Field>
      <Field id="neighbourhood" label="Neighbourhood or estate" hint="For example Lekki Phase 1, Ajah, Magodo Phase 2." error={e.neighbourhood}>
        <input id="neighbourhood" name="neighbourhood" type="text" required maxLength={80} {...describe("neighbourhood", "x", e.neighbourhood)} />
      </Field>
      <Field id="addressNote" label="Street or other location detail (optional)" hint="Kept with your report. Not used in the calculation yet.">
        <input id="addressNote" name="addressNote" type="text" maxLength={200} />
      </Field>

      <h2>About the {category === "land" ? "land" : "property"}</h2>
      <Field id="propertyType" label={category === "land" ? "What is the land used or zoned for?" : "Type of home"} error={e.propertyType}>
        <select id="propertyType" name="propertyType" required value={propertyType} onChange={(ev) => setPropertyType(ev.target.value)} {...describe("propertyType", undefined, e.propertyType)}>
          <option value="" disabled>Choose…</option>
          {Object.entries(category === "land" ? LAND_USES : HOME_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>

      {fromPlot && category === "land" && (
        <div className="notice ok">
          Plot size filled in from Plot Check: <strong>{fromPlot.area.toLocaleString("en-GB")} m²</strong>, worked out from the survey-plan coordinates you entered.
          {" "}It shows the shape on paper. It doesn&apos;t prove who owns the land or where its boundaries are on the ground.
          {usingPlotArea ? " We'll label it that way in your report." : " You've changed it, so we'll treat the size as your own figure."}
        </div>
      )}
      {usingPlotArea && (<>
        <input type="hidden" name="areaSource" value="plot_check" />
        <input type="hidden" name="lat" value={fromPlot!.lat} />
        <input type="hidden" name="lng" value={fromPlot!.lng} />
      </>)}

      {(category === "land" || propertyType !== "flat") && (
        <Field id="landAreaSqm" label={category === "land" ? "Plot size (m²)" : "Plot size under the house (m²), if you know it"}
          hint="A standard Lagos plot is often 450 to 650 m². Your survey plan states the area." error={e.landAreaSqm}>
          <input id="landAreaSqm" name="landAreaSqm" type="text" inputMode="decimal" required={category === "land"} value={landArea} onChange={(ev) => setLandArea(ev.target.value)} {...describe("landAreaSqm", "x", e.landAreaSqm)} />
        </Field>
      )}

      {category === "residential" && (<>
        <Field id="buildingAreaSqm" label="Floor area of the building (m²)" hint="Best result: enter this. If you don't know it, give the bedrooms below." error={e.buildingAreaSqm}>
          <input id="buildingAreaSqm" name="buildingAreaSqm" type="text" inputMode="decimal" {...describe("buildingAreaSqm", "x", e.buildingAreaSqm)} />
        </Field>
        <div className="inline-form">
          <Field id="bedrooms" label="Bedrooms" error={e.bedrooms}><input id="bedrooms" name="bedrooms" type="text" inputMode="numeric" {...describe("bedrooms", undefined, e.bedrooms)} /></Field>
          <Field id="bathrooms" label="Bathrooms" error={e.bathrooms}><input id="bathrooms" name="bathrooms" type="text" inputMode="numeric" {...describe("bathrooms", undefined, e.bathrooms)} /></Field>
          <Field id="ageYears" label="Age (years)" error={e.ageYears}><input id="ageYears" name="ageYears" type="text" inputMode="numeric" {...describe("ageYears", undefined, e.ageYears)} /></Field>
        </div>
        <Field id="condition" label="Condition" hint="Used to give comparables more or less weight. We don't add or subtract naira for it." error={e.condition}>
          <select id="condition" name="condition" defaultValue="" {...describe("condition", "x", e.condition)}>
            <option value="">Not sure</option>
            {Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </>)}

      <h2>Title and surroundings (optional)</h2>
      <Field id="titleType" label="Title document" hint="Noted in your report. We don't check it, and we don't value it separately." error={e.titleType}>
        <select id="titleType" name="titleType" defaultValue="" {...describe("titleType", "x", e.titleType)}>
          <option value="">Not stated</option>
          {Object.entries(TITLE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field id="roadAccess" label="Road access" error={e.roadAccess}>
        <select id="roadAccess" name="roadAccess" defaultValue="" {...describe("roadAccess", undefined, e.roadAccess)}>
          <option value="">Not stated</option>
          <option value="tarred">Tarred road</option>
          <option value="untarred">Untarred road</option>
          <option value="none">No road access yet</option>
        </select>
      </Field>
      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: "0.35rem" }}>On site</legend>
        {Object.entries(UTILITIES).map(([k, v]) => (
          <label key={k} style={{ fontWeight: 400, display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input type="checkbox" name="utilities" value={k} /> {v}
          </label>
        ))}
        <label style={{ fontWeight: 400, display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input type="checkbox" name="inEstate" /> In a gated or managed estate
        </label>
      </fieldset>

      <Submit />
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
    </form>
  );
}
