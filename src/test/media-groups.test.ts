import { describe, expect, it } from "vitest";
import { MEDIA_GROUP, groupsOf, uploadGroups } from "@/models/media-groups";

const item = (t: number) => ({ id: `${1_790_000_000_000 + t}-x` });

describe("groupsOf", () => {
  it("folds the list in groups of 20, the last one shorter", () => {
    const g = groupsOf(Array.from({ length: 47 }, (_, i) => i));
    expect(MEDIA_GROUP).toBe(20);
    expect(g.map((x) => x.length)).toEqual([20, 20, 7]);
  });
  it("gives no group for an empty list", () => expect(groupsOf([])).toEqual([]));
});

describe("uploadGroups", () => {
  it("numbers groups by upload, every 20th upload starting a new one, newest group first", () => {
    // Listed newest first, as the media store keeps them.
    const list = Array.from({ length: 47 }, (_, i) => item(47 - i));
    const g = uploadGroups(list);
    expect(g.map((x) => [x.n, x.files.length, x.full])).toEqual([[3, 7, false], [2, 20, true], [1, 20, true]]);
    expect(g[2]!.files.at(-1)).toEqual(item(1));
    expect(g[0]!.files[0]).toEqual(item(47));
  });
  it("keeps a full group unchanged when one more file arrives", () => {
    const before = uploadGroups(Array.from({ length: 20 }, (_, i) => item(20 - i)));
    const after = uploadGroups([item(21), ...Array.from({ length: 20 }, (_, i) => item(20 - i))]);
    expect(after.map((x) => x.n)).toEqual([2, 1]);
    expect(after[1]!.files).toEqual(before[0]!.files);
  });
});
