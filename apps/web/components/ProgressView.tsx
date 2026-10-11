"use client";

import { useState } from "react";

export interface ProgressShot {
  id: string;
  url: string;
  date: string;      // ISO
  label: string;     // "Anchor visit", stage name or "Routine check-in"
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const month = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

/**
 * Before/after: the anchor's front photo against a later verified check-in, taken from the
 * same spot. Below it, one photo per month so the owner can watch the building rise.
 */
export function ProgressView({ anchor, later, timeline }: { anchor: ProgressShot; later: ProgressShot[]; timeline: ProgressShot[] }) {
  const [pick, setPick] = useState(later[0]?.id ?? "");
  const [pos, setPos] = useState(50);
  const after = later.find((x) => x.id === pick) ?? later[0];

  return (
    <section className="progress" aria-labelledby="progress-h">
      <h2 id="progress-h">Progress</h2>

      {after ? (
        <>
          <div className="compare" style={{ ["--pos" as string]: `${pos}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={after.url} alt={`${after.label}, ${day(after.date)}`} />
            <div className="compare-before" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={anchor.url} alt="" />
            </div>
            <div className="compare-line" aria-hidden="true" />
            <span className="compare-tag left">Anchor · {day(anchor.date)}</span>
            <span className="compare-tag right">{day(after.date)}</span>
            <input
              type="range" min={0} max={100} value={pos}
              onChange={(e) => setPos(Number(e.target.value))}
              aria-label="Slide to compare the anchor photo with the later photo"
            />
          </div>
          {later.length > 1 && (
            <div className="field" style={{ marginTop: "0.75rem" }}>
              <label htmlFor="compare-pick">Compare the anchor with</label>
              <select id="compare-pick" value={after.id} onChange={(e) => setPick(e.target.value)}>
                {later.map((x) => (
                  <option key={x.id} value={x.id}>{day(x.date)}: {x.label}</option>
                ))}
              </select>
            </div>
          )}
          <p className="small muted">Drag the slider. Left is the anchor visit, right is the later check-in, both taken from the same spot.</p>
        </>
      ) : (
        <p className="muted">The before/after view appears after the first verified check-in following the anchor visit.</p>
      )}

      {timeline.length > 1 && (
        <>
          <h3 style={{ marginTop: "1.5rem" }}>Month by month</h3>
          <ol className="strip">
            {timeline.map((x) => (
              <li key={x.id}>
                <a href={x.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={x.url} alt={`${x.label}, ${day(x.date)}`} loading="lazy" />
                </a>
                <strong>{month(x.date)}</strong>
                <span className="small muted">{x.label}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
