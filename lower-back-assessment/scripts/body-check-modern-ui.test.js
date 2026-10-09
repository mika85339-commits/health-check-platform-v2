"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const platform = require("../body-platform.js");
const persistence = require("../precision-persistence.js");

const root = path.resolve(__dirname, "..");
const parts = ["neck", "shoulder", "elbow", "wrist", "back", "lowback", "hip",
  "buttock", "thigh", "knee", "lowerleg", "ankle", "sole"];
const expected = {
  neck: "3e7569920891ad43371db24c2f37c692c7e8b125b1eb3bcf3a4e95c3f171bf77",
  shoulder: "52c73b24edea7e1d88853af51b8f6f7aaaf8c475f335cfb103ef68a3f77af128",
  elbow: "8f1c83fb47c66579a01450831a9b818162b96322ba43315be204de3f137128aa",
  wrist: "47b69d1cdc72cc1f03b5996d645d2d28a480c27e12625a5c5dfe351d6ba6907d",
  back: "c564193f6739d6942f0fab3850b611ce60ecca7f28fe3c700b4c23f41a6c8ddd",
  lowback: "0705ced35b03a729d249e5884818d568c1dcbbdd116e14820a2d526310052cde",
  hip: "9214b1031b9ecce75bbcf910bb7e3fdacd1a1c900c9e4d0b47ea1b84785a2071",
  buttock: "4a58a4558eada8989930d113ece304ddfcaeaf251d8cfd25afeb82e33125ac7e",
  thigh: "5dd5ce873fcd8356ddaa99a863bf02e6e0b5a8b2ca191cefa9374e325b5c8458",
  knee: "96d279298c249fecbd7c4a33b2191bec41e83a7cdcb2822e0e42767836e93674",
  lowerleg: "bba10738244b66ef2deacc23d3d44e9261ef72c5aa2adf2ea69bc95d82d67989",
  ankle: "b15a62cd856560e19189f5096c32658d43c910e401d522d80c3c0d5b1a76606c",
  sole: "a58db2578fce333464b0f155585cc02a24fa9bea86a22ff02fa929ac49e695a1"
};
const scriptPaths = [...fs.readFileSync(path.join(root, "index.html"), "utf8")
  .matchAll(/<script src="\/([^"?]+-candidate-precision[^"?]*\.js)\?[^\"]+" defer><\/script>/g)]
  .map((match) => match[1]);
const uiSource = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8").replace(
  "return { init, localRecords, getPartMeta };",
  "return { init, localRecords, getPartMeta, __setState(values) { Object.assign(state, values); }, __locations: painLocationOptionsForPart, __movements: situationOptionsForPart, __calculate: calculate, __normalize: normalizedRecord, __steps: currentSteps };"
);

function snapshot(part, hostname = "health-check-platform-v2.netlify.app") {
  const node = { innerHTML: "" };
  const storage = { getItem() { return null; }, setItem() {} };
  const location = { hostname, origin: `http://${hostname}`, search: `?part=${part}` };
  const window = { location, localStorage: storage, setTimeout() {}, scrollTo() {},
    HealthCheckBodyPlatform: { ...platform, createId: () => "diagnosis-test",
      anonymousDeviceId: () => "device-test", anonymousSessionId: () => "session-test" },
    HealthCheckPrecisionPersistence: persistence };
  const context = { window, location, localStorage: storage, sessionStorage: storage,
    document: { dispatchEvent() {} }, CustomEvent: function CustomEvent() {},
    URLSearchParams, URL, Date, Math, Intl, console };
  for (const file of scriptPaths) {
    vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  vm.runInNewContext(uiSource, context, { filename: "body-check-ui.js" });
  const instance = window.createBodyCheck({ $: (selector) => selector === "#bodyCheckRoot" ? node : null,
    $$: () => [], STORAGE_KEY: "test-modern-ui", copyText() {} });
  instance.init();
  const locationId = instance.__locations(part).find(([id]) => id !== "location_unclear")[0];
  const movementId = instance.__movements(part).find(([id]) => id !== "movement_unclear")[0];
  instance.__setState({ painLocation: locationId, side: "right", situations: [movementId],
    symptoms: [], timing: "", spread: "", adaptiveQuestion: null, adaptiveAnswer: "" });
  const result = instance.__calculate();
  const record = instance.__normalize(result);
  const projection = JSON.parse(JSON.stringify({
    status: result.candidateStatus,
    reason: result.candidateStatusReason,
    diagnosisVersion: result.diagnosisVersion,
    topCandidates: result.topMuscles?.map(({ name, muscleId, displayGroup, rank }) =>
      ({ name, muscleId, displayGroup, rank })),
    precisionData: result.precisionData,
    recordPrecisionData: record.precisionData,
    recordVersion: record.diagnosisVersion,
    recordScore: record.symptomScore
  }));
  return { part, locationId, movementId, steps: [...instance.__steps()],
    status: projection.status, reason: projection.reason, version: projection.diagnosisVersion,
    digest: crypto.createHash("sha256").update(JSON.stringify(projection)).digest("hex") };
}

const actual = parts.map(snapshot);
if (process.argv.includes("--snapshot")) {
  console.log(JSON.stringify(actual, null, 2));
} else {
  assert.equal(actual.length, 13);
  for (const item of actual) {
    assert.equal(item.digest, expected[item.part], `${item.part} result/DTO changed`);
    const local = snapshot(item.part, "127.0.0.1");
    assert.deepEqual(local, item, `${item.part} local normal URL differs from production precision`);
  }
  console.log("13 fixed precision results and DTOs are unchanged by the modern question UI.");
}
