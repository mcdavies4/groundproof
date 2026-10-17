import { ImageResponse } from "next/og";
import { loadSharedReport, reportSummary } from "@/lib/sharedReport";

export const runtime = "nodejs";
export const alt = "Groundproof property report";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Preview card shown when the link is pasted into WhatsApp, X, iMessage and so on.
// Shows only the owner's property label and counts: no address, postcode or photos.
export default async function Image({ params }: { params: { token: string } }) {
  const data = await loadSharedReport(params.token);
  const s = data ? reportSummary(data) : null;
  const title = data ? data.property.label.slice(0, 60) : "Property report";
  const line = s && s.total > 0
    ? `${s.verified} verified check-in${s.verified === 1 ? "" : "s"}${s.flagged ? ` · ${s.flagged} flagged` : ""}${s.last ? ` · last ${s.last}` : ""}`
    : "Check-ins verified against the NIPOST postcode";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#10251f", color: "#f3f5f2", padding: 72 }}>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: 6, color: "#f4c531" }}>GROUNDPROOF · PROPERTY REPORT</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 88, fontWeight: 800, lineHeight: 1.08 }}>{title}</div>
          <div style={{ display: "flex", fontSize: 40, marginTop: 28, color: "#c9cec6" }}>{line}</div>
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#c9cec6" }}>Photos taken live in the app and checked against where they were taken · groundproof.site</div>
      </div>
    ),
    size,
  );
}
