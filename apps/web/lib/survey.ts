/**
 * Survey-plan coordinate conversion for Nigeria.
 * Nigerian survey plans give beacon coordinates on the Minna datum (Clarke 1880 RGS ellipsoid),
 * usually in a Nigeria Transverse Mercator belt or in UTM. Phones use WGS84 latitude/longitude.
 * Definitions and datum shifts follow the EPSG registry.
 */
import proj4 from "proj4";

const MINNA_ELLPS = "+a=6378249.145 +rf=293.465";
// EPSG "Minna to WGS 84 (2)": all Nigeria, ~15 m.  EPSG "Minna to WGS 84 (3)": onshore south-central, ~5 m.
const SHIFT_NATIONAL = { towgs84: "-92,-93,122,0,0,0,0", accuracyM: 15, name: "Minna to WGS 84 (2), all Nigeria" };
const SHIFT_SOUTH = { towgs84: "-111.92,-87.85,114.5,1.875,0.202,0.219,0.032", accuracyM: 5, name: "Minna to WGS 84 (3), south-central Nigeria" };
const SOUTH_BBOX = { west: 4.35, south: 4.22, east: 9.45, north: 6.95 };

export type SystemId =
  | "minna_west_belt" | "minna_mid_belt" | "minna_east_belt"
  | "minna_utm31" | "minna_utm32" | "minna_utm33"
  | "wgs84_utm31" | "wgs84_utm32" | "wgs84_utm33";

interface SystemDef { id: SystemId; name: string; hint: string; proj: string; minna: boolean; lngRange: [number, number] }

export const SYSTEMS: SystemDef[] = [
  { id: "minna_west_belt", lngRange: [2.5, 6.5], name: "Minna / Nigeria West Belt", hint: "South-west: Lagos, Ogun, Oyo, Osun, Ondo, Ekiti, Kwara, Kebbi, Sokoto…",
    proj: `+proj=tmerc +lat_0=4 +lon_0=4.5 +k=0.99975 +x_0=230738.26 +y_0=0 ${MINNA_ELLPS} +units=m`, minna: true },
  { id: "minna_mid_belt", lngRange: [6.5, 10.5], name: "Minna / Nigeria Mid Belt", hint: "Centre and south: FCT, Edo, Delta, Rivers, Imo, Anambra, Enugu, Abia, Kogi, Niger…",
    proj: `+proj=tmerc +lat_0=4 +lon_0=8.5 +k=0.99975 +x_0=670553.98 +y_0=0 ${MINNA_ELLPS} +units=m`, minna: true },
  { id: "minna_east_belt", lngRange: [10.5, 14.7], name: "Minna / Nigeria East Belt", hint: "East: Cross River, Taraba, Adamawa, Borno, Yobe, Gombe…",
    proj: `+proj=tmerc +lat_0=4 +lon_0=12.5 +k=0.99975 +x_0=1110369.7 +y_0=0 ${MINNA_ELLPS} +units=m`, minna: true },
  { id: "minna_utm31", lngRange: [0, 6], name: "Minna / UTM zone 31N", hint: "West of 6°E (Lagos, south-west)", proj: `+proj=utm +zone=31 ${MINNA_ELLPS} +units=m`, minna: true },
  { id: "minna_utm32", lngRange: [6, 12], name: "Minna / UTM zone 32N", hint: "6°E to 12°E (most of the south-east, centre)", proj: `+proj=utm +zone=32 ${MINNA_ELLPS} +units=m`, minna: true },
  { id: "minna_utm33", lngRange: [12, 18], name: "Minna / UTM zone 33N", hint: "East of 12°E", proj: `+proj=utm +zone=33 ${MINNA_ELLPS} +units=m`, minna: true },
  { id: "wgs84_utm31", lngRange: [0, 6], name: "WGS 84 / UTM zone 31N", hint: "GPS-based plans, west of 6°E", proj: "+proj=utm +zone=31 +datum=WGS84 +units=m", minna: false },
  { id: "wgs84_utm32", lngRange: [6, 12], name: "WGS 84 / UTM zone 32N", hint: "GPS-based plans, 6°E to 12°E", proj: "+proj=utm +zone=32 +datum=WGS84 +units=m", minna: false },
  { id: "wgs84_utm33", lngRange: [12, 18], name: "WGS 84 / UTM zone 33N", hint: "GPS-based plans, east of 12°E", proj: "+proj=utm +zone=33 +datum=WGS84 +units=m", minna: false },
];

const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

export interface LatLng { lat: number; lng: number }
export interface Converted extends LatLng { shift: string; accuracyM: number }

function convertWith(e: number, n: number, sys: SystemDef, towgs84?: string): LatLng {
  const src = towgs84 ? `${sys.proj} +towgs84=${towgs84} +no_defs` : `${sys.proj} +no_defs`;
  const [lng, lat] = proj4(src, WGS84, [e, n]);
  return { lat, lng };
}

/** Survey-plan easting/northing to phone (WGS84) latitude/longitude, using the best EPSG datum shift for the area. */
export function toWGS84(e: number, n: number, systemId: SystemId): Converted {
  const sys = SYSTEMS.find((s) => s.id === systemId)!;
  if (!sys.minna) return { ...convertWith(e, n, sys), shift: "None needed (already WGS 84)", accuracyM: 1 };
  const rough = convertWith(e, n, sys, SHIFT_NATIONAL.towgs84);
  const inSouth = rough.lng >= SOUTH_BBOX.west && rough.lng <= SOUTH_BBOX.east && rough.lat >= SOUTH_BBOX.south && rough.lat <= SOUTH_BBOX.north;
  const shift = inSouth ? SHIFT_SOUTH : SHIFT_NATIONAL;
  return { ...convertWith(e, n, sys, shift.towgs84), shift: shift.name, accuracyM: shift.accuracyM };
}

/** Phone latitude/longitude back to a survey system, e.g. to compare a walked beacon with the plan. */
export function fromWGS84(lat: number, lng: number, systemId: SystemId): { e: number; n: number } {
  const sys = SYSTEMS.find((s) => s.id === systemId)!;
  let towgs84: string | undefined;
  if (sys.minna) {
    const inSouth = lng >= SOUTH_BBOX.west && lng <= SOUTH_BBOX.east && lat >= SOUTH_BBOX.south && lat <= SOUTH_BBOX.north;
    towgs84 = (inSouth ? SHIFT_SOUTH : SHIFT_NATIONAL).towgs84;
  }
  const src = towgs84 ? `${sys.proj} +towgs84=${towgs84} +no_defs` : `${sys.proj} +no_defs`;
  const [e, n] = proj4(WGS84, src, [lng, lat]);
  return { e, n };
}

export const NIGERIA_BBOX = { west: 2.6, south: 4.2, east: 14.7, north: 13.95 };
export function inNigeria(p: LatLng) {
  return p.lng >= NIGERIA_BBOX.west && p.lng <= NIGERIA_BBOX.east && p.lat >= NIGERIA_BBOX.south && p.lat <= NIGERIA_BBOX.north;
}

/**
 * Every system that puts the point inside Nigeria. Belt choice can't be detected reliably from the numbers
 * (neighbouring belts land a few km apart), so systems whose own longitude strip contains the result are
 * listed first as "likely", but all are shown. A site visit settles it: the walked GPS matches only one.
 */
export function candidates(e: number, n: number) {
  return SYSTEMS.map((s) => {
    const point = toWGS84(e, n, s.id);
    return { system: s, point, likely: point.lng >= s.lngRange[0] && point.lng <= s.lngRange[1] };
  })
    .filter((c) => inNigeria(c.point))
    .sort((a, b) => Number(b.likely) - Number(a.likely) || Number(b.system.minna) - Number(a.system.minna));
}

/** Centre of the beacons (simple average; fine at plot scale). */
export function centroid(points: LatLng[]): LatLng {
  return { lat: points.reduce((t, p) => t + p.lat, 0) / points.length, lng: points.reduce((t, p) => t + p.lng, 0) / points.length };
}

// ---------- plot geometry (computed on the plan's own grid, like the surveyor did) ----------

export interface Beacon { id: string; e: number; n: number }

/** Area in square metres (shoelace formula on the plan grid). */
export function polygonArea(b: Beacon[]): number {
  let sum = 0;
  for (let i = 0; i < b.length; i++) {
    const a = b[i], c = b[(i + 1) % b.length];
    sum += a.e * c.n - c.e * a.n;
  }
  return Math.abs(sum) / 2;
}

/** Each side's length (m) and whole-circle bearing (degrees from grid north). */
export function sides(b: Beacon[]) {
  return b.map((a, i) => {
    const c = b[(i + 1) % b.length];
    const de = c.e - a.e, dn = c.n - a.n;
    const bearing = ((Math.atan2(de, dn) * 180) / Math.PI + 360) % 360;
    return { from: a.id, to: c.id, length: Math.hypot(de, dn), bearing };
  });
}

/** Bearing as surveyors write it: 123°45'. */
export function dms(deg: number) {
  const d = Math.floor(deg);
  const m = Math.round((deg - d) * 60);
  return m === 60 ? `${d + 1}°00'` : `${d}°${String(m).padStart(2, "0")}'`;
}

export function distanceM(a: LatLng, b: LatLng) {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Rough reference points, only to say "about 12 km from Enugu" so people can sanity-check a system choice.
export const PLACES: (LatLng & { name: string })[] = [
  { name: "Lagos (Ikeja)", lat: 6.60, lng: 3.35 }, { name: "Lagos Island", lat: 6.45, lng: 3.40 }, { name: "Lekki", lat: 6.44, lng: 3.53 },
  { name: "Abeokuta", lat: 7.16, lng: 3.35 }, { name: "Ibadan", lat: 7.38, lng: 3.90 }, { name: "Osogbo", lat: 7.77, lng: 4.56 },
  { name: "Ilorin", lat: 8.50, lng: 4.55 }, { name: "Akure", lat: 7.25, lng: 5.19 }, { name: "Ado-Ekiti", lat: 7.62, lng: 5.22 },
  { name: "Benin City", lat: 6.34, lng: 5.63 }, { name: "Warri", lat: 5.52, lng: 5.75 }, { name: "Asaba", lat: 6.20, lng: 6.73 },
  { name: "Onitsha", lat: 6.15, lng: 6.79 }, { name: "Awka", lat: 6.21, lng: 7.07 }, { name: "Enugu", lat: 6.44, lng: 7.50 },
  { name: "Owerri", lat: 5.48, lng: 7.03 }, { name: "Umuahia", lat: 5.53, lng: 7.49 }, { name: "Aba", lat: 5.11, lng: 7.37 },
  { name: "Port Harcourt", lat: 4.82, lng: 7.03 }, { name: "Yenagoa", lat: 4.92, lng: 6.26 }, { name: "Uyo", lat: 5.04, lng: 7.91 },
  { name: "Calabar", lat: 4.96, lng: 8.33 }, { name: "Abakaliki", lat: 6.32, lng: 8.11 }, { name: "Makurdi", lat: 7.73, lng: 8.54 },
  { name: "Lokoja", lat: 7.80, lng: 6.74 }, { name: "Abuja", lat: 9.06, lng: 7.49 }, { name: "Minna", lat: 9.61, lng: 6.56 },
  { name: "Jos", lat: 9.90, lng: 8.86 }, { name: "Kaduna", lat: 10.52, lng: 7.44 }, { name: "Kano", lat: 12.00, lng: 8.52 },
  { name: "Sokoto", lat: 13.06, lng: 5.24 }, { name: "Maiduguri", lat: 11.83, lng: 13.15 },
];
export function nearestPlace(p: LatLng) {
  let best = PLACES[0], bestD = Infinity;
  for (const pl of PLACES) { const d = distanceM(p, pl); if (d < bestD) { bestD = d; best = pl; } }
  return { name: best.name, km: Math.round(bestD / 1000) };
}
