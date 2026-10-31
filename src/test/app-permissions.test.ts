import { describe, expect, it } from "vitest";
import { PERMS, changeMessage } from "@/lib/app-permissions";

describe("app permissions", () => {
  it("lists position, camera and notifications", () => expect(PERMS.map((p) => p.kind)).toEqual(["posizione", "fotocamera", "notifiche"]));
  it("says each change in plain words, agreeing in gender and number", () => {
    expect(changeMessage("posizione", "granted")).toBe("La posizione ora è consentita.");
    expect(changeMessage("notifiche", "denied")).toBe("Le notifiche ora è bloccate: puoi riattivarle dalle impostazioni.".replace("è bloccate", "sono bloccate"));
  });
});

describe("revoked inside the app", () => {
  it("refuses the camera and the position while revoked, and allows them again", async () => {
    const { appAllowed, setAppAllowed } = await import("@/lib/app-permissions");
    expect(appAllowed("fotocamera")).toBe(true);
    setAppAllowed("fotocamera", false);
    expect(appAllowed("fotocamera")).toBe(false);
    expect(appAllowed("posizione")).toBe(true);
    setAppAllowed("fotocamera", true);
    expect(appAllowed("fotocamera")).toBe(true);
  });
});
