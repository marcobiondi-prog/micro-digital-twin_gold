import { describe, expect, it } from "vitest";
import { MEDIA_GROUP, groupsOf } from "@/views/LabMedia";

describe("groupsOf", () => {
  it("folds the list in groups of 20, the last one shorter", () => {
    const g = groupsOf(Array.from({ length: 47 }, (_, i) => i));
    expect(MEDIA_GROUP).toBe(20);
    expect(g.map((x) => x.length)).toEqual([20, 20, 7]);
    expect(g[1]![0]).toBe(20);
  });
  it("gives no group for an empty list", () => expect(groupsOf([])).toEqual([]));
});
