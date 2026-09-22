const assert = require("assert");
const { saveRecord, handler } = require("../netlify/functions/save-diagnosis-record");

const record = {
  diagnosis_id: "diagnosis-test",
  anonymous_device_id: "device-test",
  anonymous_session_id: "session-test",
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

const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" };

async function run() {
  const originalFetch = global.fetch;
  try {
    let calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 201, text: async () => "" };
    };
    const canonical = await saveRecord(record, "auto", env);
    assert.equal(canonical.storage, "anonymous_diagnosis_records");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /anonymous_diagnosis_records\?on_conflict=diagnosis_id/);
    assert.match(calls[0].options.headers.Prefer, /resolution=merge-duplicates/);

    calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) return { ok: false, status: 404, text: async () => '42P01 relation "anonymous_diagnosis_records" does not exist' };
      return { ok: true, status: 201, text: async () => "" };
    };
    const fallback = await saveRecord(record, "auto", env);
    assert.equal(fallback.storage, "community_insights_legacy");
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /community_insights$/);

    global.fetch = async () => ({ ok: false, status: 404, text: async () => "42P01" });
    await assert.rejects(() => saveRecord(record, "confirm", env), /body_platform_migration_required/);

    const invalid = await handler({ httpMethod: "POST", body: "{}" });
    assert.equal(invalid.statusCode, 202);
    assert.equal(JSON.parse(invalid.body).ok, false);
  } finally {
    global.fetch = originalFetch;
  }
  console.log("Anonymous diagnosis save checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
