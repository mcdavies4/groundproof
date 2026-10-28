import { describe, expect, it } from "vitest";
import { estimate, monthsBetween, roundSig, weightedQuantile, PARAMS } from "./engine";
import type { Observation, Subject } from "./types";

// All figures below are SYNTHETIC test data. They are not market prices.
const TODAY = "2026-10-28";

const obs = (id: string, over: Partial<Observation> = {}): Observation => ({
  id, category: "land", state: "Lagos", lga: "Eti-Osa", neighbourhood: "Test Estate", propertyType: "residential_plot",
  priceNgn: 100_000_000, priceBasis: "completed_sale", landAreaSqm: 500, buildingAreaSqm: null, bedrooms: null,
  condition: null, observedOn: "2026-08-01", sourceType: "agent", sourceLabel: "Test source",
  verification: "transaction_verified", lat: null, lng: null, ...over,
});

const land: Subject = {
  category: "land", state: "Lagos", lga: "Eti-Osa", neighbourhood: "Test Estate", propertyType: "residential_plot",
  landAreaSqm: 500, areaSource: "user_stated", titleType: "c_of_o", roadAccess: "tarred", utilities: ["power"],
};

const house: Subject = {
  category: "residential", state: "Lagos", lga: "Eti-Osa", neighbourhood: "Test Estate", propertyType: "detached",
  landAreaSqm: 600, areaSource: "user_stated", buildingAreaSqm: 200, bedrooms: 4, bathrooms: 4, condition: "good", ageYears: 5,
};

const houseObs = (id: string, over: Partial<Observation> = {}) =>
  obs(id, { category: "residential", propertyType: "detached", landAreaSqm: 600, buildingAreaSqm: 200, bedrooms: 4, condition: "good", priceNgn: 400_000_000, ...over });

describe("helpers", () => {
  it("weightedQuantile handles equal weights and a single value", () => {
    expect(weightedQuantile([{ v: 5, w: 1 }], 0.5)).toBe(5);
    const four = [1, 2, 3, 4].map((v) => ({ v, w: 1 }));
    expect(weightedQuantile(four, 0.5)).toBeCloseTo(2.5);
    expect(weightedQuantile(four, 0)).toBe(1);
    expect(weightedQuantile(four, 1)).toBe(4);
  });
  it("weightedQuantile leans toward heavier evidence", () => {
    expect(weightedQuantile([{ v: 10, w: 1 }, { v: 20, w: 9 }], 0.5)).toBeGreaterThan(15);
  });
  it("roundSig avoids false precision", () => {
    expect(roundSig(123_456_789)).toBe(123_000_000);
    expect(roundSig(0)).toBe(0);
  });
  it("monthsBetween is about 12 for a year", () => {
    expect(monthsBetween("2025-10-28", TODAY)).toBeCloseTo(12, 0);
  });
});

describe("insufficient evidence", () => {
  it("shows no figure with no observations", () => {
    const r = estimate(land, [], TODAY);
    expect(r.status).toBe("insufficient");
    expect(r.range).toBeNull();
    expect(r.central).toBeNull();
    expect(r.confidence).toBeNull();
    expect(r.insufficientReason).toMatch(/no reviewed market evidence/i);
  });
  it("shows no figure with fewer than 3 comparables", () => {
    const r = estimate(land, [obs("a"), obs("b")], TODAY);
    expect(r.status).toBe("insufficient");
    expect(r.range).toBeNull();
    expect(r.comparables).toHaveLength(2);
  });
  it("refuses land without a plot size", () => {
    const r = estimate({ ...land, landAreaSqm: undefined }, [obs("a"), obs("b"), obs("c")], TODAY);
    expect(r.status).toBe("insufficient");
  });
  it("refuses a home with neither floor area nor bedrooms", () => {
    const r = estimate({ ...house, buildingAreaSqm: undefined, bedrooms: undefined }, [houseObs("a")], TODAY);
    expect(r.status).toBe("insufficient");
  });
});

describe("exclusions", () => {
  const s = (o: Partial<Observation>) => estimate(land, [obs("x", o)], TODAY).excluded[0]?.reason ?? "";
  it("drops other states, other types and other areas", () => {
    expect(s({ state: "Ogun" })).toMatch(/state/i);
    expect(s({ propertyType: "commercial_plot" })).toMatch(/type/i);
    expect(s({ lga: "Ikeja", neighbourhood: "Elsewhere" })).toMatch(/nearby alone/i);
  });
  it("drops stale, undated and future evidence", () => {
    expect(s({ observedOn: "2023-01-01" })).toMatch(/older/i);
    expect(s({ observedOn: "2027-01-01" })).toMatch(/future/i);
    expect(s({ observedOn: "not-a-date" })).toMatch(/date/i);
  });
  it("drops plots of very different size, or with no size", () => {
    expect(s({ landAreaSqm: 5000 })).toMatch(/too different/i);
    expect(s({ landAreaSqm: null })).toMatch(/no plot size/i);
  });
  it("keeps land and buildings apart", () => {
    expect(s({ buildingAreaSqm: 150 })).toMatch(/building/i);
    const r = estimate(land, [houseObs("h")], TODAY);
    expect(r.excluded[0].reason).toMatch(/different kind/i);
  });
});

describe("land valuation", () => {
  const six = ["a", "b", "c", "d", "e", "f"].map((id, i) => obs(id, { priceNgn: 100_000_000 + i * 2_000_000, observedOn: "2026-09-01" }));
  it("scales price per m² by the subject's plot size", () => {
    const r = estimate(land, six, TODAY);
    expect(r.status).toBe("estimated");
    expect(r.metric).toBe("price_per_sqm_land");
    // 500 m² plots at 100m..110m => 200k..220k per m² => range sits inside 100m..110m for a 500 m² plot
    expect(r.range!.low).toBeGreaterThanOrEqual(100_000_000);
    expect(r.range!.high).toBeLessThanOrEqual(110_000_000);
    expect(r.central).not.toBeNull();
    expect(r.confidence!.level).not.toBe("low");
  });
  it("prices a plot twice the size from the per-m² rate, not the total", () => {
    const big = estimate({ ...land, landAreaSqm: 1000 }, six.map((o) => ({ ...o, landAreaSqm: 800 })), TODAY);
    expect(big.status).toBe("estimated");
    // rates are 125k..137.5k per m²; a 1000 m² plot => ~125m..138m (not ~100m)
    expect(big.range!.low).toBeGreaterThan(120_000_000);
  });
  it("is deterministic", () => {
    expect(estimate(land, six, TODAY)).toEqual(estimate(land, six, TODAY));
  });
  it("records the Plot Check provenance without calling it verified", () => {
    const r = estimate({ ...land, areaSource: "plot_check" }, six, TODAY);
    const text = r.assumptions.join(" ");
    expect(text).toMatch(/Plot Check/);
    expect(text).toMatch(/not that the land is legally yours/);
  });
  it("sorts comparables with the heaviest first and explains each", () => {
    const r = estimate(land, six, TODAY);
    expect(r.comparables[0].weight).toBeGreaterThanOrEqual(r.comparables[5].weight);
    expect(r.comparables[0].why.length).toBeGreaterThan(0);
  });
});

describe("confidence rules", () => {
  it("gives a range but no central figure and low confidence with 3-4 comparables", () => {
    const r = estimate(land, [obs("a"), obs("b"), obs("c", { priceNgn: 104_000_000 })], TODAY);
    expect(r.status).toBe("estimated");
    expect(r.central).toBeNull();
    expect(r.confidence!.level).toBe("low");
    expect(r.confidence!.score).toBeLessThanOrEqual(PARAMS.caps.fewComparables);
    expect(r.warnings.join(" ")).toMatch(/low confidence/i);
  });
  it("needs at least 8 comparables for high confidence", () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => obs(`m${i}`, { observedOn: "2026-10-01", priceNgn: 100_000_000 + i * 500_000 }));
    expect(estimate(land, mk(6), TODAY).confidence!.level).toBe("medium");
    expect(estimate({ ...land, titleType: "c_of_o" }, mk(10), TODAY).confidence!.level).toBe("high");
  });
  it("never reaches high confidence on asking prices alone", () => {
    const asking = Array.from({ length: 12 }, (_, i) =>
      obs(`k${i}`, { priceBasis: "asking", verification: "source_checked", observedOn: "2026-10-01", priceNgn: 100_000_000 + i * 500_000 }));
    const r = estimate(land, asking, TODAY);
    expect(r.confidence!.score).toBeLessThanOrEqual(PARAMS.caps.askingOnly);
    expect(r.confidence!.level).not.toBe("high");
    expect(r.assumptions.join(" ")).toMatch(/not adjusted/i);
  });
  it("lowers confidence when comparable prices are widely spread", () => {
    const tight = Array.from({ length: 8 }, (_, i) => obs(`t${i}`, { priceNgn: 100_000_000 + i * 1_000_000 }));
    const wide = Array.from({ length: 8 }, (_, i) => obs(`w${i}`, { priceNgn: 60_000_000 + i * 20_000_000 }));
    expect(estimate(land, wide, TODAY).confidence!.score).toBeLessThan(estimate(land, tight, TODAY).confidence!.score);
    expect(estimate(land, wide, TODAY).confidence!.factors.some((f) => f.key === "spread")).toBe(true);
  });
  it("prefers verified, same-neighbourhood, recent evidence", () => {
    const strong = Array.from({ length: 8 }, (_, i) => obs(`s${i}`, { observedOn: "2026-10-01", priceNgn: 100_000_000 + i * 1_000_000 }));
    const weak = Array.from({ length: 8 }, (_, i) => obs(`v${i}`, {
      observedOn: "2025-01-15", verification: "unverified", priceBasis: "asking", neighbourhood: "Other Place", priceNgn: 100_000_000 + i * 1_000_000,
    }));
    expect(estimate(land, strong, TODAY).confidence!.score).toBeGreaterThan(estimate(land, weak, TODAY).confidence!.score);
  });
  it("explains every factor and sums to the score unless capped", () => {
    const r = estimate(land, Array.from({ length: 8 }, (_, i) => obs(`s${i}`, { priceNgn: 100_000_000 + i * 1_000_000 })), TODAY);
    const sum = r.confidence!.factors.reduce((t, f) => t + f.points, 0);
    expect(r.confidence!.caps.length === 0 ? Math.round(sum) : r.confidence!.score).toBe(r.confidence!.score);
    for (const f of r.confidence!.factors) expect(f.note.length).toBeGreaterThan(0);
  });
});

describe("residential valuation: land and buildings are not mixed up", () => {
  const homes = Array.from({ length: 6 }, (_, i) => houseObs(`h${i}`, { priceNgn: 400_000_000 + i * 8_000_000, observedOn: "2026-09-15" }));
  it("uses price per m² of building, never a land rate", () => {
    const r = estimate(house, homes, TODAY);
    expect(r.metric).toBe("price_per_sqm_building");
    expect(r.assumptions.join(" ")).toMatch(/land rate is not applied to a building/i);
    expect(r.range!.low).toBeGreaterThanOrEqual(400_000_000);
    expect(r.range!.high).toBeLessThanOrEqual(440_000_000);
  });
  it("ignores land sales when valuing a house, even in the same street", () => {
    const r = estimate(house, [...homes.slice(0, 2), obs("plot1"), obs("plot2"), obs("plot3")], TODAY);
    expect(r.status).toBe("insufficient");
    expect(r.excluded.filter((e) => /different kind/i.test(e.reason))).toHaveLength(3);
  });
  it("land valuation ignores completed houses", () => {
    expect(estimate(land, homes, TODAY).status).toBe("insufficient");
  });
  it("falls back to total price for the same bedroom count when floor area is missing", () => {
    const r = estimate({ ...house, buildingAreaSqm: undefined }, homes, TODAY);
    expect(r.metric).toBe("total_price");
    expect(r.assumptions.join(" ")).toMatch(/No floor area/);
    const other = estimate({ ...house, buildingAreaSqm: undefined, bedrooms: 3 }, homes, TODAY);
    expect(other.status).toBe("insufficient");
  });
  it("excludes houses on plots very different in size", () => {
    const r = estimate(house, [houseObs("big", { landAreaSqm: 3000 })], TODAY);
    expect(r.excluded[0].reason).toMatch(/plot size under the house/i);
  });
  it("weights a different condition lower without adjusting the price", () => {
    const same = estimate(house, [...homes], TODAY).comparables.find((c) => c.id === "h0")!;
    const diff = estimate(house, [{ ...houseObs("h0", { priceNgn: 400_000_000, observedOn: "2026-09-15" }), condition: "needs_work" }, ...homes.slice(1)], TODAY).comparables.find((c) => c.id === "h0")!;
    expect(diff.weight).toBeLessThan(same.weight);
    expect(diff.metricValue).toBe(same.metricValue);
    expect(diff.why.join(" ")).toMatch(/no price adjustment/);
  });
  it("flats are not penalised for missing plot size", () => {
    const flat = { ...house, propertyType: "flat", landAreaSqm: undefined };
    const flats = homes.map((h) => ({ ...h, propertyType: "flat", landAreaSqm: null }));
    expect(estimate(flat, flats, TODAY).status).toBe("estimated");
  });
});

describe("distance", () => {
  it("reports distance only when both sides have coordinates, and does not filter on it", () => {
    const s = { ...land, lat: 6.45, lng: 3.5 };
    const o = Array.from({ length: 3 }, (_, i) => obs(`d${i}`, { lat: i === 0 ? 6.46 : null, lng: i === 0 ? 3.5 : null }));
    const r = estimate(s, o, TODAY);
    expect(r.comparables.find((c) => c.id === "d0")!.distanceKm).toBeGreaterThan(0.5);
    expect(r.comparables.find((c) => c.id === "d1")!.distanceKm).toBeNull();
  });
});
