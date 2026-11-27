import { describe, expect, it } from "vitest";
import { projectName, syncStep } from "@/models/project-state";

describe("syncStep", () => {
  it("creates a project only once a place is chosen", () => {
    expect(syncStep({ meta: undefined, editedAt: 0, remoteAt: null, pending: true })).toBe("none");
    expect(syncStep({ meta: undefined, editedAt: 5, remoteAt: null, pending: false })).toBe("create");
  });
  it("lets the account win the first time on a device", () => {
    expect(syncStep({ meta: undefined, editedAt: 99, remoteAt: "2026-11-27T10:00:00Z", pending: false })).toBe("pull");
  });
  it("pushes edits made here, pulls changes made elsewhere", () => {
    const meta = { id: "p", known: "a", syncedAt: 100 };
    expect(syncStep({ meta, editedAt: 150, remoteAt: "b", pending: false })).toBe("push");
    expect(syncStep({ meta, editedAt: 50, remoteAt: "b", pending: false })).toBe("pull");
    expect(syncStep({ meta, editedAt: 50, remoteAt: "a", pending: false })).toBe("none");
  });
  it("names the project after the place", () => {
    expect(projectName("Piazza Vittorio Emanuele II, Campobasso")).toBe("Piazza Vittorio Emanuele II");
  });
});
