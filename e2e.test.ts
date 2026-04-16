/**
 * E2E test: loads the app in a real browser, uploads a ROM,
 * toggles effect buttons, and checks for freezes + errors.
 */
import { chromium } from "playwright";
import { resolve } from "node:path";

const ROM_PATH = resolve(import.meta.dirname!, "src/rom/test-rom.smc");
const APP_URL = "http://localhost:5199";
const TIMEOUT = 5000;

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`CONSOLE ERROR: ${msg.text()}`);
  });

  console.log("1. Loading page...");
  await page.goto(APP_URL, { timeout: TIMEOUT });
  await page.waitForSelector(".upload-box", { timeout: TIMEOUT });
  console.log("   OK - upload screen visible");

  console.log("2. Uploading ROM...");
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(ROM_PATH);
  await page.waitForSelector(".rom-info", { timeout: TIMEOUT });
  console.log("   OK - ROM loaded, editor visible");

  console.log("3. Toggling effect buttons (should be instant)...");
  const effectBtns = page.locator(".effect-btn");
  const effectCount = await effectBtns.count();
  console.log(`   Found ${effectCount} effect buttons`);

  for (let i = 0; i < Math.min(effectCount, 8); i++) {
    const btn = effectBtns.nth(i);
    const name = await btn.textContent();

    // Toggle ON
    let start = performance.now();
    await btn.click();
    await page.waitForTimeout(50);
    let elapsed = performance.now() - start;

    const isActive = await btn.evaluate(el => el.classList.contains("active"));
    console.log(`   "${name?.trim()}" ON: ${elapsed.toFixed(0)}ms, active=${isActive}`);
    if (elapsed > 500) errors.push(`SLOW: "${name?.trim()}" toggle ON took ${elapsed.toFixed(0)}ms`);
    if (!isActive) errors.push(`"${name?.trim()}" should be active after click`);

    // Toggle OFF
    start = performance.now();
    await btn.click();
    await page.waitForTimeout(50);
    elapsed = performance.now() - start;

    const isInactive = !(await btn.evaluate(el => el.classList.contains("active")));
    console.log(`   "${name?.trim()}" OFF: ${elapsed.toFixed(0)}ms, inactive=${isInactive}`);
    if (elapsed > 500) errors.push(`SLOW: "${name?.trim()}" toggle OFF took ${elapsed.toFixed(0)}ms`);
    if (!isInactive) errors.push(`"${name?.trim()}" should be inactive after second click`);
  }

  console.log("4. Enabling multiple effects...");
  // Turn on first 3 effects
  for (let i = 0; i < 3; i++) {
    await effectBtns.nth(i).click();
  }
  await page.waitForTimeout(100);

  // Check effect count badge
  const countBadge = page.locator(".effect-count");
  const badgeText = await countBadge.textContent();
  console.log(`   Active effects badge: "${badgeText?.trim()}"`);

  console.log("5. Checking download button...");
  const downloadBtn = page.locator(".btn-primary", { hasText: "Download Patched ROM" });
  const isVisible = await downloadBtn.isVisible();
  const isEnabled = await downloadBtn.isEnabled();
  console.log(`   Download button visible: ${isVisible}, enabled: ${isEnabled}`);
  if (!isVisible) errors.push("Download button not visible!");
  if (!isEnabled) errors.push("Download button should be enabled with active effects!");

  // Check it's above fold
  const bbox = await downloadBtn.boundingBox();
  const viewport = page.viewportSize()!;
  if (bbox && bbox.y + bbox.height > viewport.height) {
    errors.push(`Download button below fold at y=${bbox.y.toFixed(0)}`);
  }

  console.log("6. Checking reset...");
  const resetBtn = page.locator(".btn-secondary", { hasText: "Reset" });
  await resetBtn.click();
  await page.waitForTimeout(100);
  const activeAfterReset = await page.locator(".effect-btn.active").count();
  console.log(`   Active effects after reset: ${activeAfterReset}`);
  if (activeAfterReset > 0) errors.push("Reset should clear all active effects");

  // Download should be disabled after reset
  const disabledAfterReset = !(await downloadBtn.isEnabled());
  console.log(`   Download disabled after reset: ${disabledAfterReset}`);

  console.log("7. Checking no emoji in effect buttons...");
  const allBtnTexts = await effectBtns.allTextContents();
  const hasEmoji = allBtnTexts.some(t => /[\u{1F300}-\u{1FAD6}]/u.test(t));
  if (hasEmoji) errors.push("Effect buttons still contain emoji!");
  console.log(`   No emoji: ${!hasEmoji}`);

  console.log("8. Category pills...");
  const pills = page.locator(".pill");
  const pillCount = await pills.count();
  for (let i = 0; i < pillCount; i++) {
    const pill = pills.nth(i);
    const name = await pill.textContent();
    const start = performance.now();
    await pill.click();
    await page.waitForTimeout(50);
    const elapsed = performance.now() - start;
    console.log(`   Pill "${name?.trim()}" - ${elapsed.toFixed(0)}ms`);
    if (elapsed > 500) errors.push(`SLOW: pill "${name?.trim()}" took ${elapsed.toFixed(0)}ms`);
  }

  console.log("\n=== RESULTS ===");
  if (errors.length > 0) {
    console.log("FAILURES:");
    for (const e of errors) console.log(`  - ${e}`);
    process.exitCode = 1;
  } else {
    console.log("ALL PASSED!");
  }

  await browser.close();
}

run().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
