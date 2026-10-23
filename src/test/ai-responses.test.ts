import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { aiResponses } from "@/lib/ai-responses";
import { readArResponse } from "@/controllers/ar-response.server";
import { arRecognitionSchema } from "@/models/ar-recognition";

const recognition = { identification: { level: "genus", leafVisible: true, evidence: "Foglie palmate lobate" }, survey: null, found: true, outline: null, label: "Acero", type: "tree", box: { x: 0.1, y: 0.1, w: 0.5, h: 0.8 }, soil: null, plant: { scientificName: "Acer", commonName: "Acero", form: "round", heightM: 8, crownM: 5, evergreen: false, density: 0.6, alternatives: [{ scientificName: "Acer campestre", commonName: "Acero campestre" }] } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const reply = (text: string, finishReason = "STOP") => json({ candidates: [{ finishReason, content: { parts: [{ text: "ragionamento", thought: true }, { text }] } }] });
const cameraRequest = () => aiResponses({
  stream: true,
  text: { format: { type: "json_schema", name: "ar_recognition", strict: true, schema: z.toJSONSchema(arRecognitionSchema) } },
  input: [{ role: "user", content: [{ type: "input_text", text: "Analizza" }, { type: "input_image", image_url: "data:image/jpeg;base64,QUJD" }] }],
});

describe("Gemini behind the Responses helper", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => { vi.stubEnv("GEMINI_API_KEY", "test-key"); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); fetchMock.mockReset(); });

  it("sends the camera frame inline with the enforced schema and yields a parseable recognition", async () => {
    fetchMock.mockResolvedValueOnce(reply(JSON.stringify(recognition)));
    const text = await readArResponse(await cameraRequest());
    expect(arRecognitionSchema.parse(JSON.parse(text))).toEqual(recognition);
    const sent = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(sent.contents[0].parts).toEqual([{ text: "Analizza" }, { inlineData: { mimeType: "image/jpeg", data: "QUJD" } }]);
    expect(sent.generationConfig.responseMimeType).toBe("application/json");
    expect(sent.generationConfig.responseJsonSchema.required).toContain("outline");
    expect(sent.generationConfig.responseJsonSchema.$schema).toBeUndefined();
  });

  it("retries in plain JSON mode when the structured schema is rejected, never for a bad key", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { message: "Invalid JSON payload", status: "INVALID_ARGUMENT" } }, 400)).mockResolvedValueOnce(reply(JSON.stringify(recognition)));
    expect(JSON.parse(await readArResponse(await cameraRequest()))).toEqual(recognition);
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string).generationConfig.responseJsonSchema).toBeUndefined();

    fetchMock.mockReset().mockResolvedValueOnce(json({ error: { message: "API key not valid. Please pass a valid API key." } }, 400));
    await expect(readArResponse(await cameraRequest())).rejects.toMatchObject({ status: 403, persistent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries an overloaded model once on each fallback model", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { message: "The model is overloaded.", status: "UNAVAILABLE" } }, 503)).mockResolvedValueOnce(reply(JSON.stringify(recognition)));
    expect(JSON.parse(await readArResponse(await cameraRequest()))).toEqual(recognition);
    expect(String(fetchMock.mock.calls[1]![0])).toContain("gemini-flash-lite-latest");

    fetchMock.mockReset().mockResolvedValue(json({ error: { message: "The model is overloaded." } }, 503));
    await expect(readArResponse(await cameraRequest())).rejects.toMatchObject({ status: 503, persistent: false, message: "Servizio AI sovraccarico, riprova tra qualche secondo." });
    expect(fetchMock.mock.calls.map(([url]) => String(url).split("/models/")[1]!.split(":")[0])).toEqual(["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash"]);
  });

  it("moves a rate-limited request to the fallback model, which has its own quota", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { message: "Resource exhausted" } }, 429)).mockResolvedValueOnce(reply(JSON.stringify(recognition)));
    expect(JSON.parse(await readArResponse(await cameraRequest()))).toEqual(recognition);
    expect(String(fetchMock.mock.calls[1]![0])).toContain("gemini-flash-lite-latest");
  });

  it("reports blocked, truncated and throttled replies without applying a result", async () => {
    fetchMock.mockResolvedValueOnce(reply("", "SAFETY"));
    await expect(readArResponse(await cameraRequest())).rejects.toMatchObject({ status: 422 });
    fetchMock.mockResolvedValueOnce(reply("{\"found\":", "MAX_TOKENS"));
    await expect(readArResponse(await cameraRequest())).rejects.toMatchObject({ status: 502 });
    fetchMock.mockReset().mockResolvedValue(json({ error: { message: "Resource exhausted" } }, 429));
    await expect(readArResponse(await cameraRequest())).rejects.toMatchObject({ status: 429, persistent: false, message: "Troppe richieste al servizio AI, riprova tra poco." });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
