/**
 * Server-side validation of a ValueCheck request. The browser form is a convenience only: everything is
 * re-checked here, and the cleaned Subject is what the engine sees.
 */
import { NIGERIA_BBOX } from "../survey";
import { COVERED_STATES, CONDITIONS, TITLE_TYPES, UTILITIES, isTypeFor } from "./coverage";
import type { Category, Condition, Subject } from "./types";

export type Raw = Record<string, string | undefined>;
export type Validation = { ok: true; subject: Subject } | { ok: false; errors: Record<string, string> };

const clean = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Parses "1,200.5" or "1 200" into a number; null when blank or not a number. */
function num(s: string | undefined): number | null {
  const t = (s ?? "").replace(/[,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const LIMITS = {
  landSqm: { min: 20, max: 5_000_000 },
  buildingSqm: { min: 10, max: 20_000 },
  rooms: { min: 0, max: 20 },
  ageYears: { min: 0, max: 150 },
} as const;

export function validateRequest(raw: Raw): Validation {
  const errors: Record<string, string> = {};

  const category = raw.category as Category;
  if (category !== "land" && category !== "residential") errors.category = "Choose land or a house/flat.";

  const state = clean(raw.state, 40);
  const cover = COVERED_STATES[state];
  if (!cover) errors.state = state ? `ValueCheck isn't available for ${state} yet. It starts with Lagos.` : "Choose a state.";

  const lga = clean(raw.lga, 40);
  if (cover && !cover.lgas.includes(lga)) errors.lga = "Choose the local government area.";

  const neighbourhood = clean(raw.neighbourhood, 80);
  if (neighbourhood.length < 2) errors.neighbourhood = "Enter the neighbourhood or estate, for example Lekki Phase 1.";

  const propertyType = clean(raw.propertyType, 30);
  if ((category === "land" || category === "residential") && !isTypeFor(category, propertyType)) {
    errors.propertyType = category === "land" ? "Choose what the land is zoned or used for." : "Choose the type of home.";
  }

  const landArea = num(raw.landAreaSqm);
  const buildingArea = num(raw.buildingAreaSqm);

  if (category === "land") {
    if (landArea === null) errors.landAreaSqm = "Enter the plot size in square metres.";
    if (buildingArea !== null) errors.buildingAreaSqm = "Land valuations are for empty plots. Choose house/flat if there is a building.";
  }
  if (landArea !== null && (landArea < LIMITS.landSqm.min || landArea > LIMITS.landSqm.max)) {
    errors.landAreaSqm = `Plot size should be between ${LIMITS.landSqm.min} and ${LIMITS.landSqm.max.toLocaleString("en-GB")} m².`;
  }
  if (category === "residential") {
    if (buildingArea === null && num(raw.bedrooms) === null) errors.buildingAreaSqm = "Enter the floor area, or at least the number of bedrooms.";
  }
  if (buildingArea !== null && (buildingArea < LIMITS.buildingSqm.min || buildingArea > LIMITS.buildingSqm.max)) {
    errors.buildingAreaSqm = `Floor area should be between ${LIMITS.buildingSqm.min} and ${LIMITS.buildingSqm.max.toLocaleString("en-GB")} m².`;
  }

  const room = (key: "bedrooms" | "bathrooms") => {
    const n = num(raw[key]);
    if (n === null) return undefined;
    if (!Number.isInteger(n) || n < LIMITS.rooms.min || n > LIMITS.rooms.max) { errors[key] = "Enter a whole number from 0 to 20."; return undefined; }
    return n;
  };
  const bedrooms = category === "residential" ? room("bedrooms") : undefined;
  const bathrooms = category === "residential" ? room("bathrooms") : undefined;

  let ageYears: number | undefined;
  const age = num(raw.ageYears);
  if (category === "residential" && age !== null) {
    if (age < LIMITS.ageYears.min || age > LIMITS.ageYears.max) errors.ageYears = "Enter the building's age in years.";
    else ageYears = Math.round(age);
  }

  const condition = clean(raw.condition, 20) as Condition;
  if (category === "residential" && condition && !(condition in CONDITIONS)) errors.condition = "Choose a condition from the list.";

  const titleType = clean(raw.titleType, 30);
  if (titleType && !(titleType in TITLE_TYPES)) errors.titleType = "Choose a title from the list.";

  const road = clean(raw.roadAccess, 10);
  if (road && !["tarred", "untarred", "none"].includes(road)) errors.roadAccess = "Choose road access from the list.";

  const utilities = (raw.utilities ?? "").split(",").map((u) => u.trim()).filter((u) => u in UTILITIES);

  // Optional hand-over from Plot Check. The area is a calculation from coordinates the user typed in.
  let lat: number | undefined, lng: number | undefined;
  const la = num(raw.lat), ln = num(raw.lng);
  if (la !== null || ln !== null) {
    if (la === null || ln === null || la < NIGERIA_BBOX.south || la > NIGERIA_BBOX.north || ln < NIGERIA_BBOX.west || ln > NIGERIA_BBOX.east) {
      errors.lat = "That location isn't in Nigeria. Re-run Plot Check.";
    } else { lat = la; lng = ln; }
  }
  const usePlot = raw.areaSource === "plot_check";
  if (usePlot && category !== "land") errors.areaSource = "Plot Check areas apply to land only.";

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    subject: {
      category,
      state,
      lga,
      neighbourhood,
      addressNote: clean(raw.addressNote, 200) || undefined,
      propertyType,
      landAreaSqm: landArea ?? undefined,
      areaSource: usePlot && landArea !== null ? "plot_check" : "user_stated",
      buildingAreaSqm: category === "residential" ? buildingArea ?? undefined : undefined,
      bedrooms,
      bathrooms,
      condition: category === "residential" && condition ? condition : undefined,
      ageYears,
      titleType: titleType || undefined,
      roadAccess: (road || undefined) as Subject["roadAccess"],
      utilities: utilities.length ? utilities : undefined,
      inEstate: raw.inEstate === "on" ? true : undefined,
      lat,
      lng,
    },
  };
}
