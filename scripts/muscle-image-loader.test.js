const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { DEFAULT_RESULT_WAIT_MS, createLoader } = require("../muscle-image-loader.js");

let constructed = 0;
let decoded = 0;
const requested = [];

class FakeImage {
  constructor() {
    constructed += 1;
    this.complete = false;
    this.naturalWidth = 0;
    this.fetchPriority = "auto";
  }

  set src(value) {
    this._src = value;
    requested.push(value);
    setImmediate(() => {
      this.complete = true;
      if (value.includes("failure")) {
        this.naturalWidth = 0;
        this.onerror?.();
      } else {
        this.naturalWidth = 1024;
        this.onload?.();
      }
    });
  }

  get src() {
    return this._src;
  }

  async decode() {
    decoded += 1;
  }
}

(async () => {
  const metrics = [];
  const loader = createLoader({ ImageCtor: FakeImage, onMetric: (metric) => metrics.push(metric) });
  const front = "/assets/body-guide/body-muscles-front-face-1536.png";
  const back = "/assets/body-guide/body-muscles-back-1536.png";

  const firstPromise = loader.load(front, { priority: "high" });
  const cachedPromise = loader.load(front);
  assert.strictEqual(firstPromise, cachedPromise, "A cached muscle image must reuse the same preload promise.");
  const first = await firstPromise;
  assert(first.ok, "The first muscle image must complete loading and decode.");
  assert.strictEqual(constructed, 1, "A cached repeat must not construct another Image.");
  assert.strictEqual(decoded, 1, "The first image must decode before it is marked ready.");
  assert.strictEqual(loader.size(), 1);

  const plan = loader.loadInOrder([front, back, front]);
  assert.deepStrictEqual(plan.sources, [front, back], "Only result-related unique images should be preloaded.");
  await plan.background;
  assert.deepStrictEqual(requested, [front, back], "The first candidate must load before the remaining unique view.");
  assert.strictEqual(loader.size(), 2);

  const failed = await loader.load("/assets/body-guide/failure.png", { priority: "low" });
  assert.strictEqual(failed.ok, false, "An image error must resolve safely instead of blocking the result.");
  assert.strictEqual(failed.reason, "load_failed");

  const timeout = await loader.waitFor(new Promise(() => {}), 2);
  assert.strictEqual(timeout.reason, "timeout", "Result rendering must continue after the short preload budget.");
  assert.strictEqual(DEFAULT_RESULT_WAIT_MS, 180);
  assert(metrics.some((metric) => metric.source === front && metric.ok), "Local metrics must include a successful initial decode.");
  assert(metrics.some((metric) => metric.reason === "load_failed"), "Local metrics must expose a failed image without external reporting.");

  const root = path.resolve(__dirname, "..");
  const bodyCheck = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert(bodyCheck.includes("preloadResultMuscleImages(result)"), "The final answer must preload only its candidate image views.");
  assert(bodyCheck.includes('if (currentStepId() === "supplement") preloadPotentialResultImages()'), "The two shared result views must start preloading during the final question.");
  assert(bodyCheck.includes("await muscleImageLoader.waitFor(imagePlan.first"), "The initial result image must receive a bounded decode head start.");
  assert(bodyCheck.includes("await muscleImageLoader.load(muscleSource, { priority: \"high\" })"), "Candidate switching must wait for its image before replacement.");
  assert(bodyCheck.includes('loading="eager" fetchpriority="high" decoding="async"'), "The first-view muscle image must not be lazy loaded.");
  assert(bodyCheck.includes("revealRenderedMuscleImage()"), "Decoded images must be revealed explicitly.");
  assert(styles.includes(".muscle-image-placeholder"), "A lightweight placeholder must occupy the reserved image area.");
  assert(styles.includes("transition: opacity 140ms ease-out"), "The decoded image should use only a short fade.");
  assert(bodyCheck.includes('<div class="muscle-image-placeholder" aria-hidden="true"></div>'), "The reserved image placeholder must remain text-free.");
  assert(!bodyCheck.includes("人体を準備中"), "The result must not announce an internal image-loading state.");
  assert(!bodyCheck.includes("body-muscles-front-face-1536.png?"), "Muscle image URLs must remain cacheable without changing query parameters.");
  const sponsorPosition = index.indexOf("/sponsor-platform.js");
  const loaderPosition = index.indexOf("/muscle-image-loader.js");
  const bodyCheckPosition = index.indexOf("/body-check-ui.js");
  assert(sponsorPosition >= 0 && loaderPosition > sponsorPosition && bodyCheckPosition > loaderPosition, "Sponsor and image modules must both initialize before the result UI.");
  assert(index.includes('/styles.css?v=mobile-result-ui-2'), "The mobile result styles need a new cache key when their presentation changes.");
  assert(index.includes('/sponsor-platform.js?v=sponsor-phase1-ui-2'), "The sponsor card markup needs a new cache key when its presentation changes.");
  assert(index.includes('/body-check-ui.js?v=body-check-result-ui-2'), "The result UI needs a new cache key when its loading state changes.");

  console.log("Muscle image loader tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
