/**
 * Satellite change check. Compares free Sentinel-2 images (10 m per pixel) of the same spot, about a year apart,
 * and reports whether the vegetation around the property changed a lot. It shows land being cleared or built on,
 * not a roof or a room, and Nigerian cloud cover often hides the ground. Advisory only: it never changes a verdict.
 * Imagery: Element 84 "Earth Search" STAC catalogue of the public Sentinel-2 L2A archive on AWS (no key needed).
 */

const STAC = "https://earth-search.aws.element84.com/v1/search";
const MAX_CLOUD = 20;                 // % cloud cover for the whole scene
const HALF_WINDOW_M = 150;            // look at a 300 m square around the property

// ---------- maths (pure, tested) ----------

/** WGS84 lat/lng to UTM metres, northern hemisphere (all of Nigeria). */
export function toUtm(lat: number, lng: number, zone: number) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const phi = lat * Math.PI / 180, lam = lng * Math.PI / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lam - lon0);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
  const e = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  const n = k0 * (M + N * Math.tan(phi) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
  return { e, n };
}

export interface Stats { ndvi: number; bare: number; pixels: number }

/** Mean NDVI and the share of bare-looking pixels (NDVI < 0.25) from reflectance arrays. Skips no-data. */
export function stats(red: ArrayLike<number>, nir: ArrayLike<number>): Stats | null {
  let sum = 0, bare = 0, n = 0;
  for (let i = 0; i < red.length; i++) {
    const r = red[i], q = nir[i];
    if (!(r > 0) || !(q > 0) || r + q <= 0) continue;     // no-data or nonsense
    const v = (q - r) / (q + r);
    sum += v; if (v < 0.25) bare++; n++;
  }
  return n >= 20 ? { ndvi: sum / n, bare: bare / n, pixels: n } : null;
}

export type Change = "cleared" | "greener" | "no_clear_change";
export function compare(before: Stats, after: Stats): { change: Change; dNdvi: number; dBare: number } {
  const dNdvi = after.ndvi - before.ndvi, dBare = after.bare - before.bare;
  const change: Change = dNdvi <= -0.15 && dBare >= 0.2 ? "cleared" : dNdvi >= 0.15 && dBare <= -0.2 ? "greener" : "no_clear_change";
  return { change, dNdvi: Math.round(dNdvi * 100) / 100, dBare: Math.round(dBare * 100) / 100 };
}

/** Digital number to reflectance. Scenes from processing baseline 04.00 (Jan 2022) carry a -0.1 offset. */
export function reflectance(dn: number, band: { scale?: number; offset?: number } | undefined, datetime: string): number {
  if (dn === 0) return 0;
  const scale = band?.scale ?? 0.0001;
  const offset = band?.offset ?? (datetime >= "2022-01-25" ? -0.1 : 0);
  return dn * scale + offset;
}

// ---------- imagery ----------

interface Scene {
  datetime: string; cloud: number; epsg: number;
  red: { href: string; band?: { scale?: number; offset?: number } };
  nir: { href: string; band?: { scale?: number; offset?: number } };
}

export function parseScenes(json: unknown): Scene[] {
  const feats = ((json as { features?: unknown[] })?.features ?? []) as Record<string, any>[];
  const out: Scene[] = [];
  for (const f of feats) {
    const p = f.properties ?? {};
    const code = p["proj:epsg"] ?? (typeof p["proj:code"] === "string" ? Number(String(p["proj:code"]).replace("EPSG:", "")) : null);
    const red = f.assets?.red, nir = f.assets?.nir;
    if (!red?.href || !nir?.href || typeof p.datetime !== "string" || !(code >= 32601 && code <= 32660)) continue;
    out.push({
      datetime: p.datetime, cloud: Number(p["eo:cloud_cover"] ?? 100), epsg: code,
      red: { href: red.href, band: red["raster:bands"]?.[0] },
      nir: { href: nir.href, band: nir["raster:bands"]?.[0] },
    });
  }
  return out;
}

async function findScenes(lat: number, lng: number, from: Date, to: Date): Promise<Scene[]> {
  const res = await fetch(STAC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      collections: ["sentinel-2-l2a"],
      intersects: { type: "Point", coordinates: [lng, lat] },
      datetime: `${from.toISOString()}/${to.toISOString()}`,
      query: { "eo:cloud_cover": { lt: MAX_CLOUD } },
      sortby: [{ field: "properties.datetime", direction: "desc" }],
      limit: 30,
    }),
  });
  if (!res.ok) throw new Error(`The imagery catalogue answered ${res.status}.`);
  return parseScenes(await res.json());
}

/** Reads a square window of one band around a UTM point. `tiff` is a geotiff object (a URL in production, memory in tests). */
// deno-lint-ignore no-explicit-any
export async function readWindow(tiff: any, e: number, n: number, halfM: number): Promise<Float32Array | Uint16Array | number[]> {
  const image = await tiff.getImage();
  const [ox, oy] = image.getOrigin();
  const [rx, ry] = image.getResolution();
  const half = Math.ceil(halfM / Math.abs(rx));
  const px = Math.floor((e - ox) / rx), py = Math.floor((n - oy) / ry);
  const x0 = Math.max(0, px - half), y0 = Math.max(0, py - half);
  const x1 = Math.min(image.getWidth(), px + half), y1 = Math.min(image.getHeight(), py + half);
  if (x1 - x0 < 5 || y1 - y0 < 5) throw new Error("The property is outside this image tile.");
  const rasters = await image.readRasters({ window: [x0, y0, x1, y1], samples: [0] });
  return rasters[0];
}

async function sceneStats(s: Scene, lat: number, lng: number): Promise<Stats | null> {
  const { fromUrl } = await import("npm:geotiff@2.1.3");
  const { e, n } = toUtm(lat, lng, s.epsg - 32600);
  const [redDn, nirDn] = await Promise.all([
    fromUrl(s.red.href).then((t) => readWindow(t, e, n, HALF_WINDOW_M)),
    fromUrl(s.nir.href).then((t) => readWindow(t, e, n, HALF_WINDOW_M)),
  ]);
  const red = Array.from(redDn as ArrayLike<number>, (v) => reflectance(v, s.red.band, s.datetime));
  const nir = Array.from(nirDn as ArrayLike<number>, (v) => reflectance(v, s.nir.band, s.datetime));
  return stats(red, nir);
}

export interface SatelliteResult {
  ok: boolean;
  change?: Change; dNdvi?: number; dBare?: number;
  beforeDate?: string; afterDate?: string;
  message: string;
}

const day = (iso: string) => iso.slice(0, 10);
const closest = (list: Scene[], target: number) => [...list].sort((a, b) => Math.abs(Date.parse(a.datetime) - target) - Math.abs(Date.parse(b.datetime) - target))[0];

/** `daysBack` is how far back the earlier image should be. About a year is best: it compares the same season. */
export async function satelliteChange(lat: number, lng: number, daysBack = 365, now = new Date()): Promise<SatelliteResult> {
  const D = 86_400_000;
  try {
    const recent = await findScenes(lat, lng, new Date(now.getTime() - 75 * D), now);
    if (!recent.length) return { ok: false, message: `No clear (under ${MAX_CLOUD}% cloud) satellite image of this spot in the last 75 days. It's common in the rainy season. Try again in a few weeks.` };
    const target = now.getTime() - daysBack * D;
    const older = await findScenes(lat, lng, new Date(target - 45 * D), new Date(target + 45 * D));
    if (!older.length) return { ok: false, message: `No clear satellite image of this spot from about ${Math.round(daysBack / 30)} months ago. Try a different comparison period.` };

    const after = recent[0], before = closest(older, target);
    const gapDays = (Date.parse(after.datetime) - Date.parse(before.datetime)) / D;
    if (gapDays < 60) return { ok: false, message: "The two clear images are too close together in time to show a difference." };

    const [sb, sa] = await Promise.all([sceneStats(before, lat, lng), sceneStats(after, lat, lng)]);
    if (!sb || !sa) return { ok: false, message: "The images didn't have enough usable ground pixels at this spot (cloud shadow, water or no data)." };

    const c = compare(sb, sa);
    const when = `${day(before.datetime)} and ${day(after.datetime)}`;
    const message =
      c.change === "cleared" ? `Between ${when}, vegetation around the property dropped sharply (NDVI ${c.dNdvi}). The land may have been cleared or built on.`
      : c.change === "greener" ? `Between ${when}, the area got greener (NDVI +${c.dNdvi}). The site may be overgrown, or the seasons differ.`
      : `Between ${when}, satellite images show no large change in vegetation around the property.`;
    return { ok: true, change: c.change, dNdvi: c.dNdvi, dBare: c.dBare, beforeDate: day(before.datetime), afterDate: day(after.datetime), message };
  } catch (e) {
    console.error("satellite check failed", e);
    return { ok: false, message: e instanceof Error && e.message ? `Couldn't get the images: ${e.message}` : "Couldn't get the images. Try again later." };
  }
}
