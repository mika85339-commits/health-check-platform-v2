import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHandler, sanitizeRecord } from "../netlify/functions/save-diagnosis-record.mjs";

const require = createRequire(import.meta.url);
const platform = require("../body-platform.js");
const precision = require("../lowback-candidate-precision-v1.js");
const persistence = require("../precision-persistence.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8").replace(
  "return { init, localRecords, getPartMeta };",
  "return { init, localRecords, getPartMeta, __setState(values) { Object.assign(state, values); }, __calculate: calculate, __normalize: normalizedRecord, __aiText: aiHandoffText, __steps: currentSteps, __result: renderResult, __submit: submitSupabase };"
);
const design = JSON.parse(fs.readFileSync(path.join(root, "docs/audits/lower-back-precision-v1-final-policy-design-2026-09-30.json"), "utf8"));

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)) };
}

function createUi(search, hostname = "127.0.0.1") {
  const node = { innerHTML: "" };
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  const location = { hostname, origin: `http://${hostname}:14429`, search };
  const window = {
    location, localStorage, setTimeout() {}, scrollTo() {},
    HealthCheckBodyPlatform: {
      ...platform,
      createId: () => "diagnosis-mock",
      anonymousDeviceId: () => "device-mock",
      anonymousSessionId: () => "session-mock",
      referralSource: () => "direct"
    },
    HealthCheckLowbackPrecisionV1: precision,
    HealthCheckPrecisionPersistence: persistence
  };
  const context = { window, location, localStorage, sessionStorage, document: { dispatchEvent() {} },
    CustomEvent: function CustomEvent() {}, URLSearchParams, URL, Date, Math, Intl, console };
  vm.runInNewContext(source, context, { filename: "body-check-ui.js" });
  const instance = window.createBodyCheck({ $: (selector) => selector === "#bodyCheckRoot" ? node : null,
    $$: () => [], STORAGE_KEY: "mock-records", copyText() {} });
  instance.init();
  return { instance, window };
}

function payloadFor(ui, name, input, symptoms = ["heavy"], spread = "local", timing = "") {
  ui.instance.__setState({ selectedParts: ["lowback"], primaryPart: "lowback", painLocation: input.location,
    side: input.side, situations: [...input.movements], symptoms, spread, timing });
  const result = ui.instance.__calculate();
  result.diagnosisId = `diagnosis-${name}`;
  result.savedAt = "2026-09-30T00:00:00.000Z";
  const record = ui.instance.__normalize(result);
  const request = { mode: "auto", record };
  return { result, request, stored: sanitizeRecord(JSON.parse(JSON.stringify(request)).record) };
}

const legacyUi = createUi("?part=lowback&lowback_logic=legacy");
const precisionUi = createUi("?part=lowback&lowback_logic=precision-v1");
const productionUi = createUi("?part=lowback", "health-check-platform-v2.netlify.app");
assert.deepEqual(Array.from(legacyUi.instance.__steps()), ["situations", "symptoms", "result"]);
assert.deepEqual(Array.from(productionUi.instance.__steps()),
  ["precision_location", "precision_side", "situations", "result"]);
assert.deepEqual(Array.from(precisionUi.instance.__steps()),
  ["precision_location", "precision_side", "situations", "result"]);

const legacy = payloadFor(legacyUi, "legacy", {
  location: "lowback_center", side: "right", movements: ["extend_back"]
}, ["heavy"], "local", "start");
assert.equal(legacy.result.candidateStatus, "legacy");
assert(legacy.request.record.symptomScore > 0);
assert.equal(legacy.stored.diagnosis_version, legacy.result.diagnosisVersion);
assert.equal(legacy.stored.symptom_score, legacy.request.record.symptomScore);

const cases = [
  { id: "A", reason: "ranked_unique_main", input: { location: "lowback_center", side: "right", movements: ["extend_back", "side_bend_right"] } },
  { id: "B/P09", reason: "main_tie", input: { location: "lowback_center", side: "right", movements: ["extend_back"] } },
  { id: "C/P01", reason: "cross_group_equal", input: { location: "lowback_side", side: "right", movements: ["side_bend_right"] } },
  { id: "D/P14", reason: "cross_group_incomparable", input: { location: "lowback_side", side: "right", movements: ["rotate_right", "side_bend_right", "extend_back"] } },
  { id: "E", reason: "cross_group_additional_dominates", input: { location: "lowback_center", side: "right", movements: ["side_bend_right", "rotate_right"] } },
  { id: "F/P05", reason: "no_main_evidence", input: { location: "lowback_side", side: "right", movements: ["rotate_right"] } },
  { id: "G", reason: "location_unclear", input: { location: "location_unclear", side: "right", movements: ["extend_back"] } },
  { id: "H/P11", reason: "movement_unclear", input: { location: "location_unclear", side: "both", movements: ["movement_unclear"] } },
  { id: "I/P12", reason: "stretch_only_reference", input: { location: "lowback_center", side: "center", movements: ["bend_forward"] } },
  { id: "J", reason: "ranked_unique_main", input: { location: "lowback_center", side: "right", movements: ["extend_back", "side_bend_right"] }, expectedCandidates: 4 },
  { id: "K", reason: "main_tie", input: { location: "lowback_center", side: "right", movements: ["extend_back"] }, symptoms: ["numbness"] },
  { id: "L", reason: "main_tie", input: { location: "lowback_center", side: "right", movements: ["extend_back"] }, symptoms: ["weakness"], spread: "limb" }
];

const benchmarkInputs = new Map(design.benchmark.map((item) => [item.id, item.input]));
const includedBenchmarks = ["P01", "P05", "P09", "P11", "P12", "P14"];
for (const id of includedBenchmarks) {
  const chosen = cases.find((item) => item.id.endsWith(`/${id}`));
  assert.deepEqual(chosen.input, benchmarkInputs.get(`LBK-${id}`), `${id} exact benchmark`);
}

const calls = [];
let forbiddenNetwork = 0;
const originalFetch = global.fetch;
global.fetch = async () => { forbiddenNetwork += 1; throw new Error("Real network prohibited in persistence audit"); };
const fakeFetch = async (url, options) => {
  assert.match(url, /^https:\/\/mock-db\.invalid\/rest\/v1\/anonymous_diagnosis_records\?on_conflict=diagnosis_id$/);
  assert.equal(options.method, "POST");
  calls.push({ url, options });
  return { ok: true, status: 201, text: async () => "" };
};
const fakeStore = { async delete() {} };
const handler = createHandler({ fetchImpl: fakeFetch, getStoreImpl: () => fakeStore,
  env: { SUPABASE_URL: "https://mock-db.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-only",
    PRECISION_PERSISTENCE_ENABLED: "true" } });
const results = [];
const casePayloads = [];
try {
  for (const entry of cases) {
    const { result, request, stored } = payloadFor(precisionUi, entry.id.replace("/", "-"), entry.input,
      entry.symptoms || ["heavy"], entry.spread || "local");
    const fixed = precision.rank(entry.input);
    assert.equal(result.candidateStatus, fixed.status, entry.id);
    assert.equal(result.candidateStatusReason, entry.reason, entry.id);
    if (entry.expectedCandidates) assert.equal(result.topMuscles.length, entry.expectedCandidates);
    assert.equal(request.record.symptomScore, null, `${entry.id}: no invented score`);
    assert.equal(stored.symptom_score, null, `${entry.id}: no stored score`);
    assert.equal(request.record.diagnosisVersion, "lowback_precision_v1");
    assert.equal(stored.diagnosis_version, "lowback_precision_v1");
    assert.equal(request.record.precisionData.persistenceVersion, 1);
    assert.deepEqual(request.record.precisionData.safety,
      { numbness: null, weakness: null, limbSpread: null });
    assert.deepEqual(Array.from(result.answers.symptoms), []);
    assert.equal(result.answers.spread, "");
    assert.deepEqual(stored.precision_data, request.record.precisionData, `${entry.id}: exact serialized DTO`);
    assert.deepEqual(Array.from(request.record.candidateMuscles), result.topMuscles.map((item) => item.name));
    assert.deepEqual(stored.candidate_muscles, result.topMuscles.map((item) => item.name));
    assert.deepEqual(stored.movements, entry.input.movements);
    assert.notEqual(stored.diagnosis_version, legacy.stored.diagnosis_version);
    for (const field of ["candidateLogicVersion", "candidateStatus", "candidateStatusReason", "answers",
      "topMuscles", "candidateReferenceMuscles"]) {
      assert(Object.hasOwn(request.record, field), `${entry.id}: browser record has ${field}`);
      assert(!Object.hasOwn(stored, field), `${entry.id}: server discards ${field}`);
    }
    assert(!Object.hasOwn(stored, "muscleId"));
    assert(!Object.hasOwn(stored, "metadata"));
    assert(!Object.hasOwn(request.record, "unionFrontier"), "frontier is not part of the current browser record");
    assert(precisionUi.instance.__result().includes('id="saveBodyBtn"'), "precision record action is available");
    const response = await handler({ httpMethod: "POST", body: JSON.stringify(request) });
    assert.equal(response.statusCode, 202);
    assert.equal(JSON.parse(response.body).storage, "anonymous_diagnosis_records");
    const savedByHandler = JSON.parse(calls.at(-1).options.body);
    assert.equal(Number.isNaN(Date.parse(savedByHandler.updated_at)), false);
    assert.deepEqual({ ...savedByHandler, updated_at: "" }, { ...stored, updated_at: "" });
    results.push({ id: entry.id, status: result.candidateStatus, reason: result.candidateStatusReason,
      main: fixed.main, additional: fixed.trustedAdditional, frontier: fixed.unionFrontier,
      display: fixed.display.all, dbMuscleNames: stored.candidate_muscles,
      safety: request.record.precisionData.safety,
      dbScore: stored.symptom_score });
    casePayloads.push({ id: entry.id, input: entry.input, request, sanitizedRecord: stored });
  }
  const p15Input = benchmarkInputs.get("LBK-P15");
  const p15 = payloadFor(precisionUi, "P15", p15Input);
  assert.equal(p15.result.candidateStatusReason, "cross_group_equal");
  assert.deepEqual(p15.stored.movements, p15Input.movements);
  assert.deepEqual(p15.stored.candidate_muscles, p15.result.topMuscles.map((item) => item.name));
  const productionRecord = payloadFor(productionUi, "production-default", cases[0].input);
  assert.deepEqual(productionRecord.stored.precision_data, casePayloads[0].sanitizedRecord.precision_data);
  let disabledFetches = 0;
  const disabled = createHandler({ fetchImpl: async () => { disabledFetches += 1; throw new Error("unexpected DB call"); },
    getStoreImpl: () => { throw new Error("unexpected Blob call"); },
    env: { SUPABASE_URL: "https://mock-db.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-only",
      PRECISION_PERSISTENCE_ENABLED: "false" } });
  const disabledResponse = await disabled({ httpMethod: "POST", body: JSON.stringify(productionRecord.request) });
  assert.equal(disabledResponse.statusCode, 503);
  assert.equal(JSON.parse(disabledResponse.body).error, "precision_persistence_disabled");
  assert.equal(disabledFetches, 0);
  await precisionUi.instance.__submit(casePayloads[0].request.record);
  assert.deepEqual(Array.from(precisionUi.window.__HCL_LOCAL_REQUESTS__, (request) => request.mocked), [true]);
  assert.equal(calls.length, cases.length, "one mocked DB request per fixed case");
  assert.equal(forbiddenNetwork, 0, "production network requests");
  if (process.argv.includes("--write-artifact")) {
    const artifact = { fixtureOnly: true, productionRequests: forbiddenNetwork,
      legacy: { request: legacy.request, sanitizedRecord: legacy.stored },
      precision: { request: casePayloads[0].request, sanitizedRecord: casePayloads[0].sanitizedRecord },
      cases: casePayloads, benchmarkP15: { input: p15Input, request: p15.request, sanitizedRecord: p15.stored },
      summary: results };
    const target = path.join(root, "docs/audits/lower-back-precision-v1-production-persistence-review-2026-09-30.json");
    fs.writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  }
  if (process.argv.includes("--print-payloads")) {
    console.log(JSON.stringify({ legacyRequest: legacy.request, legacyStored: legacy.stored,
      precisionRequest: payloadFor(precisionUi, "A", cases[0].input).request,
      precisionStored: payloadFor(precisionUi, "A", cases[0].input).stored, cases: results }, null, 2));
  } else {
    console.log(JSON.stringify({ fixedCases: results, benchmarks: [...includedBenchmarks, "P15"],
      mockedSupabasePosts: calls.length, realNetworkRequests: forbiddenNetwork,
      legacyDiagnosisVersion: legacy.stored.diagnosis_version,
      precisionDiagnosisVersion: results.length && "lowback_precision_v1", gateOffRejectedWithoutDbOrBlob: true }, null, 2));
  }
} finally {
  global.fetch = originalFetch;
}
