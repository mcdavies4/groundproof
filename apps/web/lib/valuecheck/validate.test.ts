import { describe, expect, it } from "vitest";
import { validateRequest, type Raw } from "./validate";

const land: Raw = { category: "land", state: "Lagos", lga: "Eti-Osa", neighbourhood: "Lekki Phase 1", propertyType: "residential_plot", landAreaSqm: "648" };
const home: Raw = { category: "residential", state: "Lagos", lga: "Ikeja", neighbourhood: "GRA", propertyType: "detached", buildingAreaSqm: "220", bedrooms: "4", bathrooms: "4" };
const errs = (r: Raw) => { const v = validateRequest(r); return v.ok ? {} : v.errors; };

describe("validateRequest", () => {
  it("accepts a good land request and trims input", () => {
    const v = validateRequest({ ...land, neighbourhood: "  Lekki   Phase 1 " });
    expect(v.ok).toBe(true);
    if (v.ok) { expect(v.subject.neighbourhood).toBe("Lekki Phase 1"); expect(v.subject.areaSource).toBe("user_stated"); }
  });
  it("accepts a good home request", () => {
    const v = validateRequest(home);
    expect(v.ok && v.subject.bedrooms).toBe(4);
  });
  it("parses numbers typed with commas", () => {
    const v = validateRequest({ ...land, landAreaSqm: "1,200.5" });
    expect(v.ok && v.subject.landAreaSqm).toBe(1200.5);
  });
  it("rejects states ValueCheck doesn't cover yet", () => {
    expect(errs({ ...land, state: "FCT (Abuja)" }).state).toMatch(/isn't available/);
    expect(errs({ ...land, state: "" }).state).toBeTruthy();
  });
  it("rejects an LGA that isn't in Lagos", () => {
    expect(errs({ ...land, lga: "Gwagwalada" }).lga).toBeTruthy();
  });
  it("requires a plot size for land and rejects absurd sizes", () => {
    expect(errs({ ...land, landAreaSqm: "" }).landAreaSqm).toBeTruthy();
    expect(errs({ ...land, landAreaSqm: "5" }).landAreaSqm).toBeTruthy();
    expect(errs({ ...land, landAreaSqm: "abc" }).landAreaSqm).toBeTruthy();
    expect(errs({ ...land, landAreaSqm: "99999999" }).landAreaSqm).toBeTruthy();
  });
  it("rejects a building on a land valuation", () => {
    expect(errs({ ...land, buildingAreaSqm: "150" }).buildingAreaSqm).toMatch(/empty plots/);
  });
  it("requires floor area or bedrooms for a home", () => {
    expect(errs({ ...home, buildingAreaSqm: "", bedrooms: "" }).buildingAreaSqm).toBeTruthy();
    expect(validateRequest({ ...home, buildingAreaSqm: "" }).ok).toBe(true);
  });
  it("checks bedrooms are whole numbers in range", () => {
    expect(errs({ ...home, bedrooms: "2.5" }).bedrooms).toBeTruthy();
    expect(errs({ ...home, bedrooms: "99" }).bedrooms).toBeTruthy();
  });
  it("rejects a property type from the wrong category", () => {
    expect(errs({ ...land, propertyType: "detached" }).propertyType).toBeTruthy();
    expect(errs({ ...home, propertyType: "residential_plot" }).propertyType).toBeTruthy();
  });
  it("ignores unknown utilities and rejects unknown conditions/titles", () => {
    const v = validateRequest({ ...land, utilities: "power,hack,water" });
    expect(v.ok && v.subject.utilities).toEqual(["power", "water"]);
    expect(errs({ ...home, condition: "mint" }).condition).toBeTruthy();
    expect(errs({ ...land, titleType: "trust_me" }).titleType).toBeTruthy();
  });
  it("only marks the area as from Plot Check when asked, for land, with a Nigerian location", () => {
    const v = validateRequest({ ...land, areaSource: "plot_check", lat: "6.45", lng: "3.5" });
    expect(v.ok && v.subject.areaSource).toBe("plot_check");
    expect(errs({ ...land, lat: "51.5", lng: "-0.1" }).lat).toMatch(/isn't in Nigeria/);
    expect(errs({ ...home, areaSource: "plot_check" }).areaSource).toBeTruthy();
  });
  it("caps free-text length", () => {
    const v = validateRequest({ ...land, addressNote: "x".repeat(500) });
    expect(v.ok && v.subject.addressNote!.length).toBe(200);
  });
});
