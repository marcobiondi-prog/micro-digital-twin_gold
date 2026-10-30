import { describe, expect, it } from "vitest";
import { forShare } from "@/views/v10/ExportSheet";

describe("forShare", () => {
  it("keeps the kinds the phone's share window takes, typed by their extension", () => {
    expect(forShare("report.pdf", new Blob(["x"]))?.type).toBe("application/pdf");
    expect(forShare("tabella.csv", new Blob(["x"], { type: "text/csv;charset=utf-8" }))?.type).toBe("text/csv");
    expect(forShare("foto.JPG", new Blob(["x"], { type: "application/octet-stream" }))?.type).toBe("image/jpeg");
  });
  it("sends the map data as plain text", () => {
    const f = forShare("mappa.geojson", new Blob(["{}"], { type: "application/geo+json" }));
    expect(f?.name).toBe("mappa.geojson.txt");
    expect(f?.type).toBe("text/plain");
  });
  it("names a file without extension from its type, and leaves out what cannot go", () => {
    expect(forShare("0-8k0vh-20220829_115422", new Blob(["x"], { type: "image/gif" }))?.name).toBe("0-8k0vh-20220829_115422.gif");
    expect(forShare("video.mov", new Blob(["x"], { type: "video/quicktime" }))).toBeNull();
    expect(forShare("foto.heic", new Blob(["x"], { type: "image/heic" }))).toBeNull();
  });
});
