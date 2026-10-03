/**
 * Thin NIPOST Postcode API client.
 *
 * Development: NIPOST_BASE_URL=https://ng-postcode.oliha.dev (or http://host.docker.internal:8081
 * if you run `npx ng-postcode-mock` locally). No key needed.
 * Production: unset NIPOST_BASE_URL and set NIPOST_API_KEY.
 * Docs: https://docs.postcode.gov.ng
 */

const BASE = Deno.env.get("NIPOST_BASE_URL") || "https://api.postcode.gov.ng";
const KEY = Deno.env.get("NIPOST_API_KEY") || "";

export class NipostError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export interface LookupData {
  postcode: string;
  valid: boolean;
  administrative_address?: { state_name?: string; lga_name?: string; locality_name?: string; zone?: string };
  recent_house_address?: { recent?: string };
  building_use_status?: string;
}

export interface ReverseData {
  found: boolean;
  radius_m: number;
  unit?: {
    postcode: string;
    display?: string;
    distance_m: number;
    confidence: "high" | "medium" | "low";
    address?: string;
  };
  message?: string;
}

async function get<T>(path: string, params: Record<string, string | number>) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, { headers: KEY ? { "X-API-Key": KEY } : {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new NipostError(
      res.status,
      body?.error?.code ?? `http_${res.status}`,
      body?.error?.message ?? `NIPOST returned ${res.status}`,
    );
  }
  const mock = body?.mock === true || res.headers.get("x-mock") === "true";
  return { data: body.data as T, mock };
}

export const nipost = {
  lookup: (code: string, level: 1 | 2 | 3) =>
    get<LookupData>("/v1/lookup", { code, level }),
  reverse: (lat: number, lng: number, maxDistanceM = 60) =>
    get<ReverseData>("/v1/search/reverse", { lat, lng, max_distance_m: maxDistanceM }),
};

/** Normalise user input ("la11w06tc10", "LA 11 W06 TC 10") to "LA-11-W06-TC-10", or null. */
export function normalisePostcode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = compact.match(/^([A-Z]{2})(\d{2})([A-Z0-9]{3})([A-Z]{2})(\d{2})$/);
  if (!m) return null;
  if (m[2] === "00" || m[5] === "00") return null;
  return m.slice(1).join("-");
}
