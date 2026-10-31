import { describe, expect, it } from "vitest";
import { manifestKeys } from "./update-progress";

describe("manifestKeys", () => {
  it("reads the precache entries, adding the revision to unhashed files", () => {
    const sw = 'e([{url:"icon-192.png",revision:"abc"},{url:"assets/index-x1.js",revision:null}],{})';
    expect(manifestKeys(sw, "https://app.test")).toEqual(["https://app.test/icon-192.png?__WB_REVISION__=abc", "https://app.test/assets/index-x1.js"]);
  });
});
