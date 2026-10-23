import { describe, expect, it } from "vitest";
import { arRecognitionSchema, estimateCooling, recognitionCanPlace, groundRegionAt, canEstimateRecognizedPlant, withPlantAlternatives } from "@/models/ar-recognition";
import { gatewayError, readArResponse } from "@/controllers/ar-response.server";
import { plantPhotoBounds } from "@/models/ar-plant-photo";

describe("AR recognition rules", () => {
  it("estimates leaf-identified plants without requiring a contour, never an uncertain guess", () => {
    const result = arRecognitionSchema.parse({ identification: {level:"species",leafVisible:true,evidence:"Foglia palmata a cinque lobi"}, survey:null, found:true, outline:null, label:"Acero", type:"tree", box:{x:0.1,y:0.1,w:0.5,h:0.8}, soil:null, plant:{scientificName:"Acer campestre",commonName:"Acero campestre",form:"round",heightM:6,crownM:4,evergreen:false,density:0.6,alternatives:null} });
    expect(canEstimateRecognizedPlant(result)).toBe(true);
    expect(canEstimateRecognizedPlant({...result, identification:{level:"uncertain",leafVisible:false,evidence:"Foglie non distinguibili"}})).toBe(false);
    expect(canEstimateRecognizedPlant({...result, type:"object"})).toBe(false);
  });
  it("permits only bounded nondegenerate photographed plant contours", () => {
    const outline = [{x:0.2,y:0.1},{x:0.5,y:0.1},{x:0.6,y:0.4},{x:0.5,y:0.9},{x:0.3,y:0.9},{x:0.1,y:0.4}];
    expect(plantPhotoBounds(outline)).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.8 });
    expect(plantPhotoBounds(outline.map(p => ({...p, x: 2})))).toBeNull();
    expect(plantPhotoBounds(outline.slice(0, 3))).toBeNull();
    expect(plantPhotoBounds(Array.from({length: 6}, () => ({x:0.5,y:0.5})))).toBeNull();
  });
  const survey = { consistency: "Granulosa", heatNote: "Esposta al sole, temperatura non misurata", regions: [{ label: "Terra", box: { x: 0, y: 0.5, w: 1, h: 0.5 }, exposure: "esposta" as const, plantable: true }] };
  it("places actual photographed plants even when the species is uncertain, never without a contour", () => {
    const input = { identification: null, survey: null, found: true, label: "Conifera", type: "tree", box: {x:0.1,y:0.1,w:0.5,h:0.8}, plant: null, soil: null, outline: [{x:0.2,y:0.1},{x:0.5,y:0.1},{x:0.6,y:0.4},{x:0.5,y:0.9},{x:0.3,y:0.9},{x:0.1,y:0.4}] };
    expect(recognitionCanPlace(arRecognitionSchema.parse(input))).toBe(true);
    expect(recognitionCanPlace(arRecognitionSchema.parse({...input, outline:null}))).toBe(false);
  });
  it("maps only the observed lower ground, never the sky or unknown areas", () => {
    expect(groundRegionAt(survey, 0.5, 0.8)?.label).toBe("Terra");
    expect(groundRegionAt(survey, 0.5, 0.3)).toBeNull();
    expect(groundRegionAt(survey, 1.2, 0.8)).toBeNull();
  });
  it("never permits a placeholder for soil-only recognition", () => {
    const result = arRecognitionSchema.parse({ identification: null, survey: null, outline: null, found: false, label: "", type: "object", box: null, plant: null, soil: { kind: "artificiale", label: "Asfalto", permeability: "bassa", plantable: false, note: "" } });
    expect(recognitionCanPlace(result)).toBe(false);
  });
  it("keeps the indicative species cooling capped at 3 °C", () => {
    expect(estimateCooling(30, 1, true).deltaT).toBe(3);
    expect(estimateCooling(4, 0.6, false)).toEqual({ deltaT: 0.44, shadeM2: 13 });
    // A small potted plant keeps a non-zero effect instead of rounding to 0.
    expect(estimateCooling(0.5, 0.8, true).deltaT).toBeGreaterThan(0);
  });
  it("preserves denial status and the safe reason without retrying", () => {
    const error = gatewayError(403, { message: "Vendor access disabled" });
    expect(error.status).toBe(403);
    expect(error.message).toBe("Vendor access disabled");
    expect(error.persistent).toBe(true);
  });
  it("consumes split stream frames and requires completion", async () => {
    const encoder = new TextEncoder();
    const response = new Response(new ReadableStream({ start(controller) {
      for (const s of ['data: {"type":"response.output_', 'text.delta","delta":"{}"}\n\n', 'data: {"type":"response.completed"}\n\n']) controller.enqueue(encoder.encode(s));
      controller.close();
    } }));
    expect(await readArResponse(response)).toBe("{}");
  });
  it("stops on a refusal even with HTTP 200", async () => {
    const response = new Response('data: {"type":"response.refusal.done","refusal":"Analysis declined"}\n\n');
    await expect(readArResponse(response)).rejects.toMatchObject({ status: 422, message: "Analysis declined", persistent: false });
  });
  it("defaults the look-alike species to none for older replies", () => {
    const result = arRecognitionSchema.parse(withPlantAlternatives({ identification: null, survey: null, found: true, outline: null, label: "Pianta", type: "tree", box: { x: 0, y: 0, w: 1, h: 1 }, soil: null, plant: { scientificName: "Ficus benjamina", commonName: "Ficus", form: "round", heightM: 2, crownM: 1, evergreen: true, density: 0.7 } }));
    expect(result.plant?.alternatives).toBeNull();
  });
});