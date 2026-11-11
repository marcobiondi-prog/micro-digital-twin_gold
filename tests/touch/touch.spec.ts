import { test, expect, fingerTap, fingerSwipe, sweepBlocked, smallTargets, saveResults, results, record } from "./touch-helpers";

/**
 * Touch suite on simulated phones: does a tap reach the control and does the app answer it, and fast?
 * Each tap is diagnosed (see touch-helpers): blocked by an overlay, lost before the page, not turned into a
 * click, cancelled by the app, or answered late because the app was busy.
 */
const sweeps: Record<string, Array<{ control: string; blocker: string }>> = {};
const small: Record<string, string[]> = {};
const dupes: Record<string, { navs: number; footers: number }> = {};
const loads: Record<string, { readyMs: number; longestTaskMs: number; blockingMs: number }> = {};

async function settle(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => !document.documentElement.classList.contains("preloading") && !document.getElementById("mdt-preloader"), null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function loadStats(page: import("@playwright/test").Page, key: string, t0: number) {
  const lt = await page.evaluate(() => (window as unknown as { __touch: { lt: Array<{ d: number }> } }).__touch.lt);
  loads[key] = { readyMs: Date.now() - t0, longestTaskMs: Math.round(Math.max(0, ...lt.map((l) => l.d))), blockingMs: Math.round(lt.reduce((s, l) => s + Math.max(0, l.d - 50), 0)) };
  record("loads", key, loads[key]);
}

test.describe("Selettori (senza profilo)", () => {
  test("ogni pulsante visibile riceve il dito", async ({ page }) => {
    const t0 = Date.now();
    await page.goto("/benvenuto");
    await expect(page.getByRole("radiogroup", { name: "Settore" })).toBeVisible({ timeout: 20_000 });
    await loadStats(page, "selettori", t0);
    await settle(page);
    sweeps.selettori = await sweepBlocked(page); record("sweeps", "selettori", sweeps.selettori);
    small.selettori = await smallTargets(page); record("small", "selettori", small.selettori);
    expect(sweeps.selettori, JSON.stringify(sweeps.selettori, null, 1)).toEqual([]);
  });

  test("un tocco su Settore urbano apre il modulo", async ({ page }, info) => {
    await page.goto("/benvenuto");
    await expect(page.getByRole("radiogroup", { name: "Settore" })).toBeVisible({ timeout: 20_000 });
    await settle(page);
    const card = page.getByRole("radio", { name: /Settore urbano/ }).or(page.getByRole("button", { name: /Settore urbano/ })).first();
    const d = await fingerTap(page, card, "Selettori", "Settore urbano", () => expect(page.getByRole("radiogroup", { name: "Settore" })).toBeHidden({ timeout: 5000 }), info);
    expect(d.ok, JSON.stringify(d)).toBe(true);
  });

  test("un tocco appena compare la pagina (primo tocco dopo l'apertura)", async ({ page }, info) => {
    await page.goto("/benvenuto");
    const guest = page.getByRole("button", { name: /Entra come ospite/ }).or(page.getByRole("link", { name: /Entra come ospite/ })).first();
    await expect(guest).toBeVisible({ timeout: 20_000 });
    const d = await fingerTap(page, guest, "Selettori", "Entra come ospite · subito", () => expect(page.getByRole("radiogroup", { name: "Settore" })).toBeHidden({ timeout: 3000 }), info);
    if (!d.ok) {
      const again = await fingerTap(page, guest, "Selettori", "Entra come ospite · secondo tocco", () => expect(page.getByRole("radiogroup", { name: "Settore" })).toBeHidden({ timeout: 5000 }), info);
      expect.soft(again.ok, "anche il secondo tocco è andato perso").toBe(true);
    }
    expect(d.ok, `primo tocco perso: ${JSON.stringify(d)}`).toBe(true);
  });
});

test.describe("Ospite", () => {
  test.use({ guest: true });

  test("Benvenuto: ogni pulsante visibile riceve il dito", async ({ page }) => {
    const t0 = Date.now();
    await page.goto("/benvenuto");
    await expect(page.getByRole("navigation", { name: "Menu principale" }).first()).toBeVisible({ timeout: 20_000 });
    await loadStats(page, "benvenuto", t0);
    await settle(page);
    sweeps.benvenuto = await sweepBlocked(page); record("sweeps", "benvenuto", sweeps.benvenuto);
    small.benvenuto = await smallTargets(page); record("small", "benvenuto", small.benvenuto);
    expect(sweeps.benvenuto, JSON.stringify(sweeps.benvenuto, null, 1)).toEqual([]);
  });

  test("barra in basso: Dashboard si apre al tocco", async ({ page }, info) => {
    await page.goto("/benvenuto");
    await settle(page);
    const link = page.getByRole("navigation", { name: "Menu principale" }).first().getByRole("link", { name: /^Dashboard/ });
    const d = await fingerTap(page, link, "Barra in basso", "Dashboard", () => expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 }), info);
    expect(d.ok, JSON.stringify(d)).toBe(true);
  });

  test("pulsante account: il pannello si apre al tocco", async ({ page }, info) => {
    await page.goto("/benvenuto");
    await settle(page);
    const btn = page.getByRole("button", { name: /^Apri account/ }).first();
    const d = await fingerTap(page, btn, "Intestazione", "Apri account", () => expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 5000 }), info);
    expect(d.ok, JSON.stringify(d)).toBe(true);
  });

  test("piazza: schede Mappa e Simula al tocco", async ({ page }, info) => {
    const t0 = Date.now();
    await page.goto("/urbano");
    const simula = page.getByRole("tab", { name: /Simula/ }).first();
    await expect(simula).toBeVisible({ timeout: 20_000 });
    await loadStats(page, "piazza", t0);
    await settle(page);
    sweeps.piazzaMappa = await sweepBlocked(page); record("sweeps", "piazzaMappa", sweeps.piazzaMappa);
    const d = await fingerTap(page, simula, "Piazza", "Scheda Simula", () => expect(simula).toHaveAttribute("aria-selected", "true", { timeout: 5000 }), info);
    expect(d.ok, JSON.stringify(d)).toBe(true);
    await page.waitForTimeout(600);
    sweeps.piazzaSimula = await sweepBlocked(page); record("sweeps", "piazzaSimula", sweeps.piazzaSimula);
    small.piazzaSimula = await smallTargets(page); record("small", "piazzaSimula", small.piazzaSimula);
    const mappa = page.getByRole("tab", { name: /Mappa/ }).first();
    const d2 = await fingerTap(page, mappa, "Piazza", "Scheda Mappa", () => expect(mappa).toHaveAttribute("aria-selected", "true", { timeout: 5000 }), info);
    expect(d2.ok, JSON.stringify(d2)).toBe(true);
  });

  test("piazza: 5 tocchi veloci su «Più alberi» contano tutti", async ({ page }, info) => {
    await page.goto("/urbano");
    const simula = page.getByRole("tab", { name: /Simula/ }).first();
    await expect(simula).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await fingerTap(page, simula, "Piazza", "Scheda Simula", () => expect(simula).toHaveAttribute("aria-selected", "true", { timeout: 5000 }), info);
    const group = page.getByRole("group", { name: "Alberi" }).first();
    const plus = group.getByRole("button", { name: "Più alberi" });
    await expect(plus).toBeVisible({ timeout: 10_000 });
    const read = async () => Number((await group.locator(".font-mono").first().textContent())?.replace(/\D/g, "") || 0);
    const start = await read();
    for (let i = 0; i < 5; i++) {
      const target = start + i + 1;
      await fingerTap(page, plus, "Piazza · leva", `Più alberi #${i + 1}`, async () => expect.poll(read, { timeout: 3000 }).toBeGreaterThanOrEqual(target), info);
    }
    expect(await read()).toBe(start + 5);
  });

  test("uno scorrimento che parte da un pulsante non lo preme, il tocco dopo sì", async ({ page }, info) => {
    await page.goto("/urbano");
    const simula = page.getByRole("tab", { name: /Simula/ }).first();
    await expect(simula).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await fingerTap(page, simula, "Piazza", "Scheda Simula", () => expect(simula).toHaveAttribute("aria-selected", "true", { timeout: 5000 }), info);
    const group = page.getByRole("group", { name: "Alberi" }).first();
    const plus = group.getByRole("button", { name: "Più alberi" });
    await plus.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const read = async () => Number((await group.locator(".font-mono").first().textContent())?.replace(/\D/g, "") || 0);
    const before = await read();
    const box = (await plus.boundingBox())!;
    await fingerSwipe(page, box.x + box.width / 2, box.y + box.height / 2, -160);
    await page.waitForTimeout(500);
    expect(await read(), "lo scorrimento ha premuto il pulsante").toBe(before);
    const d = await fingerTap(page, plus, "Piazza · leva", "Più alberi dopo uno scorrimento", () => expect.poll(read, { timeout: 3000 }).toBe(before + 1), info);
    expect(d.ok, JSON.stringify(d)).toBe(true);
  });

  test("una sola barra in basso e una sola nota a piè di pagina (nessuna copia morta)", async ({ page }) => {
    for (const url of ["/benvenuto", "/urbano", "/dashboard"]) {
      await page.goto(url);
      await expect(page.getByRole("navigation", { name: "Menu principale" }).first()).toBeAttached({ timeout: 20_000 });
      await settle(page);
      const n = await page.evaluate(() => ({ navs: document.querySelectorAll("nav.ps-nav").length, footers: Array.from(document.querySelectorAll("footer")).filter((f) => /indicativi/.test(f.textContent || "")).length }));
      dupes[url] = n; record("dupes", url, n);
      expect.soft(n.navs, `${url}: barre in basso`).toBe(1);
      expect.soft(n.footers, `${url}: note a piè di pagina`).toBe(1);
    }
  });

  test("dopo uno scorrimento la fotocamera della barra risponde al tocco", async ({ page }, info) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("navigation", { name: "Menu principale" }).first()).toBeVisible({ timeout: 20_000 });
    await settle(page);
    const vw = page.viewportSize()!;
    await fingerSwipe(page, vw.width / 2, vw.height * 0.75, -400);
    await page.waitForTimeout(1200);
    // The bar slides away while scrolling down; whatever bar shows at the bottom must still work.
    // The camera of the bar that shows at the bottom of the screen (the first in the page: with a single bar, the live one).
    const cam = page.locator("nav.ps-nav").first().getByRole("button", { name: /Fotocamera/ });
    const at = { x: vw.width / 2, y: vw.height - 60 };
    const under = await page.evaluate((p) => { const t = document.elementFromPoint(p.x, p.y); const navs = Array.from(document.querySelectorAll("nav.ps-nav")); const nav = t?.closest("nav.ps-nav"); return { navIndex: nav ? navs.indexOf(nav) : -1, navs: navs.length, label: t?.closest("button,a")?.getAttribute("aria-label") ?? null }; }, at);
    info.annotations.push({ type: "sotto-il-dito", description: JSON.stringify(under) });
    const d = await fingerTap(page, cam, "Barra in basso dopo uno scorrimento", "Fotocamera", () => expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 4000 }), info);
    d.note = `${d.note ?? ""} sotto il dito: barra ${under.navIndex + 1} di ${under.navs} («${under.label}»)`.trim();
    expect(d.ok, JSON.stringify(d)).toBe(true);
  });

  test("vigneto e dashboard: ogni pulsante visibile riceve il dito", async ({ page }) => {
    let t0 = Date.now();
    await page.goto("/vigneto");
    await expect(page.getByRole("tab", { name: /Simula/ }).first()).toBeVisible({ timeout: 20_000 });
    await loadStats(page, "vigneto", t0);
    await settle(page);
    sweeps.vigneto = await sweepBlocked(page); record("sweeps", "vigneto", sweeps.vigneto);
    t0 = Date.now();
    await page.goto("/dashboard");
    await expect(page.getByRole("navigation", { name: "Menu principale" }).first()).toBeVisible({ timeout: 20_000 });
    await loadStats(page, "dashboard", t0);
    await settle(page);
    sweeps.dashboard = await sweepBlocked(page); record("sweeps", "dashboard", sweeps.dashboard);
    small.dashboard = await smallTargets(page); record("small", "dashboard", small.dashboard);
    expect.soft(sweeps.vigneto, JSON.stringify(sweeps.vigneto, null, 1)).toEqual([]);
    expect(sweeps.dashboard, JSON.stringify(sweeps.dashboard, null, 1)).toEqual([]);
  });
});

test.afterAll(async ({}, info) => {
  saveResults(info.project.name, { sweeps, small, loads, dupes, count: results.length });
});
