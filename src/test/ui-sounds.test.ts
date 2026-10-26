import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, "maxTouchPoints"); });

/** Installed app on a touch device with the given screen. */
const device = ({ installed = true, touch = true, width = 400, height = 800 } = {}) => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: installed, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  Object.defineProperty(navigator, "maxTouchPoints", { value: touch ? 5 : 0, configurable: true });
  vi.stubGlobal("ontouchstart", undefined);
  if (!touch) Reflect.deleteProperty(window, "ontouchstart");
  vi.stubGlobal("screen", { width, height });
};

describe("compare card click", () => {
  it("decodes the recorded tap once and plays it softly on every choice", async () => {
    vi.resetModules();
    const starts = vi.fn();
    const gains: number[] = [];
    const node = () => ({ connect: vi.fn().mockReturnThis(), disconnect: vi.fn() });
    vi.stubGlobal("AudioContext", vi.fn(function () {
      return {
        state: "running", destination: {},
        decodeAudioData: async () => ({ duration: 0.1 }),
        createBufferSource: () => ({ ...node(), start: starts }),
        createGain: () => ({ ...node(), gain: { set value(v: number) { gains.push(v); } } }),
      };
    }));
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1]), { headers: { "content-type": "audio/wav" } }));
    vi.stubGlobal("fetch", fetcher);
    const { playCompareClick, COMPARE_CLICK_URL } = await import("@/lib/ui-sounds");
    playCompareClick();
    playCompareClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(COMPARE_CLICK_URL);
    expect(starts).toHaveBeenCalledTimes(2);
    expect(gains).toEqual([0.75, 0.75]);
  });
  it("taps for buttons and button-like links, not for text links, disabled buttons or camera views", async () => {
    vi.resetModules();
    const starts = vi.fn();
    const node = () => ({ connect: vi.fn().mockReturnThis(), disconnect: vi.fn() });
    vi.stubGlobal("AudioContext", vi.fn(function () {
      return { state: "running", destination: {}, decodeAudioData: async () => ({ duration: 0.03 }), createBufferSource: () => ({ ...node(), start: starts }), createGain: () => ({ ...node(), gain: { value: 1 } }) };
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]), { headers: { "content-type": "audio/wav" } })));
    device();
    const { installUiClicks } = await import("@/lib/ui-sounds");
    document.body.innerHTML = '<button id="b"><span id="inner">Ok</span></button><button id="off" disabled>No</button><a id="nav" href="/casi" style="display:inline-flex">Casi</a><p><a id="text" href="/fonti">fonte</a></p><div data-no-ui-click><button id="cam">Scatta</button></div><div id="plain">testo</div>';
    const stop = installUiClicks();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const press = (id: string) => document.getElementById(id)!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    for (const id of ["inner", "nav"]) press(id);
    expect(starts).toHaveBeenCalledTimes(2);
    for (const id of ["off", "text", "cam", "plain"]) press(id);
    expect(starts).toHaveBeenCalledTimes(2);
    document.getElementById("b")!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    document.getElementById("b")!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(starts).toHaveBeenCalledTimes(3);
    // Touch: silent on touch-down (a scroll may follow), one tap when the press activates the button.
    document.getElementById("inner")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "touch" }));
    expect(starts).toHaveBeenCalledTimes(3);
    document.getElementById("inner")!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(starts).toHaveBeenCalledTimes(4);
    // A touch that scrolled (no click) leaves no pending tap for the next mouse click.
    document.getElementById("inner")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "touch" }));
    press("inner");
    expect(starts).toHaveBeenCalledTimes(5);
    document.getElementById("b")!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(starts).toHaveBeenCalledTimes(5);
    // A menu trigger that opens on touch-down: its click lands on the page behind, still one tap.
    document.getElementById("inner")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "touch" }));
    document.getElementById("plain")!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(starts).toHaveBeenCalledTimes(6);
    // Touch on plain text stays silent; a cancelled touch (scroll) forgets its button.
    document.getElementById("plain")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "touch" }));
    document.getElementById("plain")!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    document.getElementById("inner")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "touch" }));
    document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
    document.getElementById("plain")!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(starts).toHaveBeenCalledTimes(6);
    stop();
    press("inner");
    expect(starts).toHaveBeenCalledTimes(6);
  });
  it("plays on touch devices, installed or in the browser: phone volume, softer on tablets, off on desktop", async () => {
    vi.resetModules();
    const { uiClickVolume, UI_CLICK_VOLUME, TABLET_CLICK_VOLUME } = await import("@/lib/ui-sounds");
    device({ width: 412, height: 915 });
    expect(uiClickVolume()).toBe(UI_CLICK_VOLUME);
    device({ width: 1440, height: 960 });
    expect(uiClickVolume()).toBe(TABLET_CLICK_VOLUME);
    expect(TABLET_CLICK_VOLUME).toBeLessThan(UI_CLICK_VOLUME);
    device({ touch: false, width: 1920, height: 1080 });
    expect(uiClickVolume()).toBe(0);
    device({ installed: false, width: 412, height: 915 });
    expect(uiClickVolume()).toBe(UI_CLICK_VOLUME);
  });
  it("stays silent without Web Audio", async () => {
    vi.resetModules();
    vi.stubGlobal("AudioContext", undefined);
    const { playCompareClick } = await import("@/lib/ui-sounds");
    expect(() => playCompareClick()).not.toThrow();
  });
});

describe("tablet click voicing", () => {
  it("filters the tap on tablets (no thud, crisp tick) and leaves phones untouched", async () => {
    vi.resetModules();
    const filters: Array<{ type: string; frequency: number }> = [];
    const node = () => ({ connect: vi.fn().mockReturnThis(), disconnect: vi.fn() });
    vi.stubGlobal("AudioContext", vi.fn(function () {
      return {
        state: "running", destination: {}, decodeAudioData: async () => ({ duration: 0.03 }),
        createBufferSource: () => ({ ...node(), start: vi.fn() }),
        createGain: () => ({ ...node(), gain: { value: 1 } }),
        createBiquadFilter: () => {
          const f = { ...node(), type: "", frequency: { value: 0 }, gain: { value: 0 } };
          filters.push(f as unknown as { type: string; frequency: number });
          return f;
        },
      };
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]), { headers: { "content-type": "audio/wav" } })));
    const { playCompareClick, TABLET_CLICK_TONE } = await import("@/lib/ui-sounds");
    playCompareClick(0.6);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(filters).toHaveLength(0);
    playCompareClick(0.6, TABLET_CLICK_TONE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(filters.map((f) => f.type)).toEqual(["highpass", "highshelf", "lowpass"]);
  });
});

describe("tap timing", () => {
  it("plays when the finger lifts on the button, once, and not after a scroll", async () => {
    vi.resetModules();
    const starts = vi.fn();
    const node = () => ({ connect: vi.fn().mockReturnThis(), disconnect: vi.fn() });
    vi.stubGlobal("AudioContext", vi.fn(function () {
      return { state: "running", destination: {}, decodeAudioData: async () => ({ duration: 0.03 }), createBufferSource: () => ({ ...node(), start: starts }), createGain: () => ({ ...node(), gain: { value: 1 } }), createBiquadFilter: () => ({ ...node(), frequency: { value: 0 }, gain: { value: 0 } }) };
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]), { headers: { "content-type": "audio/wav" } })));
    device();
    const { installUiClicks, preloadCompareClick } = await import("@/lib/ui-sounds");
    document.body.innerHTML = '<button id="b"><span id="inner">Ok</span></button>';
    const stop = installUiClicks();
    await preloadCompareClick();
    const el = document.getElementById("inner")!;
    const ev = (type: string, x: number, y: number) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "touch", pointerId: 7, clientX: x, clientY: y }));
    // Tap: sound on lift, none on the click that follows.
    ev("pointerdown", 10, 10); expect(starts).toHaveBeenCalledTimes(0);
    ev("pointerup", 12, 11); expect(starts).toHaveBeenCalledTimes(1);
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })); expect(starts).toHaveBeenCalledTimes(1);
    // Scroll: the finger moved, no sound.
    ev("pointerdown", 10, 10); ev("pointerup", 10, 80); expect(starts).toHaveBeenCalledTimes(1);
    stop();
  });
});
