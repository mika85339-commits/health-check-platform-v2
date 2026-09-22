import crypto from "node:crypto";
import { withLambda } from "@netlify/aws-lambda-compat";
import { getStore } from "@netlify/blobs";

const DEFAULT_TABLE = "anonymous_diagnosis_records";
const FALLBACK_STORE = "health-check-lab-anonymous-diagnoses";
const INSIGHTS_CACHE_STORE = "health-check-lab-anonymous-insights";
const INSIGHTS_CACHE_KEY = "dashboard-v1";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function safeString(value, max = 120, fallback = "") {
  const text = String(value == null ? "" : value).trim().slice(0, max);
  return text || fallback;
}

function safeArray(value, maxItems = 8, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => safeString(item, maxLength)).filter(Boolean);
}

function safeScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function sanitizeRecord(input) {
  const record = {
    diagnosis_id: safeString(input.diagnosisId, 100),
    anonymous_device_id: safeString(input.anonymousDeviceId, 100),
    anonymous_session_id: safeString(input.anonymousSessionId, 100),
    diagnosis_version: safeString(input.diagnosisVersion, 80, "unknown"),
    diagnosis_date: safeString(input.diagnosisDate, 40, new Date().toISOString()),
    body_part: safeString(input.bodyPart, 40, "unknown"),
    body_part_group: safeString(input.bodyPartGroup, 40, "未分類"),
    joint_name: safeString(input.joint, 40, "other"),
    left_right: safeString(input.leftRight, 30, "unknown"),
    symptom_score: safeScore(input.symptomScore),
    symptom_duration: safeString(input.symptomDuration, 40, "unknown"),
    symptom_timing: safeString(input.symptomTiming, 40, "unknown"),
    movements: safeArray(input.movements),
    candidate_muscles: safeArray(input.candidateMuscles, 5),
    age_band: safeString(input.ageBand, 30, "unknown"),
    sex: safeString(input.sex, 30, "no_answer"),
    region: safeString(input.region, 40, "no_answer"),
    life_impact: safeString(input.lifeImpact, 30, "unknown"),
    referral_source: safeString(input.referralSource, 60, "direct"),
    repeat_visit: Boolean(input.repeatVisit),
    schema_version: 1,
    updated_at: new Date().toISOString()
  };
  if (!record.diagnosis_id || !record.anonymous_device_id) throw new Error("missing_anonymous_identity");
  return record;
}

async function supabaseRequest(path, options, env = process.env, fetchImpl = (...args) => fetch(...args)) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { configured: false, ok: false, status: 0, text: "" };
  const response = await fetchImpl(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  return { configured: true, ok: response.ok, status: response.status, text: await response.text() };
}

async function saveRecord(record, env = process.env, fetchImpl) {
  const table = env.ANONYMOUS_DIAGNOSIS_RECORDS_TABLE || DEFAULT_TABLE;
  const canonical = await supabaseRequest(`${table}?on_conflict=diagnosis_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(record)
  }, env, fetchImpl);

  if (!canonical.configured) throw new Error("supabase_not_configured");
  if (canonical.ok) return { stored: true, storage: "anonymous_diagnosis_records" };

  const schemaMissing = canonical.status === 404 || /42P01|PGRST205|does not exist|schema cache/i.test(canonical.text);
  throw new Error(schemaMissing ? "body_platform_migration_required" : "anonymous_record_insert_failed");
}

function blobKey(diagnosisId) {
  return `diagnosis-${crypto.createHash("sha256").update(diagnosisId).digest("hex")}`;
}

async function saveBlobRecord(record, getStoreImpl = getStore) {
  const store = getStoreImpl(FALLBACK_STORE);
  await store.set(blobKey(record.diagnosis_id), JSON.stringify(record), {
    metadata: { schemaVersion: 1, bodyPart: record.body_part, diagnosisDate: record.diagnosis_date }
  });
  return { stored: true, storage: "netlify_blobs_fallback" };
}

async function clearFallbackRecord(record, getStoreImpl = getStore) {
  try {
    await getStoreImpl(FALLBACK_STORE).delete(blobKey(record.diagnosis_id));
  } catch (error) {
    console.warn("Anonymous diagnosis fallback cleanup deferred.", errorDetails(error));
  }
}

async function invalidateInsightsCache(getStoreImpl = getStore) {
  try {
    await getStoreImpl(INSIGHTS_CACHE_STORE).delete(INSIGHTS_CACHE_KEY);
  } catch (error) {
    console.warn("Anonymous insight cache invalidation deferred.", errorDetails(error));
  }
}

function errorDetails(error) {
  return {
    name: typeof error?.name === "string" ? error.name : "Error",
    message: typeof error?.message === "string" ? error.message : "Unknown error",
    code: error?.code === undefined ? "" : String(error.code)
  };
}

function createHandler({ fetchImpl = (...args) => fetch(...args), getStoreImpl = getStore, env = process.env } = {}) {
  return async function handler(event) {
    if (event.httpMethod === "OPTIONS") return json(204, {});
    if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

    let record;
    try {
      const body = JSON.parse(event.body || "{}");
      record = sanitizeRecord(body.record || body);
      const result = await saveRecord(record, env, fetchImpl);
      await Promise.all([
        clearFallbackRecord(record, getStoreImpl),
        invalidateInsightsCache(getStoreImpl)
      ]);
      return json(202, { ok: true, ...result });
    } catch (primaryError) {
      if (!record) {
        console.error("Anonymous diagnosis record rejected.", errorDetails(primaryError));
        return json(202, { ok: false, stored: false, error: "record_unavailable" });
      }
      try {
        const fallback = await saveBlobRecord(record, getStoreImpl);
        console.warn("Anonymous diagnosis used durable fallback.", errorDetails(primaryError));
        return json(202, { ok: true, ...fallback });
      } catch (fallbackError) {
        console.error("Anonymous diagnosis storage failed.", {
          primary: errorDetails(primaryError),
          fallback: errorDetails(fallbackError)
        });
        return json(202, { ok: false, stored: false, error: "record_unavailable" });
      }
    }
  };
}

const lambdaHandler = createHandler();

export default withLambda(lambdaHandler);
export {
  DEFAULT_TABLE,
  FALLBACK_STORE,
  INSIGHTS_CACHE_KEY,
  INSIGHTS_CACHE_STORE,
  blobKey,
  clearFallbackRecord,
  createHandler,
  errorDetails,
  invalidateInsightsCache,
  sanitizeRecord,
  saveBlobRecord,
  saveRecord,
  supabaseRequest
};
