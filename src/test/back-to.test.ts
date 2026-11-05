import { beforeEach, describe, expect, it } from "vitest";
import { backTarget, historyHome, rememberBack } from "@/lib/back-to";

const at = (path: string) => window.history.replaceState(null, "", path);
describe("Cronologia goes back where it was opened", () => {
  beforeEach(() => sessionStorage.clear());
  it("from the dashboard back to the dashboard, named so", () => {
    at("/dashboard?tab=Piazza"); rememberBack("/cronologia");
    expect(backTarget("/cronologia")).toEqual({ href: "/dashboard?tab=Piazza", label: "Dashboard" });
    expect(historyHome("/cronologia")).toBe("/dashboard");
  });
  it("Benvenuto when nothing was remembered", () => {
    expect(backTarget("/cronologia")).toEqual({ href: "/benvenuto", label: "Benvenuto" });
  });
  it("the archive opened from the Cronologia goes back there, the Cronologia still to the dashboard", () => {
    at("/dashboard"); rememberBack("/cronologia");
    at("/cronologia"); rememberBack("/archivio");
    expect(backTarget("/archivio").label).toBe("Cronologia");
    expect(backTarget("/cronologia").label).toBe("Dashboard");
  });
});
