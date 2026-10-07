import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHandler, sanitizeRecord, fallbackBlobKey } from "../netlify/functions/save-diagnosis-record.mjs";
import { createHandler as createSyncHandler, validatePendingRecord } from "../netlify/functions/sync-diagnosis-records.mjs";
import { createScheduledHandler } from "../netlify/functions/sync-diagnosis-records-scheduled.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.HCL_PGLITE_MODULE) throw new Error("Set HCL_PGLITE_MODULE to a local PGlite package");
const { PGlite } = require(process.env.HCL_PGLITE_MODULE);
const { createUi, calculateUi } = require("./ankle-candidate-precision-v1.test.js");
const design = require("../docs/audits/ankle-precision-v1-final-human-review-2026-10-07.json");
const Persistence = require("../precision-persistence.js");
const Ankle = require("../ankle-candidate-precision-v1.js");
const names = new Map(Ankle.MASTER.map(({ id, name }) => [id, name]));

const chosen = new Set();
function pick(label, predicate) {
  const index = design.cases.findIndex((item, at) => !chosen.has(at) && predicate(item));
  assert(index >= 0, label);
  chosen.add(index);
  return { label, case: design.cases[index] };
}
const representatives = [
  pick("ranked", (item) => item.result.status === "ranked"),
  pick("tied", (item) => item.result.status === "tied"),
  pick("insufficient", (item) => item.result.status === "insufficient"),
  pick("no-main-additional", (item) => !item.result.main.length && item.result.additional.length),
  pick("related", (item) => item.result.related.length > 0),
  pick("reference", (item) => item.result.reference.length > 0),
  pick("five-name-limit", (item) => item.result.related.length &&
    item.result.main.length + item.result.additional.length >= 5),
  pick("posterior-tie", (item) => item.input.location === "ankle_inner" &&
    item.input.movements.length === 1 && item.input.movements[0] === "foot_in" &&
    item.result.top.includes("ankle_tibialis_posterior") &&
    item.result.top.includes("ankle_toe_flexors"))
];
const records = representatives.map(({ label, case: { input, result: expected } }) => {
  const ui = createUi({ hostname: "health-check-platform-v2.netlify.app", search: "?part=ankle" });
  const result = calculateUi(ui, input);
  result.diagnosisId = `local-ankle-${label}`;
  result.savedAt = "2026-10-07T00:00:00.000Z";
  const record = ui.__normalize(result);
  const sanitized = sanitizeRecord(record);
  assert.equal(record.diagnosisVersion, "ankle_precision_v1");
  assert.equal(sanitized.symptom_score, null);
  assert.deepEqual(record.precisionData.safety,
    { numbness: null, weakness: null, limbSpread: null });
  for (const id of expected.related) assert(record.candidateMuscles.includes(names.get(id)));
  validatePendingRecord(JSON.parse(JSON.stringify(sanitized)), fallbackBlobKey(record.diagnosisId));
  return record;
});

function upsertRow(db, row) {
  const columns = Object.keys(row);
  const fieldNames = columns.map((name) => `"${name}"`).join(", ");
  const placeholders = columns.map((name, at) =>
    `$${at + 1}${name === "precision_data" ? "::jsonb" : ""}`).join(", ");
  const values = columns.map((name) => name === "precision_data" ? JSON.stringify(row[name]) : row[name]);
  const updates = columns.filter((name) => name !== "diagnosis_id")
    .map((name) => `"${name}" = excluded."${name}"`).join(", ");
  return db.query(`insert into public.anonymous_diagnosis_records (${fieldNames}) values (${placeholders})
    on conflict (diagnosis_id) do update set ${updates}`, values);
}
async function rollup(db) {
  return (await db.query(`select sum(diagnosis_count)::int as diagnoses,
    sum(symptom_score_count)::int as scored, sum(symptom_score_sum)::int as score_sum
    from public.anonymous_diagnosis_daily_rollups
    where dimension = 'body_part' and label = 'ankle'`)).rows[0];
}

const db = new PGlite();
try {
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(fs.readFileSync(path.join(root, "supabase-body-platform.sql"), "utf8"));
  await db.exec(fs.readFileSync(path.join(root,
    "docs/audits/precision-persistence-migration-up-2026-09-30.sql"), "utf8"));
  let writes = 0;
  const env = { SUPABASE_URL: "https://nonproduction.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "local-test-only", PRECISION_PERSISTENCE_ENABLED: "true" };
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://nonproduction.invalid/rest/v1/anonymous_diagnosis_records?on_conflict=diagnosis_id");
    assert.equal(options.method, "POST");
    writes += 1;
    await upsertRow(db, JSON.parse(options.body));
    return { ok: true, status: 201, text: async () => "" };
  };
  let blobWrites = 0;
  const noBlob = () => ({ async delete() {},
    async set() { blobWrites += 1; throw new Error("Unexpected Blob fallback"); } });
  const handler = createHandler({ fetchImpl, getStoreImpl: noBlob, env });
  for (const record of [...records, records[0]]) {
    const response = await handler({ httpMethod: "POST", body: JSON.stringify({ mode: "auto", record }) });
    assert.equal(response.statusCode, 202);
  }
  assert.equal(writes, records.length + 1);
  assert.equal(blobWrites, 0);
  const rows = (await db.query(`select diagnosis_id, diagnosis_version, symptom_score, body_part,
    candidate_muscles, precision_data from public.anonymous_diagnosis_records
    where diagnosis_id like 'local-ankle-%'`)).rows;
  assert.equal(rows.length, records.length);
  for (const record of records) {
    const row = rows.find((item) => item.diagnosis_id === record.diagnosisId);
    assert(row);
    assert.equal(row.diagnosis_version, "ankle_precision_v1");
    assert.equal(row.body_part, "ankle");
    assert.equal(row.symptom_score, null);
    assert.deepEqual(row.precision_data, record.precisionData);
    assert.deepEqual(row.candidate_muscles, Array.from(record.candidateMuscles));
    const hydrated = Persistence.hydratePrecisionHistory(row,
      Object.fromEntries(Ankle.MASTER.map(({ id, name }) => [id, name])));
    assert(hydrated.topMuscles.every(({ name }) => name !== "名称未登録の候補"));
    assert(!/NaN|undefined|0点/.test(JSON.stringify(hydrated)));
  }
  assert.deepEqual(await rollup(db), { diagnoses: records.length, scored: 0, score_sum: 0 });
  assert.equal((await db.query(`select count(*)::int as count from public.anonymous_diagnosis_records
    where symptom_score = 0`)).rows[0].count, 0);
  const gateOff = createHandler({ fetchImpl, getStoreImpl: noBlob,
    env: { ...env, PRECISION_PERSISTENCE_ENABLED: "false" } });
  assert.equal((await gateOff({ httpMethod: "POST",
    body: JSON.stringify({ mode: "auto", record: records[0] }) })).statusCode, 503);
  assert.equal(writes, records.length + 1);

  const pending = new Map();
  const memoryStore = {
    async set(key, value, options = {}) {
      if (options.onlyIfNew && pending.has(key)) return { modified: false };
      pending.set(key, { value, metadata: options.metadata || {}, etag: "local-etag" });
      return { modified: true };
    },
    async get(key) { return pending.get(key)?.value || null; },
    async getWithMetadata(key) {
      const entry = pending.get(key);
      return entry ? { data: JSON.parse(entry.value), metadata: entry.metadata, etag: entry.etag } : null;
    },
    async getMetadata(key, options) {
      assert.equal(options.consistency, "strong");
      return pending.has(key) ? pending.get(key).metadata : null;
    },
    async delete(key) { pending.delete(key); },
    async list({ prefix }) {
      return { blobs: [...pending.keys()].filter((key) => key.startsWith(prefix))
        .map((key) => ({ key })) };
    }
  };
  const fallbackRecord = { ...records.find((item) => item.diagnosisId === "local-ankle-five-name-limit"),
    diagnosisId: "local-ankle-fallback" };
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
  const keys = [...pending.keys()].filter((key) => key.startsWith("diagnosis-"));
  assert.equal(keys.length, 1);
  const payload = JSON.parse(pending.get(keys[0]).value);
  validatePendingRecord(payload, keys[0]);
  assert.equal(payload.symptom_score, null);
  assert.deepEqual(payload.precision_data, fallbackRecord.precisionData);
  assert.deepEqual(payload.candidate_muscles, Array.from(fallbackRecord.candidateMuscles));
  assert.equal((await db.query(`select count(*)::int as count from public.anonymous_diagnosis_records
    where diagnosis_id = 'local-ankle-fallback'`)).rows[0].count, 0);
  databaseAvailable = true;
  const sync = createSyncHandler({ fetchImpl: fallbackFetch,
    getStoreImpl: () => memoryStore, env: syncEnv });
  const scheduled = createScheduledHandler({ env: syncEnv, sync });
  assert.equal((await scheduled()).status, 204);
  assert.equal([...pending.keys()].filter((key) => key.startsWith("diagnosis-")).length, 0);
  const savedFallback = (await db.query(`select diagnosis_version, symptom_score,
    candidate_muscles, precision_data from public.anonymous_diagnosis_records
    where diagnosis_id = 'local-ankle-fallback'`)).rows;
  assert.equal(savedFallback.length, 1);
  assert.equal(savedFallback[0].diagnosis_version, "ankle_precision_v1");
  assert.equal(savedFallback[0].symptom_score, null);
  assert.deepEqual(savedFallback[0].precision_data, fallbackRecord.precisionData);
  assert.deepEqual(savedFallback[0].candidate_muscles, Array.from(fallbackRecord.candidateMuscles));
  assert.equal((await scheduled()).status, 204);
  assert.equal((await db.query(`select count(*)::int as count from public.anonymous_diagnosis_records
    where diagnosis_id = 'local-ankle-fallback'`)).rows[0].count, 1);
  assert.deepEqual(await rollup(db), { diagnoses: records.length + 1, scored: 0, score_sum: 0 });
  console.log("Ankle representative PGlite save/replay/gate and memory Blob fallback/scheduled sync: PASS");
} finally {
  await db.close();
}
