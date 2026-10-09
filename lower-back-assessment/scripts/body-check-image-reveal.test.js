"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "body-check-ui.js"), "utf8");
const start = source.indexOf("function revealRenderedMuscleImage() {");
const end = source.indexOf("function renderMuscleFigure(", start);
assert(start >= 0 && end > start);

function classList(initial = []) {
  const values = new Set(initial);
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    toggle(value, force) { if (force) values.add(value); else values.delete(value); },
    contains(value) { return values.has(value); }
  };
}

function imageFixture({ complete, naturalWidth }) {
  const listeners = {};
  const retry = { addEventListener(type, callback) { listeners[`retry-${type}`] = callback; } };
  const visual = { classList: classList(["is-loading"]), querySelector() { return retry; } };
  const image = {
    complete, naturalWidth,
    src: "https://example.test/assets/body-guide/body-muscles-back-1536.png",
    classList: classList(),
    closest() { return visual; },
    addEventListener(type, callback) { listeners[type] = callback; }
  };
  const context = { $, URL, Date, location: { href: "https://example.test/body-check/?part=lowback" } };
  function $(selector) { return selector === "#muscleVisualFigure .result-muscle-image" ? image : null; }
  vm.runInNewContext(`${source.slice(start, end)}\nrevealRenderedMuscleImage();`, context);
  return { image, visual, listeners };
}

const cached = imageFixture({ complete: true, naturalWidth: 1024 });
assert(cached.image.classList.contains("is-ready"));
assert(!cached.visual.classList.contains("is-loading"));

const pending = imageFixture({ complete: false, naturalWidth: 0 });
assert(pending.visual.classList.contains("is-loading"));
pending.image.complete = true;
pending.image.naturalWidth = 1024;
pending.listeners.load();
assert(pending.image.classList.contains("is-ready"));

const failed = imageFixture({ complete: true, naturalWidth: 0 });
assert(failed.visual.classList.contains("is-error"));
failed.listeners["retry-click"]();
assert(failed.visual.classList.contains("is-loading"));
assert(!failed.visual.classList.contains("is-error"));
assert(failed.image.src.includes("retry="));
failed.image.complete = true;
failed.image.naturalWidth = 1024;
failed.listeners.load();
assert(failed.image.classList.contains("is-ready"));
assert(!failed.visual.classList.contains("is-loading"));

console.log("Result image reveal, failure and retry checks passed.");
