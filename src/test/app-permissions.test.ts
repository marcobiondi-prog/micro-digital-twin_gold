import { describe, expect, it } from "vitest";
import { PERMS, changeMessage } from "@/lib/app-permissions";

describe("app permissions", () => {
  it("lists position, camera and notifications", () => expect(PERMS.map((p) => p.kind)).toEqual(["posizione", "fotocamera", "notifiche"]));
  it("says each change in plain words, agreeing in gender and number", () => {
    expect(changeMessage("posizione", "granted")).toBe("La posizione ora è consentita.");
    expect(changeMessage("notifiche", "denied")).toBe("Le notifiche ora è bloccate: puoi riattivarle dalle impostazioni.".replace("è bloccate", "sono bloccate"));
  });
});
