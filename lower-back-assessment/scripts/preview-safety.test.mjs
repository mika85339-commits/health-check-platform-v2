import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import safety from "./preview-safety.js";
import analyticsHarness from "./analytics-local-safety.test.js";
import sponsor from "../sponsor-platform.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { isSafePreview, previewEnvironment, prepareFunctions } = safety;
const fake = "FAKE_SECRET_FOR_PREVIEW_TEST_NOT_A_CREDENTIAL";
const poisoned = { ...process.env, SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: fake,
  GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: fake, OPENAI_API_KEY: fake, SANITY_READ_TOKEN: fake,
  WEEKLY_ANALYTICS_SESSION_SECRET: fake, NETLIFY_BUILD_HOOK_URL: "https://example.invalid/hook" };
const stripped = previewEnvironment(poisoned);
assert(!JSON.stringify(stripped).includes(fake));
assert.equal(isSafePreview({ CONTEXT: "production" }), false);
for (const CONTEXT of [undefined, "", "deploy-preview", "branch-deploy", "dev", "unknown"]) assert.equal(isSafePreview({ CONTEXT }), true);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hcl-function-test-"));
try {
  fs.mkdirSync(path.join(temp, "netlify"), { recursive: true });
  fs.cpSync(path.join(root, "netlify", "functions"), path.join(temp, "netlify", "functions"), { recursive: true });
  prepareFunctions(temp, false);
  for (const name of fs.readdirSync(path.join(temp, "netlify", "functions"))) {
    assert.deepEqual(fs.readFileSync(path.join(temp, "netlify", "safe-functions", name)), fs.readFileSync(path.join(root, "netlify", "functions", name)), "Production functions must remain byte-identical.");
  }
  prepareFunctions(temp, true); // must replace even previously cached production artifacts
  const previousFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = () => { externalCalls++; throw new Error("External access forbidden"); };
  const saved = {};
  for (const key of Object.keys(poisoned).filter(k => poisoned[k] === fake)) { saved[key] = process.env[key]; process.env[key] = fake; }
  try {
    for (const name of fs.readdirSync(path.join(temp, "netlify", "safe-functions"))) {
      const file = path.join(temp, "netlify", "safe-functions", name);
      const source = fs.readFileSync(file, "utf8");
      assert(!/\bimport\b|process\.env|fetch\(|getStore\(|\bschedule\s*:/.test(source));
      const module = await import(pathToFileURL(file));
      // Independent runtime rejection even if CONTEXT is absent or mistakenly production.
      const before = process.env.CONTEXT;
      for (const context of [undefined, "deploy-preview", "branch-deploy", "production"]) {
        if (context === undefined) delete process.env.CONTEXT; else process.env.CONTEXT = context;
        for (const method of ["GET", "POST", "PUT", "DELETE", "OPTIONS"]) {
          const response = await module.default(new Request("https://preview.invalid/.netlify/functions/" + name, { method }));
          assert.equal(response.status, 403);
          assert.equal(response.headers.get("Cache-Control"), "no-store");
          const data = await response.text();
          assert(!data.includes(fake));
          assert.equal(JSON.parse(data).stored, false);
        }
      }
      if (before === undefined) delete process.env.CONTEXT; else process.env.CONTEXT = before;
      if (/weekly-analytics-(admin|login|data|report|security|setup|logout)/.test(name)) assert(module.config?.path, "Admin aliases must also be protected.");
    }
    assert.equal(externalCalls, 0, "DB, paid API, webhook and Google calls must all be zero.");
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of Object.keys(saved)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
} finally { fs.rmSync(temp, { recursive: true, force: true }); }

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}

const netlifyConfig = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
assert(netlifyConfig.includes('directory = "netlify/safe-functions"'));
assert(!netlifyConfig.includes("[[headers]]"), "Global TOML headers must not conflict with per-deploy _headers.");
for (const context of ["deploy-preview", "branch-deploy"]) {
  assert(netlifyConfig.includes(`[context.${context}]\n  command = "node scripts/netlify-safe-build.js --preview"`));
}
for (const context of ["deploy-preview", "branch-deploy", "unknown", undefined, "production"]) {
  const env = { ...poisoned };
  if (context === undefined) delete env.CONTEXT; else env.CONTEXT = context;
  // Context-specific commands must remain safe even with conflicting inherited variables.
  const args = [path.join(root, "scripts", "netlify-safe-build.js"), ...(context === "production" ? ["--preview"] : [])];
  const result = spawnSync(process.execPath, args, {
    cwd: root, env, encoding: "utf8"
  });
  assert.equal(result.status, 0, "Offline preview build failed: " + result.stderr);
  assert(!`${result.stdout}${result.stderr}`.includes(fake));
  const dist = path.join(root, "dist");
  const headers = fs.readFileSync(path.join(dist, "_headers"), "utf8");
  assert(headers.includes("X-Robots-Tag: noindex, nofollow, noarchive"));
  assert(headers.includes("connect-src 'self'"));
  assert(headers.includes("frame-src 'none'"));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dist, "site-config.json"))).gaMeasurementId, null);
  assert(fs.readFileSync(path.join(dist, "robots.txt"), "utf8").includes("Allow: /"), "Let crawlers see noindex rather than blocking its discovery.");
  const bootstrap = fs.readFileSync(path.join(dist, "analytics-bootstrap.js"), "utf8");
  const browser = { window: {} };
  vm.runInNewContext(bootstrap, browser); // no document, gtag or fetch may be accessed
  assert.equal(browser.window.__HCL_LOCAL_PREVIEW__, true);
  assert.equal(browser.window.gtag, undefined);
  for (const hostname of ["deploy-preview-42--health-check-platform-v2.netlify.app", "seo--health-check-platform-v2.netlify.app"]) {
    const runtime = analyticsHarness.analyticsContext("/body-check");
    Object.assign(runtime.context.location, { hostname, origin: `https://${hostname}`, href: `https://${hostname}/body-check/` });
    vm.runInNewContext(bootstrap, runtime.context);
    (runtime.documentListeners.get("DOMContentLoaded") || []).forEach(callback => callback());
    runtime.flush();
    runtime.context.document.querySelector = selector => selector === ".result-panel" ? {} : null;
    runtime.observerCallbacks.forEach(callback => callback());
    analyticsHarness.dispatchDiagnosisEvent(runtime, "diagnosis_save_complete");
    runtime.context.location.pathname = "/health-library/example/";
    analyticsHarness.clickLink(runtime, `https://${hostname}/body-check/?part=shoulder&from=article-diagnosis`);
    assert.equal(runtime.getFetchCount(), 0);
    assert.equal(runtime.getBeaconCount(), 0);
    assert.equal(runtime.context.window.dataLayer, undefined);
    for (const event of ["muscle_check_start", "muscle_check_complete", "article_to_diagnosis"]) {
      assert(runtime.context.window.__HCL_LOCAL_EVENTS__.some(item => item.event === event), `${event} must work locally on preview hosts.`);
    }
    let adCalls = 0;
    const adRuntime = { __HCL_LOCAL_PREVIEW__: true, location: { hostname }, fetch() { adCalls++; }, navigator: { sendBeacon() { adCalls++; } } };
    await sponsor.sendEvent({ event_type: "sponsor_banner_impression" }, adRuntime);
    await sponsor.sendEvent({ event_type: "sponsor_banner_click" }, adRuntime);
    assert.equal(adCalls, 0);
  }
  for (const file of files(dist).filter(f => /\.(js|json|html|txt|xml)$/.test(f))) {
    const text = fs.readFileSync(file, "utf8");
    assert(!text.includes(fake));
    assert(!/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(text));
    if (file.endsWith(".html")) {
      assert(/name="robots" content="noindex,nofollow,noarchive"/.test(text));
      assert(!/<script[^>]+src=["']https?:\/\/[^"']*(?:googletagmanager|google-analytics|googleadservices)/i.test(text));
    }
  }
  for (const name of ["app.js", "body-check-ui.js", "body-platform.js", "precision-persistence.js", "sponsor-platform.js"]) {
    assert.equal(fs.readFileSync(path.join(dist, name), "utf8"), fs.readFileSync(path.join(root, name), "utf8"), "Preview must preserve diagnosis source.");
  }
}
console.log("Preview safety passed: all endpoints denied, zero external calls, poisoned credentials excluded, production functions preserved; deploy-preview/branch-deploy/unknown builds isolated.");
