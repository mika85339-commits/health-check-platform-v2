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
const { createUi, calculateUi } = require("./elbow-candidate-precision-v1.test.js");
const design = require("../docs/audits/elbow-precision-v1-final-human-review-v2-2026-10-07.json");
const Persistence = require("../precision-persistence.js");
const Elbow = require("../elbow-candidate-precision-v1.js");
const names = Object.fromEntries(Elbow.MASTER.map(({ id, name }) => [id, name]));

const chosen = new Set();
function pick(label, predicate) {
  const index = design.cases.findIndex((row, at) => !chosen.has(at) && predicate(row.results.human));
  assert(index >= 0, label);
  chosen.add(index);
  return { label, row: design.cases[index] };
}
const representatives = [
  pick("ranked", (result) => result.status === "ranked"),
  pick("tied", (result) => result.status === "tied"),
  pick("insufficient", (result) => result.status === "insufficient"),
  pick("no-main-additional", (result) => !result.main.length && result.additional.length),
  pick("related", (result) => result.related.length > 0),
  pick("reference", (result) => result.reference.length > 0)
];
const records = representatives.map(({ label, row }) => {
  const ui = createUi();
  const result = calculateUi(ui, row.input);
  result.diagnosisId = `local-elbow-${label}`;
  result.savedAt = "2026-10-07T00:00:00.000Z";
  const record = ui.__normalize(result);
  const saved = sanitizeRecord(record);
  assert.equal(saved.diagnosis_version, "elbow_precision_v1");
  assert.equal(saved.symptom_score, null);
  assert.equal(saved.precision_data.persistenceVersion, 2);
  assert.deepEqual(saved.precision_data.safety,
    { numbness: null, weakness: null, limbSpread: null });
  for (const [key, expected] of [["mainMuscleIds", row.results.human.main],
    ["additionalMuscleIds", row.results.human.additional],
    ["relatedMuscleIds", row.results.human.related],
    ["referenceMuscleIds", row.results.human.reference],
    ["frontierMuscleIds", row.results.human.frontier]]) {
    assert.deepEqual(saved.precision_data.result[key], expected);
  }
  validatePendingRecord(JSON.parse(JSON.stringify(saved)), fallbackBlobKey(record.diagnosisId));
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
    where dimension = 'body_part' and label = 'elbow'`)).rows[0];
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
    where diagnosis_id like 'local-elbow-%'`)).rows;
  assert.equal(rows.length, records.length);
  for (const record of records) {
    const row = rows.find((entry) => entry.diagnosis_id === record.diagnosisId);
    assert(row);
    assert.equal(row.symptom_score, null);
    assert.deepEqual(row.precision_data, record.precisionData);
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
  const fallbackRecord = { ...records[4], diagnosisId: "local-elbow-fallback" };
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
  databaseAvailable = true;
  const sync = createSyncHandler({ fetchImpl, getStoreImpl: () => memoryStore, env });
  const scheduled = createScheduledHandler({ env, sync });
  assert.equal((await scheduled()).status, 204);
  assert.equal(diagnosisKeys().length, 0);
  rows = (await db.query(`select diagnosis_id, symptom_score, precision_data
    from public.anonymous_diagnosis_records where diagnosis_id = 'local-elbow-fallback'`)).rows;
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].precision_data, fallbackRecord.precisionData);
  assert.deepEqual(Persistence.hydratePrecisionHistory({ ...rows[0],
    diagnosis_version: "elbow_precision_v1", body_part: "elbow" }, names).topMuscles
    .filter(({ displayGroup }) => displayGroup === "Related").map(({ muscleId }) => muscleId),
  fallbackRecord.precisionData.result.relatedMuscleIds);
  assert.equal((await scheduled()).status, 204);
  assert.deepEqual(await rollup(db), { diagnoses: records.length + 1, scored: 0, score_sum: 0 });
  assert.equal((await db.query("select count(*)::int as count from public.anonymous_diagnosis_records where symptom_score = 0")).rows[0].count, 0);
  assert.equal(dbWrites, records.length + 2);
  console.log(JSON.stringify({ pgliteRows: records.length + 1, fallback: true,
    scheduledSync: true, replay: true, relatedStableIds: true, falseZero: 0,
    rollup: await rollup(db) }, null, 2));
} finally {
  await db.close();
}
