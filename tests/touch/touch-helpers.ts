import { test as base, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Helpers for the touch suite. Every tap goes through the phone's real touch pipeline (touchstart → touchend →
 * pointer events → click, as Chrome makes them from a finger) at the control's centre, with no help from Playwright's
 * waiting: if something covers the control, the finger lands on that, as it would on a phone.
 *
 * Each tap is diagnosed apart, so a failure says WHERE the touch got lost:
 *  - hit:       what is under the finger (the control, or what covers it)          → "touch blocked by an overlay"
 *  - touch:     did the page receive touchstart/touchend                           → "the touch never reached the page"
 *  - click:     did the browser turn it into a click on the control                → "the tap was not a click"
 *  - prevented: did the app cancel the touch or the click (preventDefault)          → "the frontend swallowed it"
 *  - response:  ms from the finger's lift to the first change on screen            → "the frontend is slow"
 *  - longTask:  the longest main-thread block around the tap (ms)                   → "the frontend was busy"
 */
export type TapDiag = {
  scenario: string; control: string; hit: boolean; blocker: string | null; touch: boolean; click: boolean;
  clickTarget: string | null; prevented: string[]; responseMs: number | null; clickMs: number | null; longTaskMs: number; ok: boolean; note?: string;
};

const RECORDER = () => {
  const w = window as unknown as { __touch: { ev: Array<Record<string, unknown>>; lt: Array<{ t: number; d: number }>; mut: number[] } };
  w.__touch = { ev: [], lt: [], mut: [] };
  const desc = (t: EventTarget | null) => {
    if (!(t instanceof Element)) return String(t);
    const label = t.getAttribute("aria-label") || (t.textContent || "").trim().slice(0, 40);
    return `${t.tagName.toLowerCase()}${t.id ? "#" + t.id : ""}${label ? ` «${label}»` : ""}`;
  };
  for (const type of ["touchstart", "touchend", "touchcancel", "pointerdown", "pointerup", "pointercancel", "click"]) {
    window.addEventListener(type, (e) => w.__touch.ev.push({ type, t: performance.now(), target: desc(e.target), phase: "capture" }), { capture: true, passive: true });
    // Bubbling listener on window: runs after the app's handlers, so it sees whether the app cancelled the event.
    window.addEventListener(type, (e) => { if (e.defaultPrevented) w.__touch.ev.push({ type, t: performance.now(), prevented: true, target: desc(e.target) }); }, { passive: true });
  }
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__touch.lt.push({ t: e.startTime, d: e.duration }); }).observe({ type: "longtask", buffered: true });
  } catch { /* no long task API */ }
  new MutationObserver(() => { if (w.__touch.mut.length < 5000) w.__touch.mut.push(performance.now()); }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
};

const RESULTS: TapDiag[] = [];
export const results = RESULTS;

export const test = base.extend<{ cpuSlowdown: number; guest: boolean }>({
  cpuSlowdown: [1, { option: true }],
  guest: [false, { option: true }],
  page: async ({ page, cpuSlowdown, guest }, use) => {
    await page.addInitScript(({ guest }) => {
      localStorage.setItem("mdt-intro-seen", "1");
      localStorage.setItem("mdt-perms-asked-v1", "1");
      if (guest) localStorage.setItem("mdt-guest-v1", "1");
    }, { guest });
    await page.addInitScript(RECORDER);
    // The account service is not reachable from the test machine: it answers "nobody signed in", empty lists.
    await page.route("**/*supabase.co/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: r.request().url().includes("/rest/") ? "[]" : "{}" }));
    if (cpuSlowdown > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
    }
    await use(page);
  },
});
export { expect };

/** What is under the centre of the control (null when the control itself, or its inside, gets the finger). */
async function hitTest(page: Page, loc: Locator): Promise<{ x: number; y: number; blocker: string | null }> {
  await loc.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  await page.waitForTimeout(150);
  const box = await loc.boundingBox();
  if (!box) throw new Error("control not on screen");
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const blocker = await loc.evaluate((el, p) => {
    const top = document.elementFromPoint(p.x, p.y);
    if (!top || el === top || el.contains(top)) return null;
    const s = getComputedStyle(top);
    const label = top.getAttribute("aria-label") || (top.textContent || "").trim().slice(0, 40);
    return `${top.tagName.toLowerCase()}${top.id ? "#" + top.id : ""}.${String(top.getAttribute("class") ?? "").split(" ").slice(0, 4).join(".")} «${label}» (z-index ${s.zIndex}, position ${s.position}, opacity ${s.opacity})`;
  }, { x, y });
  return { x, y, blocker };
}

/** Taps the control like a finger and returns the diagnosis once `done` (the expected response) is met or times out. */
export async function fingerTap(page: Page, loc: Locator, scenario: string, control: string, done: () => Promise<unknown>, info?: TestInfo): Promise<TapDiag> {
  const { x, y, blocker } = await hitTest(page, loc);
  await page.evaluate(() => { const w = window as unknown as { __touch: { ev: unknown[]; mut: number[] } }; w.__touch.ev = []; w.__touch.mut = []; });
  const t0 = await page.evaluate(() => performance.now());
  await page.touchscreen.tap(x, y);
  let ok = true, note: string | undefined;
  try { await done(); } catch (e) { ok = false; note = String((e as Error).message).split("\n")[0]; }
  const rec = await page.evaluate((t0) => {
    const w = window as unknown as { __touch: { ev: Array<{ type: string; t: number; target: string; prevented?: boolean }>; lt: Array<{ t: number; d: number }> } };
    const ev = w.__touch.ev;
    const end = ev.find((e) => e.type === "touchend" && !e.prevented);
    const click = ev.find((e) => e.type === "click" && !e.prevented);
    const lt = w.__touch.lt.filter((l) => l.t + l.d >= t0 - 50).reduce((m, l) => Math.max(m, l.d), 0);
    return { touch: !!ev.find((e) => e.type === "touchstart") && !!end, endT: end?.t ?? null, click: !!click, clickT: click?.t ?? null, clickTarget: click?.target ?? null, prevented: ev.filter((e) => e.prevented).map((e) => `${e.type} su ${e.target}`), lt };
  }, t0);
  // First change on screen after the finger's lift.
  const mut = await page.evaluate((endT) => { const m = (window as unknown as { __touch: { mut: number[] } }).__touch.mut; return endT === null ? null : m.find((t) => t >= endT) ?? null; }, rec.endT);
  const diag: TapDiag = {
    scenario, control, hit: blocker === null, blocker, touch: rec.touch, click: rec.click, clickTarget: rec.clickTarget, prevented: rec.prevented,
    clickMs: rec.endT !== null && rec.clickT !== null ? Math.round(rec.clickT - rec.endT) : null,
    responseMs: ok && rec.endT !== null && mut !== null ? Math.max(0, Math.round(mut - rec.endT)) : null,
    longTaskMs: Math.round(rec.lt), ok, ...(note ? { note } : {}),
  };
  RESULTS.push(diag);
  record("taps", `${scenario} · ${control}`, diag);
  info?.annotations.push({ type: "tap", description: JSON.stringify(diag) });
  return diag;
}

/** A finger swipe (a scroll) that starts on the control: it must scroll, never act as a tap. */
export async function fingerSwipe(page: Page, x: number, y: number, dy: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (dy * i) / 8 }] }); await page.waitForTimeout(16); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Every visible control in the screen that the finger cannot reach, with what covers it. */
export async function sweepBlocked(page: Page): Promise<Array<{ control: string; blocker: string }>> {
  return page.evaluate(() => {
    const sel = 'button, a[href], [role="button"], [role="tab"], [role="radio"], [role="switch"], [role="slider"], input, select, textarea, summary';
    const out: Array<{ control: string; blocker: string }> = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.pointerEvents === "none" || Number(s.opacity) === 0 || el.closest("[aria-hidden='true'], [hidden], [inert]")) continue;
      const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
      const top = document.elementFromPoint(x, y);
      if (!top || el === top || el.contains(top) || top.contains(el)) continue;
      // A modal page or dialog covering the page on purpose (the sector page, the account panel) is not a blocker.
      const MODAL = '[role="dialog"], [aria-modal="true"], [aria-label="Scegli il settore"]';
      const modal = top.closest(MODAL);
      if (modal && !el.closest(MODAL)) continue;
      const name = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40);
      const tn = (top.getAttribute("aria-label") || top.textContent || "").trim().slice(0, 30);
      const navs = Array.from(document.querySelectorAll("nav.ps-nav"));
      const where = (n: Element) => { const nav = n.closest("nav.ps-nav"); return nav && navs.length > 1 ? ` [barra ${navs.indexOf(nav) + 1} di ${navs.length}]` : ""; };
      out.push({ control: `${el.tagName.toLowerCase()} «${name}»${where(el)}`, blocker: `${top.tagName.toLowerCase()}.${String(top.getAttribute("class") ?? "").split(" ").slice(0, 3).join(".")} «${tn}»${where(top)}` });
    }
    return out;
  });
}

/** Small controls: tap targets under 44 × 44 px (WCAG 2.5.5 / Apple HIG; Android asks 48 dp). */
export async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const sel = 'button, a[href], [role="button"], [role="tab"], [role="radio"], [role="switch"]';
    return Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= innerHeight) return false;
      if (getComputedStyle(el).display === "inline") return false;
      return r.width < 44 || r.height < 44;
    }).map((el) => { const r = el.getBoundingClientRect(); return `${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 32)} (${Math.round(r.width)}×${Math.round(r.height)})`; });
  });
}

/** Appends one finding to test-results/touch-<project>.jsonl (kept across worker restarts after a failure). */
export function record(kind: string, key: string, value: unknown) {
  const dir = path.resolve("test-results");
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `touch-${base.info().project.name}.jsonl`), JSON.stringify({ kind, key, test: base.info().title, value }) + "\n");
}

export function saveResults(project: string, extra: Record<string, unknown>) {
  const dir = path.resolve("test-results");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `touch-${project}.json`), JSON.stringify({ project, taps: RESULTS, ...extra }, null, 2));
}
