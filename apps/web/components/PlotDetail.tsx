import type { SupabaseClient } from "@supabase/supabase-js";
import type { Property } from "@/lib/types";
import { PlotShape, type GroundPoint } from "./PlotShape";

type Visit = { id: string; created_at: string; device_time: string; verdict: string; verdict_reason: string | null; note: string | null; area_plan_m2: number | null; area_ground_m2: number | null };
type Check = { visit_id: string; beacon_index: number; found: boolean; lat: number | null; lng: number | null; accuracy_m: number | null; distance_m: number | null; status: "match" | "off" | "far" | "missing" | null; photo_path: string | null };

const TITLE: Record<string, string> = { match: "Matches the survey plan", partial: "Needs a closer look", mismatch: "Doesn't match the plan", flagged: "Flagged", pending: "Being checked" };
const CLASS: Record<string, string> = { match: "verified", partial: "review", mismatch: "flagged", flagged: "flagged", pending: "pending" };
const STATUS: Record<string, string> = { match: "where the plan says", off: "a little off", far: "far off", missing: "not found" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export async function PlotDetail({ supabase, property }: { supabase: SupabaseClient; property: Property }) {
  const beacons = property.beacons ?? [];
  const { data: visits } = await supabase.from("plot_visits").select("id, created_at, device_time, verdict, verdict_reason, note, area_plan_m2, area_ground_m2")
    .eq("property_id", property.id).order("created_at", { ascending: false }).limit(20);
  const ids = (visits ?? []).map((v) => v.id);
  const { data: checks } = ids.length
    ? await supabase.from("beacon_checks").select("visit_id, beacon_index, found, lat, lng, accuracy_m, distance_m, status, photo_path").in("visit_id", ids)
    : { data: [] as Check[] };
  const paths = ((checks ?? []) as Check[]).map((c) => c.photo_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("plot-photos").createSignedUrls(paths, 60 * 60);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const V = (visits ?? []) as Visit[];
  const C = (checks ?? []) as Check[];
  const latest = V.find((v) => v.verdict !== "pending") ?? V[0];
  const ground = (v: Visit | undefined): GroundPoint[] | undefined =>
    v ? beacons.map((_, i) => {
      const c = C.find((x) => x.visit_id === v.id && x.beacon_index === i);
      return c && c.found && c.lat !== null && c.lng !== null ? { lat: c.lat, lng: c.lng, status: c.status } : null;
    }) : undefined;

  return (
    <section aria-labelledby="plot-h">
      <h2 id="plot-h">Plan vs ground</h2>
      <PlotShape plan={beacons} labels={beacons.map((b) => b.label)} ground={ground(latest)} />
      {latest?.area_plan_m2 ? (
        <p className="small muted" style={{ marginTop: "-0.75rem" }}>
          Plan area about {Math.round(latest.area_plan_m2).toLocaleString("en-GB")} m²
          {latest.area_ground_m2 ? `; on the ground about ${Math.round(latest.area_ground_m2).toLocaleString("en-GB")} m²` : ""}.
        </p>
      ) : null}

      <h2>Visits</h2>
      {V.length === 0 ? (
        <div className="empty">
          <h3>No visit yet</h3>
          <p>Create an invite code for the person who&apos;ll walk the plot. In the Groundproof app they walk to each beacon, photograph it, and the result comes straight to you. It works with no signal.</p>
        </div>
      ) : (
        <ol className="timeline">
          {V.map((v) => (
            <li key={v.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <strong>Plot visit</strong>
                <span className={`verdict ${CLASS[v.verdict] ?? ""}`}>{TITLE[v.verdict] ?? v.verdict}</span>
              </div>
              <div className="small muted">{when(v.device_time)}. {v.verdict_reason ?? "Waiting for the result."}</div>
              {v.note && <p style={{ margin: "0.5rem 0 0" }}><span className="small muted">Note from your person: </span>{v.note}</p>}
              <table className="sides" style={{ marginTop: "0.75rem" }}>
                <thead><tr><th>Beacon</th><th>Result</th><th>From the plan</th></tr></thead>
                <tbody>
                  {beacons.map((b, i) => {
                    const c = C.find((x) => x.visit_id === v.id && x.beacon_index === i);
                    return (
                      <tr key={i}>
                        <td>{b.label}</td>
                        <td>{c ? STATUS[c.status ?? (c.found ? "match" : "missing")] ?? "-" : "-"}</td>
                        <td>{c?.distance_m !== null && c?.distance_m !== undefined ? `${Math.round(c.distance_m)} m` : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="beacon-photos">
                {beacons.map((b, i) => {
                  const c = C.find((x) => x.visit_id === v.id && x.beacon_index === i);
                  const url = c?.photo_path ? urls.get(c.photo_path) : null;
                  return url ? (
                    <figure key={i}>
                      <a href={url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Beacon ${b.label}`} />
                      </a>
                      <figcaption>{b.label}</figcaption>
                    </figure>
                  ) : null;
                })}
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="small muted" style={{ marginTop: "1.5rem" }}>
        Groundproof checks where the beacons are and the plot&apos;s shape and size. It doesn&apos;t check who owns the land: have a lawyer search the title before you pay.
      </p>
    </section>
  );
}
