import { describe, expect, it } from "vitest";
import { officeScore, pickOfficeMail } from "@/models/office-email";

describe("office email from the register", () => {
  const offices = [
    { name: "Settore Ambiente e Verde Pubblico", mails: [{ mail: "ambiente@pec.comune.x.it", pec: true }, { mail: "Ambiente@comune.x.it", pec: false }] },
    { name: "Ufficio Tecnico Comunale", mails: [{ mail: "utc@comune.x.it", pec: false }] },
    { name: "Polizia Municipale", mails: [{ mail: "pm@comune.x.it", pec: false }] },
  ];
  it("matches the office by its words, ordinary address first", () => {
    expect(pickOfficeMail(offices, "Ambiente e verde pubblico")).toEqual({ mail: "ambiente@comune.x.it", office: "Settore Ambiente e Verde Pubblico", pec: false });
    expect(pickOfficeMail(offices, "Ufficio tecnico")?.mail).toBe("utc@comune.x.it");
  });
  it("finds nothing for an office not in the register", () => {
    expect(pickOfficeMail(offices, "Cultura e turismo")).toBeNull();
    expect(officeScore("Polizia Municipale", "Polizia locale")).toBe(0.5);
  });
});
