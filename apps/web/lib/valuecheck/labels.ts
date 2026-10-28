import type { ConfidenceLevel, Metric, PriceBasis, SourceType, Verification } from "./types";

export const BASIS_LABEL: Record<PriceBasis, string> = {
  asking: "Asking price",
  reported_sale: "Reported sale price",
  completed_sale: "Completed sale price",
};
export const VERIFICATION_LABEL: Record<Verification, string> = {
  unverified: "Not checked",
  source_checked: "Source checked",
  transaction_verified: "Transaction verified",
};
export const SOURCE_LABEL: Record<SourceType, string> = {
  portal_listing: "Property portal listing",
  agent: "Estate agent",
  valuer: "Valuer",
  user: "Groundproof user",
  government: "Government record",
  other: "Other source",
};
export const LEVEL_LABEL: Record<ConfidenceLevel, string> = { low: "Low confidence", medium: "Medium confidence", high: "High confidence" };
export const METRIC_LABEL: Record<Metric, string> = {
  price_per_sqm_land: "Price per m² of land",
  price_per_sqm_building: "Price per m² of floor area (building and land together)",
  total_price: "Whole-property price for the same number of bedrooms",
};

export const dateGB = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
