export type Verdict = "pending" | "verified" | "review" | "flagged";

export interface Property {
  id: string;
  label: string;
  postcode: string | null;
  nipost_address: {
    administrative: { state_name?: string; lga_name?: string; locality_name?: string; zone?: string } | null;
    recent_house_address: string | null;
    mock?: boolean;
  } | null;
  nipost_building_use: string | null;
  nipost_level: number | null;
  anchored_at: string | null;
  created_at: string;
  anchor_mode: "postcode" | "coordinates" | null;
  nipost_suggested_postcode: string | null;
  payment_currency: Currency;
  share_token?: string | null;
  plan: "none" | "watch" | "build";
  plan_expires_at: string | null;
  check_credits: number;
  require_video?: boolean;
  require_code?: boolean;
  estate_id?: string | null;
  kind?: "building" | "plot";
  beacons?: { label: string; lat: number; lng: number }[] | null;
}

export interface Milestone {
  id: string;
  name: string;
  amount: number | null;
  sort: number;
  completed_checkin_id: string | null;
}

export interface Checkin {
  id: string;
  milestone_id: string | null;
  is_anchor: boolean;
  lat: number;
  lng: number;
  gps_accuracy_m: number;
  server_time: string;
  device_time: string;
  taken_offline: boolean;
  video_path: string | null;
  photo_paths: string[];
  note: string | null;
  verdict: Verdict;
  verdict_reason: string | null;
  nipost_mock: boolean | null;
  photo_match: "match" | "mismatch" | "unsure" | "unavailable" | null;
  photo_note: string | null;
  heading_ok: boolean | null;
  is_emulator: boolean;
  match_type: "postcode" | "coordinates" | null;
  distance_from_anchor_m: number | null;
  audit_of: string | null;
  audit_result: "agree" | "disagree" | "unsure" | "unavailable" | null;
  audit_status: "agreed" | "disputed" | "unsure" | null;
}

export const PRODUCTS = {
  pack3: { name: "3 check-ins", price: "₦6,000", note: "₦2,000 each, no expiry" },
  watch_30: { name: "Watch, 30 days", price: "₦5,000", note: "Up to 5 check-ins" },
  build_30: { name: "Build, 30 days", price: "₦15,000", note: "Unlimited check-ins" },
  build_365: { name: "Build, 12 months", price: "₦150,000", note: "Two months free" },
  independent3: { name: "3 independent checks", price: "₦6,000", note: "For your own reporter's visits on this unit" },
} as const;
export type Product = keyof typeof PRODUCTS;

export const CURRENCIES = {
  NGN: "Naira (₦)",
  GBP: "Pounds (£)",
  USD: "US dollars ($)",
  EUR: "Euros (€)",
  CAD: "Canadian dollars (CA$)",
} as const;
export type Currency = keyof typeof CURRENCIES;

export function formatMoney(amount: number, currency: Currency) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    // ₦ needs the narrow symbol; others keep theirs so CA$ and US$ stay distinct.
    currencyDisplay: currency === "NGN" ? "narrowSymbol" : "symbol",
    maximumFractionDigits: currency === "NGN" ? 0 : 2,
  }).format(amount);
}
