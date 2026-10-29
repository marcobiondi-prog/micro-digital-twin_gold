import { describe, expect, it } from "vitest";
import { checkAgronomo, checkFunzionario, findRegion, officeOf, searchOffices, isProId, isTownEmail, isLicenceNumber, proSummary, searchRegions, unlocks } from "@/models/professional-id";

const today = new Date("2026-10-29T12:00:00");
const agro = { name: "Maria Rossi", licenceType: "consulente", licence: "mol/cb/01234", region: "Molise", expires: "2029-05-31", declared: true };
const funz = { name: "Luca Bianchi", comune: "Campobasso", office: "Ufficio tecnico", otherOffice: "", role: "Funzionario", email: "Luca.Bianchi@comune.campobasso.it", badge: "", declared: true };

describe("professional profile", () => {
  it("accepts a valid licence and opens only the vineyard", () => {
    const { id, errors } = checkAgronomo(agro, today);
    expect(errors).toEqual({});
    expect(id?.licence).toBe("MOL/CB/01234");
    expect(unlocks(id, "vineyard")).toBe(true);
    expect(unlocks(id, "urban")).toBe(false);
    expect(proSummary(id!)).toBe("Agronomo · patentino MOL/CB/01234 (Molise)");
  });
  it("refuses an expired licence, a missing declaration and a bad number", () => {
    const { id, errors } = checkAgronomo({ ...agro, expires: "2025-01-01", declared: false, licence: "x" }, today);
    expect(id).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(["declared", "expires", "licence"]);
  });
  it("opens only the piazza to a municipal officer with the town's email", () => {
    const { id } = checkFunzionario(funz, today);
    expect(id?.email).toBe("luca.bianchi@comune.campobasso.it");
    expect(unlocks(id, "urban")).toBe(true);
    expect(unlocks(id, "vineyard")).toBe(false);
    expect(unlocks(null, "urban")).toBe(false);
  });
  it("asks for the office's name with Altro and for a town email", () => {
    const { errors } = checkFunzionario({ ...funz, office: "Altro", email: "luca@gmail.com" }, today);
    expect(Object.keys(errors).sort()).toEqual(["email", "otherOffice"]);
    expect(checkFunzionario({ ...funz, office: "Altro", otherOffice: "Protezione civile" }, today).id?.office).toBe("Protezione civile");
  });
  it("reads town emails and licence numbers", () => {
    expect(isTownEmail("a.b@comune.roma.it")).toBe(true);
    expect(isTownEmail("a@comune-campobasso.it")).toBe(true);
    expect(isTownEmail("a@campobasso.it")).toBe(false);
    expect(isLicenceNumber("CB-2021-0042")).toBe(true);
    expect(isLicenceNumber("ABCDE")).toBe(false);
  });
  it("keeps only saved profiles that still read right", () => {
    expect(isProId(checkAgronomo(agro, today).id)).toBe(true);
    expect(isProId({ kind: "agronomo", name: "x" })).toBe(false);
    expect(isProId(null)).toBe(false);
  });
});

describe("regions", () => {
  it("lists every region when nothing is typed, and narrows as one types", () => {
    expect(searchRegions("")).toHaveLength(20);
    expect(searchRegions("mo")).toEqual(["Molise", "Piemonte"]);
    expect(searchRegions("li")[0]).toBe("Liguria");
    expect(searchRegions("li")).toContain("Friuli Venezia Giulia");
  });
  it("takes the region's own spelling", () => {
    expect(findRegion("valle d aosta")).toBe("Valle d'Aosta");
    expect(findRegion("EMILIA-romagna")).toBe("Emilia-Romagna");
    expect(findRegion("Padania")).toBeUndefined();
  });
});

describe("offices", () => {
  it("lists every office but Altro when nothing is typed, and narrows as one types", () => {
    expect(searchOffices("")).not.toContain("Altro");
    expect(searchOffices("urb")).toEqual(["Urbanistica"]);
    expect(searchOffices("pubbl")[0]).toBe("Lavori pubblici");
  });
  it("reads a listed office with its spelling, or an unlisted one by name", () => {
    expect(officeOf("ufficio TECNICO")).toEqual({ office: "Ufficio tecnico", otherOffice: "" });
    expect(officeOf("Ufficio cimiteri")).toEqual({ office: "Altro", otherOffice: "Ufficio cimiteri" });
    expect(checkFunzionario({ ...funz, ...officeOf("Ufficio cimiteri") }, today).id?.office).toBe("Ufficio cimiteri");
    expect(checkFunzionario({ ...funz, ...officeOf("") }, today).errors.office).toBeTruthy();
  });
});
