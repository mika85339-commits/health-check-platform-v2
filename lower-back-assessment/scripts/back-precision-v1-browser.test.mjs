import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
if (!process.env.HCL_PLAYWRIGHT_MODULE) throw new Error("Set HCL_PLAYWRIGHT_MODULE to a local playwright-core package");
const { chromium } = require(process.env.HCL_PLAYWRIGHT_MODULE);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = "http://127.0.0.1:14633";
const mime = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const errors = [];
const missing = [];

const browser = await chromium.launch({ executablePath: process.env.HCL_CHROME_PATH,
  headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 858 },
    permissions: ["clipboard-read", "clipboard-write"] });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
      return;
    }
    const relative = url.pathname === "/" ? "index.html"
      : url.pathname === "/body-check" || url.pathname === "/body-check/"
        ? "body-check/index.html" : decodeURIComponent(url.pathname.slice(1));
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(`${root}${path.sep}`) || !fs.existsSync(filename) || fs.statSync(filename).isDirectory()) {
      missing.push(url.pathname);
      await route.fulfill({ status: 404, contentType: "text/plain", body: "missing" });
      return;
    }
    await route.fulfill({ status: 200, contentType: mime[path.extname(filename)] || "application/octet-stream",
      body: fs.readFileSync(filename) });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const url = `${origin}/body-check?part=back`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByText("背中のどのあたりが気になりますか？").waitFor();
  assert.equal(await page.locator(".body-trace-steps > span").count(), 3);
  assert((await page.locator(".diagnosis-progress").innerText()).includes("質問 1 / 2"));
  assert(await page.locator("#bodyCheckRoot").innerText().then((text) => text.includes("背中の下側（肋骨がある範囲）")));
  assert(!(await page.locator("#bodyCheckRoot").innerText()).includes("左右を選んでください"));
  await page.locator('[data-choice="back_scapular_medial"]').click();
  await page.locator("#bodyNextBtn").click();
  await page.getByText("普段、どの動き・場面で気になりますか？").waitFor();
  await page.locator('[data-choice="shoulder_retract"]').click();
  await page.locator("#bodyNextBtn").click();
  await page.locator("#resultHeroTitle").waitFor();
  assert.equal(await page.locator("#resultHeroTitle").innerText(), "肩甲骨を内側へ寄せる筋群");
  assert.equal(await page.locator(".result-muscle-highlight").count(), 2);
  assert((await page.locator("#bodyCheckRoot").innerText()).includes("僧帽筋中部・菱形筋群"));
  const aiText = await page.locator("#aiHandoffText").textContent();
  assert(aiText.includes("複合表示単位を構成筋へ分解して順位付けせず"));
  await page.locator("#copyAiHandoffBtn").click();
  assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n"), aiText);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.equal(overflow, 0, `375px horizontal overflow: ${overflow}`);
  const screenshot = process.env.HCL_BROWSER_SCREENSHOT || path.join(os.tmpdir(), "hcl-back-precision-v1-375.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await page.locator("#bodyBackBtn").click();
  await page.getByText("普段、どの動き・場面で気になりますか？").waitFor();
  await page.locator("#bodyBackBtn").click();
  await page.getByText("背中のどのあたりが気になりますか？").waitFor();
  await page.locator('[data-choice="back_lateral_ribs"]').click();
  await page.locator("#bodyNextBtn").click();
  await page.locator('[data-choice="deep_breath"]').click();
  await page.locator("#bodyNextBtn").click();
  await page.locator("#resultHeroTitle").waitFor();
  const breathing = await page.locator("#bodyCheckRoot").innerText();
  assert(breathing.includes("肋間筋群"));
  assert(breathing.includes("動き・場面からの参考"));
  assert(breathing.includes("深呼吸で気になる症状は筋肉以外でも起こるため"));
  await page.locator('[data-muscle-candidate="1"]').click();
  assert.equal(await page.locator("#resultHeroTitle").innerText(), "肋間筋群");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByText("背中のどのあたりが気になりますか？").waitFor();
  await page.locator('[data-choice="location_unclear"]').click();
  await page.locator("#bodyNextBtn").click();
  await page.locator('[data-choice="movement_unclear"]').click();
  await page.locator("#bodyNextBtn").click();
  await page.locator("#resultMuscleStageTitle").waitFor();
  assert((await page.locator("#bodyCheckRoot").innerText()).includes("候補を十分に絞れません"));
  assert.equal(await page.locator("[data-muscle-candidate]").count(), 0);
  await page.goto(`${origin}/body-check?part=back&back_logic=legacy`, { waitUntil: "domcontentloaded" });
  await page.getByText("普段、どの動き・場面で気になりますか？").waitFor({ timeout: 5000 }).catch(() => {});
  assert(!(await page.locator("#bodyCheckRoot").innerText()).includes("背中のどのあたりが気になりますか？"));
  assert.deepEqual(errors, []);
  assert.deepEqual(missing.filter((item) => item.endsWith(".js") || item.endsWith(".css")), []);
  console.log(JSON.stringify({ normalUrl: url, viewport: "375x858", horizontalOverflow: overflow,
    twoQuestions: true, groupedHighlightCount: 2, backNavigation: true,
    breathingReference: true, candidateSwitch: true, unknownInsufficient: true,
    aiClipboardMatch: true,
    legacyComparison: true, consoleErrors: errors.length, scriptCss404: 0,
    screenshot }, null, 2));
} finally {
  await browser.close();
}
