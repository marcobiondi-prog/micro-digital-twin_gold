import { expect, test, type Page } from "@playwright/test";

const views = [
  { tab: "Piazza", testId: "dashboard-urbana" },
  { tab: "Vigneto", testId: "dashboard-vitivinicola" },
] as const;

/**
 * A fresh document load always lands on Home, so the dashboard is opened
 * in-app like a visitor does. A click that lands before the page has hydrated
 * reloads the document instead, and that fresh dashboard load is sent back to
 * Home — so the visit is retried until the in-app navigation sticks.
 */
async function openView(page: Page, tab: string, testId: string) {
  const view = page.getByTestId(testId);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      if (!page.url().includes("/dashboard")) {
        await page.locator("[href='/dashboard']").locator("visible=true").first().click();
        await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 5_000 });
      }
      const splash = page.locator(".splash-screen");
      if (await splash.count()) await splash.evaluate((element) => element.remove());
      await page.getByRole("button", { name: tab, exact: true }).click({ timeout: 5_000 });
      await expect(view).toBeVisible({ timeout: 4_000 });
      return view;
    } catch {
      await page.waitForTimeout(400);
    }
  }
  await expect(view).toBeVisible();
  return view;
}

for (const item of views) {
  test(`${item.tab}: schede leggibili e senza overflow`, async ({ page }, testInfo) => {
    await page.goto("/");
    const view = await openView(page, item.tab, item.testId);

    // Charts and lazy panels settle asynchronously: first wait out the view's
    // loading state, then for the height to stop changing before measuring
    // or comparing screenshots.
    await view.getByText(/^Caricamento/).waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
    await page
      .waitForFunction(
        (id) => {
          const element = document.querySelector(`[data-testid='${id}']`);
          if (!element) return false;
          const height = element.getBoundingClientRect().height;
          const previous = (window as unknown as { __lastViewHeight?: number }).__lastViewHeight;
          (window as unknown as { __lastViewHeight?: number }).__lastViewHeight = height;
          return previous !== undefined && Math.abs(previous - height) < 1;
        },
        item.testId,
        { polling: 150, timeout: 10_000 },
      )
      .catch(() => {});

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cards: [...document.querySelectorAll<HTMLElement>("[data-testid^='dashboard-'] .card-soft")]
        .map((card) => card.scrollWidth - card.clientWidth),
    }));
    expect(overflow.document).toBeLessThanOrEqual(1);
    expect(Math.max(0, ...overflow.cards)).toBeLessThanOrEqual(1);

    const unreadable = await view.locator(".dashboard-view-title, .dashboard-card-title, .dashboard-long-label, .dashboard-chart-key span").evaluateAll((nodes) =>
      nodes.filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return rect.width < 20 || rect.height < 10 || Number.parseFloat(style.fontSize) < 10;
      }).length,
    );
    expect(unreadable).toBe(0);

    await expect(view).toHaveScreenshot(`${testInfo.project.name}-${item.tab.toLowerCase()}.png`);
  });
}
