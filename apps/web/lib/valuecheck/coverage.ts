/**
 * Where ValueCheck is switched on. Adding a state is a data change here plus market observations in the
 * database; the engine itself is state-agnostic.
 */
import type { Category, Condition, HomeType, LandUse } from "./types";

export const COVERED_STATES: Record<string, { lgas: readonly string[]; note: string }> = {
  Lagos: {
    note: "Limited coverage: estimates appear only where reviewed market evidence exists for your area.",
    lgas: [
      "Agege", "Ajeromi-Ifelodun", "Alimosho", "Amuwo-Odofin", "Apapa", "Badagry", "Epe", "Eti-Osa", "Ibeju-Lekki",
      "Ifako-Ijaiye", "Ikeja", "Ikorodu", "Kosofe", "Lagos Island", "Lagos Mainland", "Mushin", "Ojo", "Oshodi-Isolo",
      "Shomolu", "Surulere",
    ],
  },
};

export const LAND_USES: Record<LandUse, string> = {
  residential_plot: "Residential plot",
  commercial_plot: "Commercial plot",
  mixed_use_plot: "Mixed-use plot",
  agricultural: "Agricultural land",
};

export const HOME_TYPES: Record<HomeType, string> = {
  detached: "Detached house",
  semi_detached: "Semi-detached house",
  terraced: "Terraced house",
  bungalow: "Bungalow",
  duplex: "Duplex",
  flat: "Flat / apartment",
};

export const CONDITIONS: Record<Condition, string> = {
  new: "New or recently finished",
  good: "Good",
  fair: "Fair",
  needs_work: "Needs work",
};

export const TITLE_TYPES: Record<string, string> = {
  c_of_o: "Certificate of Occupancy",
  governors_consent: "Governor's consent",
  deed_of_assignment: "Registered deed of assignment",
  excision_gazette: "Excision / gazette",
  survey_only: "Survey plan only",
  other: "Other",
  unknown: "Not sure",
};

export const UTILITIES: Record<string, string> = { power: "Mains electricity", water: "Piped water", drainage: "Drainage" };

export function isTypeFor(category: Category, type: string): boolean {
  return category === "land" ? type in LAND_USES : type in HOME_TYPES;
}
