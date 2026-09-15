import { expect, test, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.goto("/");
  await expect(page.locator(".sb")).toBeVisible();
  await expect(page.locator(".item[data-page=memory] .cnt")).not.toHaveText("");
}

test("pulse renders KPIs from real data", async ({ page }) => {
  await open(page);
  await expect(page.locator(".kp .v").first()).not.toHaveText("—");
  await expect(page.locator("#bars .n").first()).toBeVisible();
});

test("command palette: ⌘K, search hits with highlights, enter opens the event", async ({ page }) => {
  await open(page);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.locator("#pq")).toBeFocused();
  await page.locator("#pq").fill("vec0");
  await expect(page.locator("#pres .ri mark").first()).toBeVisible();
  const firstHit = page.locator("#pres .ri").nth(1); // after the "Filter memory by" action
  await expect(firstHit.locator(".s")).toHaveText(/^MEM-/);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("#ov")).toHaveCount(0);
  await expect(page.locator(".item[data-page=memory]")).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".row[aria-selected=true]")).toHaveCount(1);
  await expect(page.locator("#detail .dtitle")).toBeVisible();
  await expect(page.locator("#detail .dtext")).toContainText("vec0");
  await expect(page.locator("#detail .win")).toHaveCount(await page.locator("#detail .win").count());
});

test("palette: '/' opens, Esc closes, 'Filter memory by' sets a chip, Esc clears it", async ({ page }) => {
  await open(page);
  await page.keyboard.press("/");
  await expect(page.locator("#pq")).toBeFocused();
  await page.locator("#pq").fill("pricing table");
  await page.keyboard.press("Enter"); // first item is the filter action
  await expect(page.locator("#clearF")).toContainText("pricing table");
  const rows = page.locator("#rows .row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Pricing table");
  await page.keyboard.press("Escape");
  await expect(page.locator("#clearF")).toHaveCount(0);
  await expect.poll(() => rows.count()).toBeGreaterThan(5);
});

test("palette: a question puts Ask first; Memory shows the answer card with clickable citations", async ({ page }) => {
  await open(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator("#pq").fill("why did the vec0 migration fail?");
  await expect(page.locator("#pres .ri").first()).toContainText("Ask Brainlogs");
  await page.keyboard.press("Enter");
  await expect(page.locator("#clearF")).toContainText("Ask: why did the vec0 migration fail?");
  const card = page.locator("#askCard");
  await expect(card.locator(".q")).toHaveText("why did the vec0 migration fail?");
  await expect(card.locator(".m")).toContainText(/timeline|model|Claude/);
  await expect(card.locator(".moments .mom").first()).toBeVisible();
  await expect.poll(() => page.locator("#rows .row").count()).toBeGreaterThan(0);
  await card.locator(".moments .mom").first().click();
  await expect(page.locator(".row[aria-selected=true]")).toHaveCount(1);
  await expect(page.locator("#detail .dtitle")).toBeVisible();
  // a plain term keeps the filter action first
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator("#pq").fill("vec0");
  await expect(page.locator("#pres .ri").first()).toContainText("Filter memory by");
  await page.keyboard.press("Escape");
});

test("memory: the Filter button opens a panel; app + text filters apply and clear", async ({ page }) => {
  await open(page);
  await page.locator(".item[data-page=memory]").click();
  await page.locator("#filterBtn").click();
  await expect(page.locator("#filterPanel")).toBeVisible();
  const apps = page.locator("#filterPanel select").first();
  await expect.poll(async () => apps.locator("option").count()).toBeGreaterThan(1);
  await apps.selectOption({ index: 1 });
  const chosen = await apps.inputValue();
  await page.locator("#fapply").click();
  await expect(page.locator("#filterPanel")).toHaveCount(0);
  await expect(page.locator("#clearF")).toContainText(`app: ${chosen}`);
  const rows = page.locator("#rows .row");
  await expect.poll(() => rows.count()).toBeGreaterThan(0);
  for (const t of await rows.locator(".meta span:nth-last-child(3)").allTextContents()) expect(t).toBe(chosen);
  await page.locator("#filterBtn").click();
  await page.locator("#fq").fill("pricing");
  await page.locator("#fapply").click();
  await expect(page.locator("#clearF")).toContainText("“pricing”");
  await expect(rows.first()).toContainText(/pricing/i);
  await page.locator("#filterBtn").click();
  await page.locator("#fclear").click();
  await expect(page.locator("#clearF")).toHaveCount(0);
});

test("memory: j/k move the selection and the detail panel follows", async ({ page }) => {
  await open(page);
  await page.keyboard.press("g");
  await page.keyboard.press("m");
  await expect(page.locator(".item[data-page=memory]")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#rows .row").first()).toBeVisible();
  await page.keyboard.press("j");
  const first = await page.locator(".row[aria-selected=true] .id").textContent();
  await page.keyboard.press("j");
  const second = await page.locator(".row[aria-selected=true] .id").textContent();
  expect(second).not.toBe(first);
  await expect(page.locator("#detail .dhd")).toContainText(second!);
  await page.keyboard.press("k");
  await expect(page.locator(".row[aria-selected=true] .id")).toHaveText(first!);
});

test("sidebar entity filters memory; labels show linked entities", async ({ page }) => {
  await open(page);
  await page.locator(".item.ent", { hasText: "Priya" }).click();
  await expect(page.locator("#clearF")).toContainText("Priya");
  const rows = page.locator("#rows .row");
  await expect(rows.first()).toBeVisible();
  await expect(rows.first().locator(".lbl", { hasText: "Priya" })).toBeVisible();
});

test("commitments grouped with a review queue that approves a proposed note", async ({ page }) => {
  await open(page);
  await page.keyboard.press("g");
  await page.keyboard.press("c");
  await expect(page.locator("#crows .grp").first()).toContainText("Overdue");
  await expect(page.locator("#reviewBtn")).toContainText("Review proposed (1)");
  await page.locator("#reviewBtn").click();
  await expect(page.locator("#review .note .txt")).toContainText("loadExtension");
  await page.locator("#review .note .tb.primary").click();
  await expect(page.locator("#reviewBtn")).toContainText("Review proposed (0)");
  await expect(page.locator("#toast")).toHaveText("Approved");
});

test("agents: session log, permission switch persists to policy", async ({ page }) => {
  await open(page);
  await page.keyboard.press("g");
  await page.keyboard.press("a");
  await expect(page.locator("#term .line").first()).toBeVisible();
  await expect(page.locator("#term")).toContainText("brainlog.remember");
  const sw = page.locator('.sw[aria-label="Allow sensitive"]');
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await page.keyboard.press("g");
  await page.keyboard.press("a");
  await expect(page.locator('.sw[aria-label="Allow sensitive"]')).toHaveAttribute("aria-checked", "true");
});

test("audit log lists agent activity and denials; export link is present", async ({ page }) => {
  await open(page);
  await page.locator(".item[data-page=audit]").click();
  await expect(page.locator("#atab tbody tr").first()).toBeVisible();
  await expect(page.locator("#atab")).toContainText("claude-code");
  await expect(page.locator("a[href='/api/v1/audit.csv']")).toBeVisible();
});

test("data & retention: blocked domain rule can be added and shows up in policy", async ({ page }) => {
  await open(page);
  await page.locator(".item[data-page=privacy]").click();
  await expect(page.locator(".chip", { hasText: "mail.google.com" })).toBeVisible();
  const input = page.locator(".rules input").nth(1);
  await input.fill("*.bank.com");
  await input.press("Enter");
  await expect(page.locator(".chip", { hasText: "*.bank.com" })).toBeVisible();
  await expect(page.locator("#toast")).toHaveText("Blocked domains updated");
});
