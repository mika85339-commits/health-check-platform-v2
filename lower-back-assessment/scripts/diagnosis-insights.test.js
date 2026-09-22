const assert = require("assert");

function memoryStore(initial = null) {
  let value = initial;
  return {
    async get() { return value; },
    async setJSON(_key, next) { value = next; return { modified: true }; },
    async delete() { value = null; }
  };
}

async function run() {
  const { createHandler } = await import("../netlify/functions/diagnosis-insights.mjs");
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
    ANONYMOUS_INSIGHTS_MIN_CELL_SIZE: "5"
  };
  const aggregate = {
    available: true,
    total_count: 24,
    body_part: [{ label: "knee", diagnosis_count: 12 }, { label: "hip", diagnosis_count: 9 }],
    joint: [],
    age_band: [],
    region: [],
    sex: [],
    movement: [],
    daily: [],
    weekly: [],
    monthly: []
  };
  let fetchCalls = 0;
  const store = memoryStore();
  const handler = createHandler({
    env,
    getStoreImpl: () => store,
    fetchImpl: async (url, options) => {
      fetchCalls += 1;
      assert.match(url, /rpc\/health_check_lab_insights$/);
      assert.equal(options.method, "POST");
      assert.equal(JSON.parse(options.body).p_min_cell_size, 10, "privacy threshold cannot be configured below 10");
      return { ok: true, status: 200, text: async () => JSON.stringify(aggregate) };
    }
  });
  const first = await handler({ httpMethod: "GET" });
  assert.equal(first.statusCode, 200);
  assert.equal(JSON.parse(first.body).total_count, 24);
  assert.equal(JSON.parse(first.body).body_part.length, 1, "cells below 10 are suppressed at the API boundary");
  assert.equal(fetchCalls, 1);

  const second = await handler({ httpMethod: "GET" });
  assert.equal(second.statusCode, 200);
  assert.equal(fetchCalls, 1, "fresh aggregate cache prevents repeated database aggregation");

  const unavailable = await createHandler({
    env: {},
    getStoreImpl: () => memoryStore(),
    fetchImpl: async () => { throw new Error("must not fetch"); }
  })({ httpMethod: "GET" });
  assert.equal(unavailable.statusCode, 200);
  assert.equal(JSON.parse(unavailable.body).available, false);

  const rejected = await handler({ httpMethod: "POST" });
  assert.equal(rejected.statusCode, 405);
  console.log("Anonymous diagnosis insight checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
