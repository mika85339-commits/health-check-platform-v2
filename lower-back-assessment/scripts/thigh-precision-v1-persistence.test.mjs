import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHandler, fallbackBlobKey, sanitizeRecord } from "../netlify/functions/save-diagnosis-record.mjs";
import { createHandler as createSyncHandler, validatePendingRecord } from "../netlify/functions/sync-diagnosis-records.mjs";
import { createScheduledHandler } from "../netlify/functions/sync-diagnosis-records-scheduled.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.HCL_PGLITE_MODULE) throw new Error("Set HCL_PGLITE_MODULE to a local PGlite package");
const { PGlite } = require(process.env.HCL_PGLITE_MODULE);
const Platform = require("../body-platform.js");
const Persistence = require("../precision-persistence.js");
const Thigh = require("../thigh-candidate-precision-v1.js");
const design = require("../docs/audits/thigh-precision-v1-final-human-review-2026-10-06.json");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const thighScript = '/thigh-candidate-precision-v1.js?v=20261006-thigh-precision-v1';
const bodyCheckScript = indexHtml.match(/<script src="(\/body-check-ui\.js\?v=\d{8}-[a-z0-9-]+)" defer><\/script>/)?.[1];
assert(bodyCheckScript, "body-check-ui.js needs one versioned HTML reference");
assert.equal(indexHtml.split(thighScript).length - 1, 1);
assert.equal(indexHtml.split(bodyCheckScript).length - 1, 1);
assert(indexHtml.indexOf(thighScript) < indexHtml.indexOf(bodyCheckScript));
assert(indexHtml.includes('/styles.css?v=20261009-body-check-modern-v1'));
assert(!indexHtml.includes('thigh-related-ui-local') && !indexHtml.includes('thigh-precision-v1-local'));
const uiSource = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8").replace(
  "return { init, localRecords, getPartMeta };",
  "return { init, localRecords, getPartMeta, __setState(values) { Object.assign(state, values); }, __latest() { return state.latest; }, __goNext: goNext, __calculate: calculate, __steps: currentSteps, __ai: aiHandoffText, __renderResult: renderResult, __renderCandidateRanking: renderCandidateRanking, __render: render };"
);

function createUi({ hostname = "127.0.0.1", search = "?part=thigh&thigh_logic=precision-v1",
  fetchImpl = () => { throw new Error("Unexpected network request"); } } = {}) {
  const storage = { getItem() { return null; }, setItem() {} };
  const location = { hostname, origin: `http://${hostname}:14532`, search };
  const window = { location, localStorage: storage, HealthCheckBodyPlatform: Platform,
    HealthCheckPrecisionPersistence: Persistence, HealthCheckThighPrecisionV1: Thigh,
    scrollTo() {} };
  vm.runInNewContext(uiSource, { window, location, localStorage: storage,
    sessionStorage: storage, document: { dispatchEvent() {} },
    CustomEvent: function CustomEvent() {}, URL, URLSearchParams, Date, Math, Intl,
    fetch: fetchImpl },
  { filename: "body-check-ui.js" });
  const rootElement = { innerHTML: "" };
  const instance = window.createBodyCheck({
    $: (selector) => selector === "#bodyCheckRoot" ? rootElement : null,
    $$: () => [], STORAGE_KEY: "thigh-persistence-test", copyText() {}
  });
  instance.init();
  instance.__html = () => rootElement.innerHTML;
  return instance;
}

function calculateUi(instance, input) {
  instance.__setState({ selectedParts: ["thigh"], primaryPart: "thigh",
    painLocation: input.location, side: input.side, situations: [...input.movements],
    symptoms: [], timing: "", spread: "" });
  assert.deepEqual([...instance.__steps()], ["precision_location", "precision_side", "situations", "result"]);
  return instance.__calculate();
}

function upsertRow(db, row) {
  const columns = Object.keys(row);
  const names = columns.map((name) => `"${name}"`).join(", ");
  const placeholders = columns.map((name, index) =>
    `$${index + 1}${name === "precision_data" ? "::jsonb" : ""}`).join(", ");
  const values = columns.map((name) => name === "precision_data" ? JSON.stringify(row[name]) : row[name]);
  const updates = columns.filter((name) => name !== "diagnosis_id")
    .map((name) => `"${name}" = excluded."${name}"`).join(", ");
  return db.query(`insert into public.anonymous_diagnosis_records (${names}) values (${placeholders})
    on conflict (diagnosis_id) do update set ${updates}`, values);
}

assert.deepEqual([...createUi().__steps()], ["precision_location", "precision_side", "situations", "result"]);
assert.equal(createUi({ search: "?part=thigh" }).__steps()[0], "precision_location");
assert.equal(createUi({ search: "?part=thigh&thigh_logic=legacy" }).__steps()[0], "situations");
assert.equal(createUi({ hostname: "health-check-platform-v2.netlify.app",
  search: "?part=thigh" }).__steps().join(","),
"precision_location,precision_side,situations,result");
const questionUi = createUi();
for (const [stepIndex, expectedLabel, expectedOptions] of [
  [0, "詳しい場所", ["太ももの前", "太ももの後ろ", "太ももの内側", "太ももの外側", "場所ははっきり分からない"]],
  [1, "左右", ["右側", "左側", "両側", "中央"]],
  [2, "動作", ["膝を伸ばす時", "膝を曲げる時", "脚を後ろへ動かす時",
    "脚を内側へ寄せる時", "脚を外側へ開く時", "特定の動きが分からない"]]
]) {
  questionUi.__setState({ stepIndex });
  questionUi.__render();
  const html = questionUi.__html();
  assert(html.includes(expectedLabel));
  assert(html.includes("--step-count:4"));
  for (const option of expectedOptions) assert(html.includes(option), option);
  assert(!html.includes("安全確認") && !html.includes("広がり") && !html.includes("股関節を曲げる"));
}
const ui = createUi();
const productionEquivalentUi = createUi({ hostname: "health-check-platform-v2.netlify.app",
  search: "?part=thigh" });
for (const expected of design.cases) {
  const actual = calculateUi(ui, expected.input);
  const normalUrlActual = calculateUi(productionEquivalentUi, expected.input);
  const groups = Object.groupBy(actual.topMuscles, (item) => item.displayGroup);
  const ids = (group) => (groups[group] || []).map((item) => item.muscleId).sort();
  const normalUrlGroups = Object.groupBy(normalUrlActual.topMuscles, (item) => item.displayGroup);
  const normalUrlIds = (group) => (normalUrlGroups[group] || []).map((item) => item.muscleId).sort();
  assert.equal(actual.candidateStatus, expected.status);
  assert.equal(actual.candidateStatusReason, expected.reason);
  assert.equal(normalUrlActual.candidateStatus, expected.status);
  assert.equal(normalUrlActual.candidateStatusReason, expected.reason);
  assert.deepEqual(ids("Main"), expected.main);
  assert.deepEqual(ids("Additional"), expected.additional);
  assert.deepEqual(ids("Related"), expected.relatedDisplayed);
  assert.deepEqual(ids("Reference"), expected.reference);
  for (const group of ["Main", "Additional", "Related", "Reference"]) {
    assert.deepEqual(normalUrlIds(group), ids(group));
  }
  assert.deepEqual(actual.precisionData.result.frontierMuscleIds, expected.unionFrontier);
  assert.deepEqual(normalUrlActual.precisionData.result.frontierMuscleIds, expected.unionFrontier);
  assert.deepEqual(actual.topMuscles.filter((item) => ["Main", "Additional"].includes(item.displayGroup))
    .map((item) => item.muscleId).sort(), expected.display.initial);
  assert.deepEqual(normalUrlActual.topMuscles.filter((item) => ["Main", "Additional"].includes(item.displayGroup))
    .map((item) => item.muscleId).sort(), expected.display.initial);
  const rankingHtml = ui.__renderCandidateRanking(actual);
  if (expected.relatedDisplayed.length) {
    assert(rankingHtml.includes("参考として関連する筋肉"));
    assert(rankingHtml.includes("縫工筋"));
    assert(rankingHtml.includes("順位を付けず参考として表示しています。"));
    assert(rankingHtml.includes("順位なし・参考"));
    assert(rankingHtml.includes('class="result-candidate-card') && rankingHtml.includes("is-related"));
    assert(!rankingHtml.includes("thigh-related-more"));
    assert(!rankingHtml.includes("その他の関連候補"));
  } else {
    assert(!rankingHtml.includes("参考として関連する筋肉"));
  }
}

const simulatedRequests = [];
const normalUrlUi = createUi({ hostname: "health-check-platform-v2.netlify.app",
  search: "?part=thigh",
  fetchImpl: async (url, options) => {
    simulatedRequests.push({ url, options });
    return { ok: true, status: 202, json: async () => ({ ok: true }) };
  } });
normalUrlUi.__setState({ selectedParts: ["thigh"], primaryPart: "thigh",
  painLocation: "thigh_inner", side: "right", situations: ["knee_bend"], stepIndex: 2 });
await normalUrlUi.__goNext();
assert.equal(normalUrlUi.__latest().diagnosisVersion, "thigh_precision_v1");
assert(normalUrlUi.__html().includes("参考として関連する筋肉"));
assert.equal(simulatedRequests.length, 1);
assert.equal(simulatedRequests[0].url, "/.netlify/functions/save-diagnosis-record");
const simulatedRecord = JSON.parse(simulatedRequests[0].options.body).record;
assert.equal(simulatedRecord.diagnosisVersion, "thigh_precision_v1");
assert.equal(simulatedRecord.symptomScore, null);
assert.deepEqual(simulatedRecord.precisionData.safety,
  { numbness: null, weakness: null, limbSpread: null });
assert.equal(sanitizeRecord(simulatedRecord).symptom_score, null);

const relatedExample = calculateUi(createUi(), {
  location: "thigh_inner", side: "right", movements: ["knee_bend"]
});
assert(relatedExample.topMuscles.some((item) => item.displayGroup === "Additional" && item.name === "ハムストリングス"));
assert(relatedExample.topMuscles.some((item) => item.displayGroup === "Related" && item.name === "縫工筋"));
const relatedHtml = ui.__renderCandidateRanking(relatedExample);
assert(relatedHtml.indexOf("動きから追加で考えられる候補") <
  relatedHtml.indexOf("参考として関連する筋肉"));
assert(relatedHtml.indexOf("参考として関連する筋肉") <
  relatedHtml.indexOf("縫工筋"));
assert(!relatedHtml.includes("<details"));
const twoRelated = { ...relatedExample, topMuscles: [
  ...relatedExample.topMuscles,
  { ...relatedExample.topMuscles.find((item) => item.displayGroup === "Related"),
    muscleId: "synthetic_related_a", name: "検証用の筋A" }
] };
const twoRelatedHtml = ui.__renderCandidateRanking(twoRelated);
assert(twoRelatedHtml.includes("参考として関連する筋肉"));
assert(twoRelatedHtml.includes("縫工筋") && twoRelatedHtml.includes("検証用の筋A"));
assert(!twoRelatedHtml.includes("<details"));
const threeRelated = { ...relatedExample, topMuscles: [
  ...relatedExample.topMuscles,
  { ...relatedExample.topMuscles.find((item) => item.displayGroup === "Related"),
    muscleId: "synthetic_related_a", name: "検証用の筋A" },
  { ...relatedExample.topMuscles.find((item) => item.displayGroup === "Related"),
    muscleId: "synthetic_related_b", name: "検証用の筋B" }
] };
const threeRelatedHtml = ui.__renderCandidateRanking(threeRelated);
assert(threeRelatedHtml.includes("thigh-related-more"));
assert(threeRelatedHtml.includes("参考として関連する筋肉（3筋）"));
assert(threeRelatedHtml.includes("縫工筋・検証用の筋A ほか1筋"));
const allGroups = calculateUi(createUi(), {
  location: "thigh_front", side: "right", movements: ["knee_extend", "knee_bend", "hip_adduct"]
});
assert.deepEqual([...new Set(allGroups.topMuscles.map((item) => item.displayGroup))],
  ["Main", "Additional", "Related", "Reference"]);
const allGroupsHtml = ui.__renderCandidateRanking(allGroups);
const groupHeadings = ["選んだ位置と動きが重なる候補", "動きから追加で考えられる候補",
  "参考として関連する筋肉", "伸ばされる方向としての参考"];
for (let index = 1; index < groupHeadings.length; index++) {
  assert(allGroupsHtml.indexOf(groupHeadings[index - 1]) < allGroupsHtml.indexOf(groupHeadings[index]));
}
const oldPartHtml = ui.__renderCandidateRanking({ ...relatedExample,
  regionId: "buttock", candidateLogicVersion: "buttock-precision-v1-local-hypothesis" });
assert(oldPartHtml.includes("その他の関連候補（1）"));
assert(!oldPartHtml.includes("参考として関連する筋肉"));

const pick = (predicate) => {
  const item = design.cases.find(predicate);
  assert(item, "Missing representative case");
  return item;
};
const representatives = [
  ["ranked", pick((item) => item.status === "ranked")],
  ["tied", pick((item) => item.status === "tied")],
  ["insufficient", pick((item) => item.status === "insufficient")],
  ["no-main-additional", pick((item) => !item.main.length && item.additional.length)],
  ["tfl-additional", pick((item) => item.additional.includes("thigh_tfl"))],
  ["sartorius-related", pick((item) => item.relatedDisplayed.includes("thigh_sartorius"))],
  ["reference", pick((item) => item.reference.length > 0)]
];
const records = representatives.map(([label, item]) => {
  const local = createUi();
  const result = calculateUi(local, item.input);
  const handoff = local.__ai(result);
  assert(handoff.includes("筋肉の説明") && handoff.includes("症状") && handoff.includes("今回の回答との関係"));
  assert(handoff.includes("追加・削除") && handoff.includes("順位変更"));
  assert(!handoff.includes("しびれなし") && !handoff.includes("ストレッチを教えて"));
  if (item.input.movements.includes("hip_extend") &&
    [...item.main, ...item.additional].includes("thigh_adductors")) {
    assert(handoff.includes("群の一部") && handoff.includes("群の全筋に共通しません"));
  }
  const markup = local.__renderResult();
  assert(markup.includes("候補筋についてAIに聞く内容をコピー"));
  if (item.additional.length) assert(markup.includes("動きから追加で考えられる候補"));
  if (item.relatedDisplayed.length) {
    assert(markup.includes("参考として関連する筋肉"));
    assert(markup.includes("縫工筋"));
  }
  if (item.reference.length) assert(markup.includes("伸ばされる方向としての参考"));
  result.diagnosisId = `local-thigh-${label}`;
  result.savedAt = "2026-10-06T00:00:00.000Z";
  return Platform.normalizeRecord(result, {
    anonymousDeviceId: "local-device", anonymousSessionId: "local-session"
  });
});

for (const record of records) {
  assert.equal(record.diagnosisVersion, "thigh_precision_v1");
  assert.equal(record.symptomScore, null);
  assert.deepEqual(record.precisionData.safety,
    { numbness: null, weakness: null, limbSpread: null });
  const sanitized = sanitizeRecord(record);
  assert.equal(sanitized.symptom_score, null);
  assert.deepEqual(sanitized.precision_data, record.precisionData);
  const pendingPayload = JSON.parse(JSON.stringify(sanitized));
  validatePendingRecord(pendingPayload, fallbackBlobKey(record.diagnosisId));
  assert.equal(pendingPayload.symptom_score, null);
}

const db = new PGlite();
try {
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(fs.readFileSync(path.join(root, "supabase-body-platform.sql"), "utf8"));
  await db.exec(fs.readFileSync(path.join(root,
    "docs/audits/precision-persistence-migration-up-2026-09-30.sql"), "utf8"));
  let functionWrites = 0;
  let blobWrites = 0;
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://nonproduction.invalid/rest/v1/anonymous_diagnosis_records?on_conflict=diagnosis_id");
    assert.equal(options.method, "POST");
    functionWrites += 1;
    await upsertRow(db, JSON.parse(options.body));
    return { ok: true, status: 201, text: async () => "" };
  };
  const getStoreImpl = () => ({
    async delete() {},
    async set() { blobWrites += 1; throw new Error("Unexpected Blob fallback"); }
  });
  const env = { SUPABASE_URL: "https://nonproduction.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "local-test-only", PRECISION_PERSISTENCE_ENABLED: "true" };
  const handler = createHandler({ fetchImpl, getStoreImpl, env });
  for (const record of [...records, records[0]]) {
    const response = await handler({ httpMethod: "POST",
      body: JSON.stringify({ mode: "auto", record }) });
    assert.equal(response.statusCode, 202);
  }
  const rows = (await db.query(`select diagnosis_id, diagnosis_version, symptom_score,
    body_part, candidate_muscles, precision_data from public.anonymous_diagnosis_records
    where diagnosis_id like 'local-thigh-%'`)).rows;
  assert.equal(rows.length, records.length);
  for (const record of records) {
    const row = rows.find((item) => item.diagnosis_id === record.diagnosisId);
    assert(row);
    assert.equal(row.diagnosis_version, "thigh_precision_v1");
    assert.equal(row.body_part, "thigh");
    assert.equal(row.symptom_score, null);
    assert.deepEqual(row.precision_data, record.precisionData);
    assert.deepEqual(row.candidate_muscles, record.candidateMuscles);
    if (record.diagnosisId === "local-thigh-sartorius-related") {
      assert(row.candidate_muscles.includes("縫工筋"));
      const names = new Map(Thigh.MASTER.map(({ id, name }) => [id, name]));
      const groupedNames = new Set([
        ...row.precision_data.result.mainMuscleIds,
        ...row.precision_data.result.additionalMuscleIds,
        ...row.precision_data.result.referenceMuscleIds
      ].map((id) => names.get(id)));
      assert.deepEqual(row.candidate_muscles.filter((name) => !groupedNames.has(name)), ["縫工筋"]);
    }
    const hydrated = Persistence.hydratePrecisionHistory(row,
      Object.fromEntries(Thigh.MASTER.map(({ id, name }) => [id, name])));
    assert(hydrated.topMuscles.every(({ name }) => name !== "名称未登録の候補"));
    assert(!/NaN|undefined|0点/.test(JSON.stringify(hydrated)));
  }
  const rollup = (await db.query(`select sum(diagnosis_count)::int as diagnoses,
    sum(symptom_score_count)::int as scored, sum(symptom_score_sum)::int as score_sum
    from public.anonymous_diagnosis_daily_rollups
    where dimension = 'body_part' and label = 'thigh'`)).rows[0];
  assert.deepEqual(rollup, { diagnoses: records.length, scored: 0, score_sum: 0 });
  assert.equal((await db.query(`select count(*)::int as count
    from public.anonymous_diagnosis_records where symptom_score = 0`)).rows[0].count, 0);
  assert.equal(functionWrites, records.length + 1);
  assert.equal(blobWrites, 0);
  const gateOff = createHandler({ fetchImpl, getStoreImpl,
    env: { ...env, PRECISION_PERSISTENCE_ENABLED: "false" } });
  assert.equal((await gateOff({ httpMethod: "POST",
    body: JSON.stringify({ mode: "auto", record: records[0] }) })).statusCode, 503);
  assert.equal(functionWrites, records.length + 1);

  const pendingBlobs = new Map();
  const memoryStore = {
    async set(key, value, options = {}) {
      if (options.onlyIfNew && pendingBlobs.has(key)) return { modified: false };
      pendingBlobs.set(key, { value, metadata: options.metadata || {}, etag: "local-etag" });
      return { modified: true };
    },
    async get(key) { return pendingBlobs.get(key)?.value || null; },
    async getWithMetadata(key) {
      const entry = pendingBlobs.get(key);
      return entry ? { data: JSON.parse(entry.value), metadata: entry.metadata, etag: entry.etag } : null;
    },
    async getMetadata(key, options) {
      assert.equal(options.consistency, "strong");
      return pendingBlobs.has(key) ? pendingBlobs.get(key).metadata : null;
    },
    async delete(key) { pendingBlobs.delete(key); },
    async list({ prefix }) {
      return { blobs: [...pendingBlobs.keys()].filter((key) => key.startsWith(prefix))
        .map((key) => ({ key })) };
    }
  };
  const fallbackRecord = { ...records.find((item) => item.diagnosisId === "local-thigh-sartorius-related"),
    diagnosisId: "local-thigh-scheduled-fallback" };
  let databaseAvailable = false;
  const fallbackFetch = async (url, options) => {
    assert.equal(url, "https://nonproduction.invalid/rest/v1/anonymous_diagnosis_records?on_conflict=diagnosis_id");
    if (!databaseAvailable) throw new Error("local_database_outage");
    await upsertRow(db, JSON.parse(options.body));
    return { ok: true, status: 201, text: async () => "" };
  };
  const syncEnv = { ...env, DIAGNOSIS_SYNC_SECRET: "local-sync-only" };
  const fallbackHandler = createHandler({ fetchImpl: fallbackFetch,
    getStoreImpl: () => memoryStore, env: syncEnv });
  const fallbackResponse = await fallbackHandler({ httpMethod: "POST",
    body: JSON.stringify({ mode: "auto", record: fallbackRecord }) });
  assert.equal(fallbackResponse.statusCode, 202);
  assert.equal(JSON.parse(fallbackResponse.body).pendingSync, true);
  const pendingKeys = [...pendingBlobs.keys()].filter((key) => key.startsWith("diagnosis-"));
  assert.equal(pendingKeys.length, 1);
  const pendingRecord = JSON.parse(pendingBlobs.get(pendingKeys[0]).value);
  validatePendingRecord(pendingRecord, pendingKeys[0]);
  assert.deepEqual(pendingRecord.precision_data, fallbackRecord.precisionData);
  assert.equal((await db.query(`select count(*)::int as count from public.anonymous_diagnosis_records
    where diagnosis_id = 'local-thigh-scheduled-fallback'`)).rows[0].count, 0);
  databaseAvailable = true;
  const sync = createSyncHandler({ fetchImpl: fallbackFetch,
    getStoreImpl: () => memoryStore, env: syncEnv });
  const scheduled = createScheduledHandler({ env: syncEnv, sync });
  assert.equal((await scheduled()).status, 204);
  assert.equal([...pendingBlobs.keys()].filter((key) => key.startsWith("diagnosis-")).length, 0);
  const savedFallback = (await db.query(`select diagnosis_version, symptom_score, precision_data
    from public.anonymous_diagnosis_records
    where diagnosis_id = 'local-thigh-scheduled-fallback'`)).rows;
  assert.equal(savedFallback.length, 1);
  assert.equal(savedFallback[0].diagnosis_version, "thigh_precision_v1");
  assert.equal(savedFallback[0].symptom_score, null);
  assert.deepEqual(savedFallback[0].precision_data, fallbackRecord.precisionData);
  assert.equal((await scheduled()).status, 204);
  assert.equal((await db.query(`select count(*)::int as count from public.anonymous_diagnosis_records
    where diagnosis_id = 'local-thigh-scheduled-fallback'`)).rows[0].count, 1);
  const rollupAfterSync = (await db.query(`select sum(diagnosis_count)::int as diagnoses,
    sum(symptom_score_count)::int as scored, sum(symptom_score_sum)::int as score_sum
    from public.anonymous_diagnosis_daily_rollups
    where dimension = 'body_part' and label = 'thigh'`)).rows[0];
  assert.deepEqual(rollupAfterSync, { diagnoses: records.length + 1, scored: 0, score_sum: 0 });
  console.log("Thigh precision-v1 normal URL 520/520 and 7-case PGlite save/replay/gate + local fallback/scheduled sync: PASS");
} finally {
  await db.close();
}
