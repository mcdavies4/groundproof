export type Verdict = "pending" | "verified" | "review" | "flagged";

export interface Property {
  id: string;
  label: string;
  postcode: string;
  nipost_address: {
    administrative: { state_name?: string; lga_name?: string; locality_name?: string; zone?: string } | null;
    recent_house_address: string | null;
    mock?: boolean;
  } | null;
  nipost_building_use: string | null;
  nipost_level: number | null;
  anchored_at: string | null;
  created_at: string;
}

export interface Milestone {
  id: string;
  name: string;
  amount_gbp: number | null;
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
  photo_paths: string[];
  note: string | null;
  verdict: Verdict;
  verdict_reason: string | null;
  nipost_mock: boolean | null;
}
