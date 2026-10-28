/**
 * ValueCheck types. Everything the engine consumes and produces is plain data so it can be stored as a
 * snapshot, tested without a database, and later rendered to PDF.
 */

export type Category = "land" | "residential";

/** What the price in an observation actually is. Asking prices are never relabelled as sale prices. */
export type PriceBasis = "asking" | "reported_sale" | "completed_sale";

export type SourceType = "portal_listing" | "agent" | "valuer" | "user" | "government" | "other";

/** How far Groundproof has checked the observation. Only reviewed ("approved") rows reach the engine. */
export type Verification = "unverified" | "source_checked" | "transaction_verified";

export type Condition = "new" | "good" | "fair" | "needs_work";

/** Where the subject's land area came from. Calculated geometry is not proof of ownership or boundaries. */
export type AreaSource = "user_stated" | "plot_check";

export type LandUse = "residential_plot" | "commercial_plot" | "mixed_use_plot" | "agricultural";
export type HomeType = "detached" | "semi_detached" | "terraced" | "bungalow" | "duplex" | "flat";

export interface Subject {
  category: Category;
  state: string;
  lga: string;
  neighbourhood: string;
  addressNote?: string;
  /** LandUse for land, HomeType for residential. */
  propertyType: string;
  landAreaSqm?: number;
  areaSource: AreaSource;
  buildingAreaSqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  condition?: Condition;
  ageYears?: number;
  titleType?: string;
  roadAccess?: "tarred" | "untarred" | "none";
  utilities?: string[];
  inEstate?: boolean;
  lat?: number;
  lng?: number;
}

/** One reviewed market observation, as returned by the valuecheck_candidates database function. */
export interface Observation {
  id: string;
  category: Category;
  state: string;
  lga: string;
  neighbourhood: string;
  propertyType: string;
  priceNgn: number;
  priceBasis: PriceBasis;
  landAreaSqm: number | null;
  buildingAreaSqm: number | null;
  bedrooms: number | null;
  condition: Condition | null;
  /** ISO date (YYYY-MM-DD) the price was seen or the sale happened. */
  observedOn: string;
  sourceType: SourceType;
  /** Public-safe description of the source, e.g. "Agent submission". Never a contact or private link. */
  sourceLabel: string;
  verification: Verification;
  lat: number | null;
  lng: number | null;
}

export type Metric = "price_per_sqm_land" | "price_per_sqm_building" | "total_price";

export interface IncludedComparable {
  id: string;
  neighbourhood: string;
  lga: string;
  propertyType: string;
  priceNgn: number;
  priceBasis: PriceBasis;
  observedOn: string;
  ageMonths: number;
  sourceType: SourceType;
  sourceLabel: string;
  verification: Verification;
  landAreaSqm: number | null;
  buildingAreaSqm: number | null;
  bedrooms: number | null;
  /** The number the estimate is built from (per m² or total, depending on `metric`). */
  metricValue: number;
  /** Price per m² of the area that matters for the category, where meaningful. */
  pricePerSqm: number | null;
  locationMatch: "neighbourhood" | "lga";
  distanceKm: number | null;
  weight: number;
  /** Plain-English reasons this observation was treated as comparable. */
  why: string[];
}

export interface ExcludedObservation { id: string; reason: string }

export type ConfidenceLevel = "low" | "medium" | "high";

export interface ConfidenceFactor { key: string; label: string; points: number; max: number; note: string }

export interface Confidence {
  score: number;
  level: ConfidenceLevel;
  factors: ConfidenceFactor[];
  /** Rules that capped the score, in plain English. */
  caps: string[];
}

export interface ValuationResult {
  calcVersion: string;
  valuationDate: string;
  /** "insufficient" means no figure is shown at all. */
  status: "insufficient" | "estimated";
  metric: Metric | null;
  /** Naira, rounded to 3 significant figures. Present only when status is "estimated". */
  range: { low: number; high: number } | null;
  /** Present only when the evidence supports a single figure (n >= 5 and confidence medium or high). */
  central: number | null;
  confidence: Confidence | null;
  comparables: IncludedComparable[];
  excluded: ExcludedObservation[];
  assumptions: string[];
  missing: string[];
  warnings: string[];
  limitations: string[];
  /** Headline reason when status is "insufficient". */
  insufficientReason: string | null;
}
