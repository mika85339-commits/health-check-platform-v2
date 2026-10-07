import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHandler, fallbackBlobKey, sanitizeRecord } from "../netlify/functions/save-diagnosis-record.mjs";
import { createHandler as createSyncHandler, validatePendingRecord } from "../netlify/functions/sync-diagnosis-records.mjs";
import { createScheduledHandler } from "../netlify/functions/sync-diagnosis-records-scheduled.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.HCL_PGLITE_MODULE) throw new Error("Set HCL_PGLITE_MODULE to a local PGlite package");
const { PGlite } = require(process.env.HCL_PGLITE_MODULE);
const { createUi, calculateUi } = require("./sole-candidate-precision-v1.test.js");
const design = require("../docs/audits/sole-precision-v1-final-human-review-2026-10-07.json");
const Persistence = require("../precision-persistence.js");
const Sole = require("../sole-candidate-precision-v1.js");
const names = Object.fromEntries(Sole.MASTER.map(({ id, name }) => [id, name]));

const chosen = new Set();
function pick(label, predicate) {
  const index = design.cases.findIndex((item, at) => !chosen.has(at) && predicate(item));
  assert(index >= 0, label);
  chosen.add(index);
  return { label, item: design.cases[index] };
}
const representatives = [
  pick("related-six", (item) => item.related.length >= 6),
  pick("tied", (item) => item.status === "tied"),
  pick("insufficient", (item) => item.status === "insufficient"),
  pick("no-main-additional", (item) => !item.main.length && item.additional.length),
  pick("reference", (item) => item.reference.length > 0)
];
const records = representatives.map(({ label, item }) => {
  const ui = createUi();
  const result = calculateUi(ui, item.input);
  result.diagnosisId = `local-sole-${label}`;
  result.savedAt = "2026-10-07T00:00:00.000Z";
  const record = ui.__normalize(result);
  const row = sanitizeRecord(record);
  assert.equal(row.diagnosis_version, "sole_precision_v1");
  assert.equal(row.symptom_score, null);
  assert.equal(row.precision_data.persistenceVersion, 2);
  assert.deepEqual(row.precision_data.safety,
    { numbness: null, weakness: null, limbSpread: null });
  for (const [key, expected] of [["mainMuscleIds", item.main],
    ["additionalMuscleIds", item.additional], ["relatedMuscleIds", item.related],
    ["referenceMuscleIds", item.reference], ["frontierMuscleIds", item.frontier]]) {
    assert.deepEqual(row.precision_data.result[key], expected);
  }
  validatePendingRecord(JSON.parse(JSON.stringify(row)), fallbackBlobKey(record.diagnosisId));
  return record;
});

async function upsertRow(db, row, ignoreDuplicates) {
  const columns = Object.keys(row);
  const fieldNames = columns.map((name) => `"${name}"`).join(", ");
  const placeholders = columns.map((name, at) =>
    `$${at + 1}${name === "precision_data" ? "::jsonb" : ""}`).join(", ");
  const values = columns.map((name) => name === "precision_data" ? JSON.stringify(row[name]) : row[name]);
  const updates = columns.filter((name) => name !== "diagnosis_id")
    .map((name) => `"${name}" = excluded."${name}"`).join(", ");
  await db.query(`insert into public.anonymous_diagnosis_records (${fieldNames})
    values (${placeholders}) on conflict (diagnosis_id)
    ${ignoreDuplicates ? "do nothing" : `do update set ${updates}`}`, values);
}
async function rollup(db) {
  return (await db.query(`select sum(diagnosis_count)::int as diagnoses,
    sum(symptom_score_count)::int as scored, sum(symptom_score_sum)::int as score_sum
    from public.anonymous_diagnosis_daily_rollups
    where dimension = 'body_part' and label = 'sole'`)).rows[0];
}

const db = new PGlite();
try {
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(fs.readFileSync(path.join(root, "supabase-body-platform.sql"), "utf8"));
  await db.exec(fs.readFileSync(path.join(root,
    "docs/audits/precision-persistence-migration-up-2026-09-30.sql"), "utf8"));
  const env = { SUPABASE_URL: "https://nonproduction.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "local-test-only", PRECISION_PERSISTENCE_ENABLED: "true",
    DIAGNOSIS_SYNC_SECRET: "local-sync-only" };
  let databaseAvailable = true;
  let dbWrites = 0;
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://nonproduction.invalid/rest/v1/anonymous_diagnosis_records?on_conflict=diagnosis_id");
    if (!databaseAvailable) throw new Error("local_database_outage");
    dbWrites += 1;
    await upsertRow(db, JSON.parse(options.body), options.headers.Prefer.includes("ignore-duplicates"));
    return { ok: true, status: 201, text: async () => "" };
  };
  const noBlob = () => ({ async delete() {}, async set() { throw new Error("Unexpected Blob fallback"); } });
  const save = createHandler({ fetchImpl, getStoreImpl: noBlob, env });
  for (const record of [...records, records[0]]) {
    const response = await save({ httpMethod: "POST", body: JSON.stringify({ mode: "auto", record }) });
    assert.equal(response.statusCode, 202);
  }
  let rows = (await db.query(`select diagnosis_id, diagnosis_version, symptom_score, body_part,
    candidate_muscles, precision_data from public.anonymous_diagnosis_records
    where diagnosis_id like 'local-sole-%'`)).rows;
  assert.equal(rows.length, records.length);
  for (const record of records) {
    const row = rows.find((entry) => entry.diagnosis_id === record.diagnosisId);
    assert(row);
    assert.equal(row.symptom_score, null);
    assert.deepEqual(row.precision_data, record.precisionData);
    assert.deepEqual(row.candidate_muscles, record.candidateMuscles);
    const hydrated = Persistence.hydratePrecisionHistory(row, names);
    for (const group of ["Main", "Additional", "Related", "Reference"]) {
      const key = `${group.toLowerCase()}MuscleIds`;
      assert.deepEqual(hydrated.topMuscles.filter((item) => item.displayGroup === group)
        .map((item) => item.muscleId), row.precision_data.result[key]);
    }
    assert(hydrated.topMuscles.every(({ name }) => name !== "名称未登録の候補"));
  }
  assert.deepEqual(await rollup(db), { diagnoses: records.length, scored: 0, score_sum: 0 });

  const pending = new Map();
  const diagnosisKeys = () => [...pending.keys()].filter((key) => key.startsWith("diagnosis-"));
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
      return { blobs: diagnosisKeys().filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
  const fallbackRecord = { ...records[0], diagnosisId: "local-sole-fallback" };
  databaseAvailable = false;
  const fallbackSave = createHandler({ fetchImpl, getStoreImpl: () => memoryStore, env });
  const fallback = await fallbackSave({ httpMethod: "POST",
    body: JSON.stringify({ mode: "auto", record: fallbackRecord }) });
  assert.equal(fallback.statusCode, 202);
  assert.equal(JSON.parse(fallback.body).pendingSync, true);
  assert.equal(diagnosisKeys().length, 1);
  const [key] = diagnosisKeys();
  const blob = JSON.parse(pending.get(key).value);
  validatePendingRecord(blob, key);
  assert.equal(blob.symptom_score, null);
  assert.deepEqual(blob.precision_data, fallbackRecord.precisionData);
  assert.equal(blob.precision_data.result.relatedMuscleIds.length, records[0].precisionData.result.relatedMuscleIds.length);
  assert.equal((await db.query(`select count(*)::int as count from public.anonymous_diagnosis_records
    where diagnosis_id = 'local-sole-fallback'`)).rows[0].count, 0);
  databaseAvailable = true;
  const sync = createSyncHandler({ fetchImpl, getStoreImpl: () => memoryStore, env });
  const scheduled = createScheduledHandler({ env, sync });
  assert.equal((await scheduled()).status, 204);
  assert.equal(diagnosisKeys().length, 0);
  rows = (await db.query(`select diagnosis_id, diagnosis_version, symptom_score, body_part,
    candidate_muscles, precision_data from public.anonymous_diagnosis_records
    where diagnosis_id = 'local-sole-fallback'`)).rows;
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].precision_data, fallbackRecord.precisionData);
  assert.deepEqual(Persistence.hydratePrecisionHistory(rows[0], names).topMuscles
    .filter(({ displayGroup }) => displayGroup === "Related").map(({ muscleId }) => muscleId),
  fallbackRecord.precisionData.result.relatedMuscleIds);
  assert.equal((await scheduled()).status, 204);
  assert.deepEqual(await rollup(db), { diagnoses: records.length + 1, scored: 0, score_sum: 0 });
  assert.equal((await db.query("select count(*)::int as count from public.anonymous_diagnosis_records where symptom_score = 0")).rows[0].count, 0);
  const gateOff = createHandler({ fetchImpl, getStoreImpl: noBlob,
    env: { ...env, PRECISION_PERSISTENCE_ENABLED: "false" } });
  assert.equal((await gateOff({ httpMethod: "POST",
    body: JSON.stringify({ mode: "auto", record: records[0] }) })).statusCode, 503);
  assert.equal(dbWrites, records.length + 2);
  console.log(JSON.stringify({ pgliteRows: records.length + 1, relatedSix: true,
    fallback: true, scheduledSync: true, replay: true,
    symptomScoreNull: true, falseZero: 0, rollup: await rollup(db) }, null, 2));
} finally {
  await db.close();
}
