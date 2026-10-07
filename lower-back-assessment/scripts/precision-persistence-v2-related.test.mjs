import assert from "node:assert/strict";
import crypto from "node:crypto";
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
const Persistence = require("../precision-persistence.js");
const Platform = require("../body-platform.js");
const design = require("../docs/audits/sole-precision-v1-final-human-review-2026-10-07.json");
const names = Object.fromEntries(design.master.map(({ id, name }) => [id, name]));
const safety = { numbness: null, weakness: null, limbSpread: null };

const v1Parts = [
  ["neck", "neck-candidate-precision-v2-2.js", "neck_precision_v2_2"],
  ["shoulder", "shoulder-candidate-precision-v1-2.js", "shoulder_precision_v1_2"],
  ...["lowback", "hip", "knee", "buttock", "thigh", "lowerleg", "ankle"]
    .map((part) => [part, `${part}-candidate-precision-v1.js`, `${part}_precision_v1`])
];
const v1Fixtures = v1Parts.map(([part, filename, version]) => {
  const module = require(`../${filename}`);
  const first = (module.MASTER || module.MUSCLE_MASTER)[0];
  const muscleId = first.id || first.muscleId;
  const location = part === "neck" ? module.LOCATION_OPTIONS[0][0] : module.LOCATIONS[0][0];
  const dto = Persistence.serializePrecisionResult({
    bodyPart: part, diagnosisVersion: version,
    answers: { location, side: "right", movements: ["movement_unclear"] },
    result: { status: "ranked", reason: "main_evidence", mainMuscleIds: [muscleId],
      additionalMuscleIds: [], frontierMuscleIds: [muscleId], referenceMuscleIds: [] }, safety
  });
  assert.equal(dto.persistenceVersion, 1);
  assert.deepEqual(Object.keys(dto.result), ["status", "reason", "mainMuscleIds",
    "additionalMuscleIds", "frontierMuscleIds", "referenceMuscleIds"]);
  return { part, dto, hydrated: Persistence.hydratePrecisionHistory({
    diagnosis_id: `fixture-${part}`, diagnosis_version: version, diagnosis_date: "2026-10-07",
    body_part: part, precision_data: dto
  }, { [muscleId]: first.name || first.displayName }) };
});
const v1Hash = crypto.createHash("sha256").update(JSON.stringify(v1Fixtures)).digest("hex");
// Baseline captured from the unchanged v1 serializer and hydrator before v2 support.
assert.equal(v1Hash, "71392e5d0af6ed39466ded6cacc1a8e5dacdf0ad595dcb62206ee61c9d0505ce",
  "nine-part v1 serialize/hydrate baseline changed");

assert.equal(design.cases.length, 192);
assert.deepEqual(design.summary.status, { ranked: 0, tied: 32, insufficient: 160 });
assert.equal(design.benchmarks.length, 28);
assert(Object.values(design.invariant).every((count) => count === 0));
const statusCounts = { ranked: 0, tied: 0, insufficient: 0 };
for (const item of design.cases) statusCounts[item.status] += 1;
assert.deepEqual(statusCounts, design.summary.status);
const answerKey = ({ location, side, movements }) =>
  `${location}/${side}/${[...movements].sort().join("+")}`;
for (const benchmark of design.benchmarks) {
  const match = design.cases.find(({ input }) =>
    answerKey(input) === answerKey(benchmark.finalInput));
  assert(match, benchmark.id);
  for (const key of ["status", "reason", "main", "additional", "related", "reference",
    "frontier", "displayCandidates"]) assert.deepEqual(match[key], benchmark[key], `${benchmark.id} ${key}`);
}
const cases = design.cases.map((item, index) => {
  const dto = Persistence.serializePrecisionResultV2({
    bodyPart: "sole", diagnosisVersion: "sole_precision_v1", answers: item.input,
    result: { status: item.status, reason: item.reason, mainMuscleIds: item.main,
      additionalMuscleIds: item.additional, relatedMuscleIds: item.related,
      frontierMuscleIds: item.frontier, referenceMuscleIds: item.reference }, safety
  });
  assert.equal(dto.persistenceVersion, 2);
  assert.deepEqual(dto.result.mainMuscleIds, item.main);
  assert.deepEqual(dto.result.additionalMuscleIds, item.additional);
  assert.deepEqual(dto.result.relatedMuscleIds, item.related);
  assert.deepEqual(dto.result.frontierMuscleIds, item.frontier);
  assert.deepEqual(dto.result.referenceMuscleIds, item.reference);
  const grouped = [...item.main, ...item.additional, ...item.related, ...item.reference];
  assert.equal(new Set(grouped).size, grouped.length, `case ${index} has overlapping groups`);
  const hydrated = Persistence.hydratePrecisionHistory({
    diagnosis_id: `local-sole-${index}`, diagnosis_version: "sole_precision_v1",
    diagnosis_date: "2026-10-07", body_part: "sole", precision_data: dto
  }, names);
  assert.deepEqual(hydrated.topMuscles.map(({ muscleId }) => muscleId), grouped);
  assert.deepEqual(hydrated.topMuscles.filter(({ displayGroup }) => displayGroup === "Related")
    .map(({ muscleId }) => muscleId), item.related);
  assert(hydrated.topMuscles.every(({ name }) => name !== "名称未登録の候補"));
  return { item, dto, bytes: Buffer.byteLength(JSON.stringify(dto), "utf8") };
});
const maxBytes = Math.max(...cases.map(({ bytes }) => bytes));
assert(maxBytes <= Persistence.MAX_BYTES);
assert.equal(cases.filter(({ item }) => item.related.length >= 6).length, 36);

const example = cases.find(({ item }) => item.related.length >= 6);
assert(example);
const reject = (mutate, expected) => {
  const dto = structuredClone(example.dto);
  mutate(dto);
  assert.throws(() => Persistence.validatePrecisionData(dto, "sole", "sole_precision_v1"), expected);
};
reject((dto) => { dto.result.relatedMuscleIds.push(dto.result.relatedMuscleIds[0]); }, /relatedMuscleIds_duplicate/);
reject((dto) => { dto.result.relatedMuscleIds[0] = "neck_deep_flexors"; }, /relatedMuscleIds_part/);
reject((dto) => { dto.result.relatedMuscleIds[0] = "not-valid"; }, /relatedMuscleIds/);
reject((dto) => { dto.result.relatedMuscleIds[0] = dto.result.additionalMuscleIds[0]; }, /group_overlap/);
reject((dto) => { dto.result.frontierMuscleIds = [dto.result.relatedMuscleIds[0]]; }, /frontier_membership/);
reject((dto) => { delete dto.result.relatedMuscleIds; }, /result/);
reject((dto) => { dto.result.unexpected = true; }, /result/);
reject((dto) => { dto.answers.location = `sole_${"a".repeat(4096)}`; }, /size/);
const v1WithRelated = structuredClone(v1Fixtures[0].dto);
v1WithRelated.result.relatedMuscleIds = [];
assert.throws(() => Persistence.validatePrecisionData(v1WithRelated, "neck", "neck_precision_v2_2"), /result/);

const picked = example.item;
const topMuscles = [
  ...picked.main.map((muscleId) => ({ muscleId, displayGroup: "Main" })),
  ...picked.additional.map((muscleId) => ({ muscleId, displayGroup: "Additional" })),
  ...picked.related.map((muscleId) => ({ muscleId, displayGroup: "Related" })),
  ...picked.reference.map((muscleId) => ({ muscleId, displayGroup: "Reference" }))
].map((item) => ({ ...item, name: names[item.muscleId] }));
const browserResult = {
  diagnosisId: "local-sole-v2-related-six", savedAt: "2026-10-07T00:00:00.000Z",
  diagnosisVersion: "sole_precision_v1", regionId: "sole",
  answers: { painLocation: picked.input.location, side: picked.input.side,
    situations: picked.input.movements },
  candidateStatus: picked.status, candidateStatusReason: picked.reason,
  topMuscles, precisionData: example.dto
};
const record = Platform.normalizeRecord(browserResult, {
  anonymousDeviceId: "local-sole-device", anonymousSessionId: "local-sole-session"
});
assert.equal(record.candidateMuscles.length, 5);
assert.equal(record.symptomScore, null);
assert.equal(record.precisionData.result.relatedMuscleIds.length, picked.related.length);
const sanitized = sanitizeRecord(record);
assert.equal(sanitized.symptom_score, null);
assert.equal(sanitized.precision_data.persistenceVersion, 2);
assert.deepEqual(sanitized.precision_data.safety, safety);
assert.deepEqual(sanitized.precision_data.result.relatedMuscleIds, picked.related);
assert.deepEqual(sanitized.candidate_muscles, record.candidateMuscles);

async function upsertRow(db, row, ignoreDuplicates) {
  const columns = Object.keys(row);
  const fieldNames = columns.map((name) => `"${name}"`).join(", ");
  const placeholders = columns.map((name, at) =>
    `$${at + 1}${name === "precision_data" ? "::jsonb" : ""}`).join(", ");
  const values = columns.map((name) => name === "precision_data" ? JSON.stringify(row[name]) : row[name]);
  const updates = columns.filter((name) => name !== "diagnosis_id")
    .map((name) => `"${name}" = excluded."${name}"`).join(", ");
  const conflict = ignoreDuplicates ? "do nothing" : `do update set ${updates}`;
  await db.query(`insert into public.anonymous_diagnosis_records (${fieldNames})
    values (${placeholders}) on conflict (diagnosis_id) ${conflict}`, values);
}

const db = new PGlite();
try {
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(fs.readFileSync(path.join(root, "supabase-body-platform.sql"), "utf8"));
  await db.exec(fs.readFileSync(path.join(root,
    "docs/audits/precision-persistence-migration-up-2026-09-30.sql"), "utf8"));
  const pending = new Map();
  let blobWrites = 0;
  const diagnosisKeys = () => [...pending.keys()].filter((key) => key.startsWith("diagnosis-"));
  const memoryStore = {
    async set(key, value, options = {}) {
      if (key.startsWith("diagnosis-")) blobWrites += 1;
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
  const env = { SUPABASE_URL: "https://nonproduction.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "local-test-only", PRECISION_PERSISTENCE_ENABLED: "true",
    DIAGNOSIS_SYNC_SECRET: "local-sync-only" };
  let databaseAvailable = false;
  let dbWrites = 0;
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://nonproduction.invalid/rest/v1/anonymous_diagnosis_records?on_conflict=diagnosis_id");
    if (!databaseAvailable) throw new Error("local_database_outage");
    dbWrites += 1;
    await upsertRow(db, JSON.parse(options.body), options.headers.Prefer.includes("ignore-duplicates"));
    return { ok: true, status: 201, text: async () => "" };
  };
  const save = createHandler({ fetchImpl, getStoreImpl: () => memoryStore, env });
  const invalidRecord = { ...record, precisionData: structuredClone(record.precisionData) };
  invalidRecord.precisionData.result.relatedMuscleIds.push(picked.related[0]);
  const invalid = await save({ httpMethod: "POST",
    body: JSON.stringify({ mode: "auto", record: invalidRecord }) });
  assert.equal(invalid.statusCode, 400);
  assert.equal(blobWrites, 0);
  assert.equal(dbWrites, 0);
  const fallback = await save({ httpMethod: "POST", body: JSON.stringify({ mode: "auto", record }) });
  assert.equal(fallback.statusCode, 202);
  assert.equal(JSON.parse(fallback.body).pendingSync, true);
  assert.equal(blobWrites, 1);
  assert.equal(dbWrites, 0);
  assert.equal(diagnosisKeys().length, 1);
  const key = diagnosisKeys()[0];
  const entry = pending.get(key);
  assert(key.startsWith(fallbackBlobKey(record.diagnosisId).slice(0, 74)));
  const payload = JSON.parse(entry.value);
  validatePendingRecord(payload, key);
  assert.deepEqual(payload.precision_data, example.dto);
  assert.equal(payload.symptom_score, null);
  assert.deepEqual(payload.candidate_muscles, record.candidateMuscles);
  assert(!entry.value.includes(env.SUPABASE_SERVICE_ROLE_KEY));
  assert(!entry.value.includes(env.DIAGNOSIS_SYNC_SECRET));
  assert.equal((await db.query("select count(*)::int as count from public.anonymous_diagnosis_records")).rows[0].count, 0);

  databaseAvailable = true;
  const sync = createSyncHandler({ fetchImpl, getStoreImpl: () => memoryStore, env });
  const scheduled = createScheduledHandler({ env, sync });
  assert.equal((await scheduled()).status, 204);
  assert.equal(diagnosisKeys().length, 0);
  const rows = (await db.query(`select diagnosis_id, diagnosis_version, body_part, symptom_score,
    candidate_muscles, precision_data from public.anonymous_diagnosis_records`)).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].diagnosis_version, "sole_precision_v1");
  assert.equal(rows[0].body_part, "sole");
  assert.equal(rows[0].symptom_score, null);
  assert.deepEqual(rows[0].precision_data, example.dto);
  assert.equal(rows[0].precision_data.result.relatedMuscleIds.length, picked.related.length);
  const hydrated = Persistence.hydratePrecisionHistory(rows[0], names);
  assert.deepEqual(hydrated.topMuscles.filter(({ displayGroup }) => displayGroup === "Related")
    .map(({ muscleId }) => muscleId), picked.related);
  assert(!/NaN|undefined|0点/.test(JSON.stringify(hydrated)));
  const rollup = async () => (await db.query(`select sum(diagnosis_count)::int as diagnoses,
    sum(symptom_score_count)::int as scored, sum(symptom_score_sum)::int as score_sum
    from public.anonymous_diagnosis_daily_rollups
    where dimension = 'body_part' and label = 'sole'`)).rows[0];
  assert.deepEqual(await rollup(), { diagnoses: 1, scored: 0, score_sum: 0 });
  assert.equal((await db.query("select count(*)::int as count from public.anonymous_diagnosis_records where symptom_score = 0")).rows[0].count, 0);
  assert.equal((await scheduled()).status, 204);
  assert.equal(dbWrites, 1);
  const replay = await save({ httpMethod: "POST", body: JSON.stringify({ mode: "auto", record }) });
  assert.equal(replay.statusCode, 202);
  assert.equal((await db.query("select count(*)::int as count from public.anonymous_diagnosis_records")).rows[0].count, 1);
  assert.deepEqual(await rollup(), { diagnoses: 1, scored: 0, score_sum: 0 });
  const gateOff = createHandler({ fetchImpl, getStoreImpl: () => memoryStore,
    env: { ...env, PRECISION_PERSISTENCE_ENABLED: "false" } });
  assert.equal((await gateOff({ httpMethod: "POST",
    body: JSON.stringify({ mode: "auto", record }) })).statusCode, 503);
  assert.equal(blobWrites, 1);
  console.log(JSON.stringify({ v1Parts: v1Fixtures.length, v1SemanticDiff: 0,
    soleCases: cases.length, soleStatus: design.summary.status, benchmarks: design.benchmarks.length,
    maxBytes, relatedSixPlus: cases.filter(({ item }) => item.related.length >= 6).length,
    relatedHydrated: cases.length, blobWrites, dbRows: 1, scoreZeroRows: 0,
    rollup: await rollup(), fallback: true, scheduledSync: true, replay: true, gateOff: true }, null, 2));
} finally {
  await db.close();
}
