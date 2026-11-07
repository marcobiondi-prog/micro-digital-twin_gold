import { describe, expect, it } from "vitest";
import { geocodingDeniedMessage } from "@/models/google-errors";

describe("geocodingDeniedMessage", () => {
  it("names the server key’s setup problem", () => {
    expect(geocodingDeniedMessage("API keys with referer restrictions cannot be used with this API.")).toMatch(/restrizione per siti web/);
    expect(geocodingDeniedMessage("This API project is not authorized to use this API.")).toMatch(/Geocoding API/);
    expect(geocodingDeniedMessage("You must enable Billing on the Google Cloud Project")).toMatch(/Fatturazione/);
    expect(geocodingDeniedMessage("The provided API key is invalid.")).toMatch(/non valida/);
  });
  it("falls back to the generic refusal", () => {
    expect(geocodingDeniedMessage()).toBe("Google Maps ha rifiutato la ricerca: verifica la chiave server.");
  });
});
