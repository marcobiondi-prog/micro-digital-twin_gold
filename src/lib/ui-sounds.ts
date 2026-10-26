// Short recorded UI clicks played through Web Audio: decoded once, low latency, never blocking.
// WAV, not MP3: MP3 encoders pad the start with silence, which would delay the tap.
// Imported as an asset so its URL carries a content hash: a changed sound never plays from a stale cache.
import compareClickUrl from "@/assets/compare-click.wav";
import { isTouchDevice } from "@/lib/touch-device";

export const COMPARE_CLICK_URL = compareClickUrl;
/** Slightly below full scale: the tap accompanies every button, so it stays discreet. */
export const UI_CLICK_VOLUME = 0.75;
/** Tablets sit closer to their speakers' full range, so they play a little softer. */
export const TABLET_CLICK_VOLUME = 0.6;

/**
 * Button taps belong to touch devices, in the installed app and in a browser tab alike; desktops
 * (no touchscreen) stay silent; phones (short side < 600 px) play at UI_CLICK_VOLUME, tablets softer.
 */
export function uiClickVolume(): number {
  if (typeof window === "undefined" || !isTouchDevice()) return 0;
  return isTabletScreen() ? TABLET_CLICK_VOLUME : UI_CLICK_VOLUME;
}

function isTabletScreen(): boolean {
  const shortSide = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight);
  return shortSide >= 600;
}

/**
 * Tablet voicing: larger speakers reproduce the low knock of the tap as a dull thud, so the
 * tablet chain trims the lows (high-pass), lifts the bright tick (high shelf) and rounds the
 * harsh top (low-pass) for a crisp, glassy click at the softer tablet volume.
 */
export const TABLET_CLICK_TONE = { highpassHz: 900, shelfHz: 3200, shelfGainDb: 4, lowpassHz: 9500 } as const;

function tap(): void {
  const volume = uiClickVolume();
  if (volume > 0) playCompareClick(volume, isTabletScreen() ? TABLET_CLICK_TONE : null);
}
let context: AudioContext | undefined;
let click: Promise<AudioBuffer | null> | undefined;
let decoded: AudioBuffer | null = null;

function audioContext(): AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Audio) return undefined;
  // "interactive" asks for the shortest output buffer, so the tap lands with the touch.
  if (!context || context.state === "closed") context = new Audio({ latencyHint: "interactive" });
  return context;
}

/** Fetch and decode the compare-card click ahead of the first tap. */
export function preloadCompareClick(): Promise<AudioBuffer | null> {
  const ctx = audioContext();
  if (!ctx) return Promise.resolve(null);
  click ??= fetch(COMPARE_CLICK_URL)
    .then((r) => (r.ok && /audio|octet-stream/.test(r.headers.get("content-type") ?? "") ? r.arrayBuffer() : null))
    .then((data) => (data ? ctx.decodeAudioData(data) : null))
    .then((buffer) => (decoded = buffer))
    .catch(() => null);
  return click;
}

/** Keyboard-style tap (like Gboard keys or the PSP menu): a bright noise tick, a short tonal body, a faint knock and a high shimmer, played back at double speed (~25 ms); plays at once when already decoded. */
export function playCompareClick(volume = UI_CLICK_VOLUME, tone: typeof TABLET_CLICK_TONE | null = null): void {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const play = (buffer: AudioBuffer | null) => {
      if (!buffer) return;
      try {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer;
        gain.gain.value = Math.min(1, Math.max(0, volume));
        const filters: BiquadFilterNode[] = [];
        if (tone) {
          const filter = (type: BiquadFilterType, frequency: number, gainDb = 0) => {
            const f = ctx.createBiquadFilter();
            f.type = type; f.frequency.value = frequency; f.gain.value = gainDb;
            filters.push(f);
            return f;
          };
          source.connect(filter("highpass", tone.highpassHz)).connect(filter("highshelf", tone.shelfHz, tone.shelfGainDb)).connect(filter("lowpass", tone.lowpassHz)).connect(gain);
        } else source.connect(gain);
        gain.connect(ctx.destination);
        source.onended = () => { source.disconnect(); filters.forEach((f) => f.disconnect()); gain.disconnect(); };
        source.start();
      } catch { /* Audio rejection must not block the choice. */ }
    };
    if (decoded) play(decoded);
    else void preloadCompareClick().then(play);
  } catch { /* Audio unavailable. */ }
}

/** Buttons and button-like controls; inline text links are left silent. */
const CLICKABLE = 'button, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], summary, a[href]';

function clickTarget(target: EventTarget | null): Element | null {
  const el = target instanceof Element ? target.closest(CLICKABLE) : null;
  if (!el || el.closest("[data-no-ui-click]")) return null;
  if (el.matches(":disabled, [aria-disabled='true']")) return null;
  if (el.tagName === "A" && getComputedStyle(el).display === "inline") return null;
  return el;
}

/** A touch that moved further than this is a scroll or a drag, not a tap. */
const TAP_SLOP_PX = 10;

/**
 * One app-wide listener (volume and on/off from uiClickVolume). A mouse taps on button-down; touch
 * and pen tap the moment the finger lifts on the same control without having moved (pointerup comes
 * before the click and before any re-render, so the sound lands with the tap), and the click that
 * follows stays silent. A click without that lift (menus that open on touch-down, keyboard with
 * detail 0) still taps once. Touching a button to scroll stays silent. Controls with their own sound
 * (shutter, record, AI scan) and the system camera opt out with data-no-ui-click.
 */
export function installUiClicks(): () => void {
  if (typeof document === "undefined") return () => {};
  void preloadCompareClick();
  let pointer = "mouse";
  // The control a touch started on: menus that open on pointer down (Radix triggers) make
  // the following click land on the page behind them, so the press is matched to its start.
  let pressed: Element | null = null;
  let start: { id: number; x: number; y: number } | null = null;
  // Set when the lift already played: the click of the same tap must not play it again.
  let played = false;
  const down = (e: PointerEvent) => {
    pointer = e.pointerType || "mouse";
    played = false;
    pressed = pointer === "mouse" ? null : clickTarget(e.target);
    start = pressed ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    // Wake the audio engine on touch-down, so the lift plays without start-up delay.
    if (pressed && context?.state === "suspended") void context.resume().catch(() => {});
    if (pointer === "mouse" && e.button === 0 && clickTarget(e.target)) tap();
  };
  const up = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id || !pressed?.isConnected) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX;
    const lifted = clickTarget(document.elementFromPoint?.(e.clientX, e.clientY) ?? e.target);
    start = null;
    if (moved || (lifted && lifted !== pressed && !pressed.contains(lifted))) return;
    played = true;
    tap();
  };
  const click = (e: MouseEvent) => {
    const target = clickTarget(e.target) ?? (pressed?.isConnected ? pressed : null);
    if ((e.detail === 0 || pointer !== "mouse") && target && !played) tap();
    pointer = "mouse";
    pressed = null;
    played = false;
  };
  const cancel = () => { pressed = null; start = null; played = false; };
  document.addEventListener("pointerdown", down, { capture: true, passive: true });
  document.addEventListener("pointerup", up, { capture: true, passive: true });
  document.addEventListener("click", click, { capture: true, passive: true });
  document.addEventListener("pointercancel", cancel, { capture: true, passive: true });
  // Mobile browsers suspend idle audio; waking it when the app returns keeps the first tap on time.
  const wake = () => { if (!document.hidden && context?.state === "suspended") void context.resume().catch(() => {}); };
  document.addEventListener("visibilitychange", wake);
  return () => {
    document.removeEventListener("visibilitychange", wake);
    document.removeEventListener("pointerdown", down, { capture: true });
    document.removeEventListener("pointerup", up, { capture: true });
    document.removeEventListener("click", click, { capture: true });
    document.removeEventListener("pointercancel", cancel, { capture: true });
  };
}
