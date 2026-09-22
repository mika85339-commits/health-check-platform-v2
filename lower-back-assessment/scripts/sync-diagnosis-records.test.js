const assert = require("assert");

const record = {
  diagnosis_id: "diagnosis-sync-test",
  anonymous_device_id: "device-sync-test",
  anonymous_session_id: "session-sync-test",
  diagnosis_version: "test-v1",
  diagnosis_date: "2026-09-22T00:00:00.000Z",
  body_part: "knee",
  body_part_group: "下肢",
  joint_name: "knee",
  left_right: "right",
  symptom_score: 55,
  symptom_duration: "unknown",
  symptom_timing: "middle",
  movements: ["stairs_up"],
  candidate_muscles: ["大腿四頭筋"],
  age_band: "unknown",
  sex: "no_answer",
  region: "no_answer",
  life_impact: "unknown",
  referral_source: "direct",
  repeat_visit: false,
  schema_version: 1
};

async function run() {
  const { blobKey } = await import("../netlify/functions/save-diagnosis-record.mjs");
  const { createHandler } = await import("../netlify/functions/sync-diagnosis-records.mjs");
  const key = blobKey(record.diagnosis_id);
  const blobs = new Map([[key, record]]);
  const diagnosisStore = {
    async list() { return { blobs: [...blobs.keys()].map((blobKeyValue) => ({ key: blobKeyValue, etag: "test" })), directories: [] }; },
    async get(blobKeyValue) { return blobs.get(blobKeyValue) || null; },
    async delete(blobKeyValue) { blobs.delete(blobKeyValue); }
  };
  const cacheStore = { async delete() {} };
  let buildWrites = 0;
  const env = {
    DIAGNOSIS_SYNC_SECRET: "sync-secret",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
  };
  const handler = createHandler({
    env,
    getStoreImpl: (name) => name.includes("insights") ? cacheStore : diagnosisStore,
    fetchImpl: async (_url, options) => {
      buildWrites += 1;
      assert.match(options.headers.Prefer, /resolution=merge-duplicates/);
      return { ok: true, status: 201, text: async () => "" };
    }
  });

  const unauthorized = await handler({ httpMethod: "POST", headers: { authorization: "Bearer wrong" } });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(buildWrites, 0);

  const synced = await handler({ httpMethod: "POST", headers: { authorization: "Bearer sync-secret" } });
  assert.equal(synced.statusCode, 200);
  assert.equal(JSON.parse(synced.body).synced, 1);
  assert.equal(buildWrites, 1);
  assert.equal(blobs.size, 0);

  const repeated = await handler({ httpMethod: "POST", headers: { authorization: "Bearer sync-secret" } });
  assert.equal(repeated.statusCode, 200);
  assert.equal(buildWrites, 1, "already-synced fallback records are not inserted twice");
  console.log("Anonymous diagnosis fallback sync checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
