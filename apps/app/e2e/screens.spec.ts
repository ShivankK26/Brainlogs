import { test, type Page } from "@playwright/test";

/** Not assertions: captures one screenshot per view into test-results/ so the port can be eyeballed. */
async function go(page: Page, keys: string) {
  await page.keyboard.press("g");
  await page.keyboard.press(keys);
  await page.waitForTimeout(400);
}

test("screens", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".item[data-page=memory] .cnt");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/pulse.png" });
  await go(page, "m");
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/memory.png" });
  await go(page, "c");
  await page.locator("#reviewBtn").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/commitments.png" });
  await go(page, "a");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/agents.png" });
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator("#pq").fill("vec0");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/palette.png" });
});
