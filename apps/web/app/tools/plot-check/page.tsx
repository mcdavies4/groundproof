import type { Metadata } from "next";
import { PlotCheck } from "./PlotCheck";

export const metadata: Metadata = {
  title: "Plot check: convert survey plan coordinates — Groundproof",
  description:
    "Paste the beacon coordinates from a Nigerian survey plan and see where the plot really is, its area and its sides. Minna datum, Nigeria belts and UTM.",
};

export default function PlotCheckPage() {
  return (
    <main className="wrap page">
      <h1>Plot check</h1>
      <p className="lede" style={{ maxWidth: "62ch" }}>
        Before you pay for land, check the plot is where the survey plan says. Copy the beacon coordinates from the plan
        below and we&apos;ll show you where they are on a map, the plot&apos;s area and the length of each side.
      </p>
      <PlotCheck />
    </main>
  );
}
