import { withLambda } from "@netlify/aws-lambda-compat";
import { getStore } from "@netlify/blobs";
import { INSIGHTS_CACHE_KEY, INSIGHTS_CACHE_STORE, supabaseRequest } from "./save-diagnosis-record.mjs";

const DEFAULT_CACHE_SECONDS = 15 * 60;
const DEFAULT_MIN_CELL_SIZE = 10;

function json(statusCode, body, cacheControl = "no-store") {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl
    },
    body: JSON.stringify(body)
  };
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function safeError(error) {
  return {
    name: typeof error?.name === "string" ? error.name : "Error",
    message: typeof error?.message === "string" ? error.message : "Unknown error",
    code: error?.code === undefined ? "" : String(error.code)
  };
}

function isFresh(snapshot, now, cacheSeconds) {
  const generatedAt = Date.parse(snapshot?.generated_at || "");
  return Number.isFinite(generatedAt) && now - generatedAt < cacheSeconds * 1000;
}

function enforcePrivacy(data, minimum) {
  const listKeys = ["body_part", "joint", "age_band", "region", "sex", "movement", "daily", "weekly", "monthly"];
  const safe = { ...data };
  listKeys.forEach((key) => {
    safe[key] = (Array.isArray(data?.[key]) ? data[key] : [])
      .filter((item) => Number(item?.diagnosis_count || 0) >= minimum);
  });
  const total = Number(data?.total_count || 0);
  safe.total_count = total >= minimum ? total : 0;
  safe.available = Boolean(data?.available) && total >= minimum;
  safe.min_cell_size = minimum;
  return safe;
}

async function fetchInsights(env, fetchImpl) {
  const minimum = boundedInteger(env.ANONYMOUS_INSIGHTS_MIN_CELL_SIZE, DEFAULT_MIN_CELL_SIZE, DEFAULT_MIN_CELL_SIZE, 100);
  const response = await supabaseRequest("rpc/health_check_lab_insights", {
    method: "POST",
    body: JSON.stringify({
      p_from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      p_min_cell_size: minimum
    })
  }, env, fetchImpl);
  if (!response.configured) throw new Error("supabase_not_configured");
  if (!response.ok) {
    const error = new Error(response.status === 404 ? "body_platform_migration_required" : "insights_query_failed");
    error.code = String(response.status);
    throw error;
  }
  const parsed = enforcePrivacy(JSON.parse(response.text || "{}"), minimum);
  return {
    ...parsed,
    source: "health_check_lab_users",
    scope_label: "Health Check Lab利用者の匿名集計",
    generated_at: new Date().toISOString(),
    stale: false
  };
}

function createHandler({
  fetchImpl = (...args) => fetch(...args),
  getStoreImpl = getStore,
  now = () => Date.now(),
  env = process.env
} = {}) {
  return async function handler(event) {
    if (event.httpMethod !== "GET") return json(405, { error: "GET only" });
    const cacheSeconds = boundedInteger(env.ANONYMOUS_INSIGHTS_CACHE_SECONDS, DEFAULT_CACHE_SECONDS, 60, 86400);
    let store;
    let cached = null;
    try {
      store = getStoreImpl(INSIGHTS_CACHE_STORE);
      cached = await store.get(INSIGHTS_CACHE_KEY, { type: "json", consistency: "strong" });
      if (isFresh(cached, now(), cacheSeconds)) {
        return json(200, cached, "public, max-age=300, stale-while-revalidate=3600");
      }
    } catch (error) {
      console.warn("Anonymous insight cache read failed.", safeError(error));
    }

    try {
      const insights = await fetchInsights(env, fetchImpl);
      if (store) {
        try {
          await store.setJSON(INSIGHTS_CACHE_KEY, insights, { metadata: { generatedAt: insights.generated_at, schemaVersion: 1 } });
        } catch (error) {
          console.warn("Anonymous insight cache write failed.", safeError(error));
        }
      }
      return json(200, insights, "public, max-age=300, stale-while-revalidate=3600");
    } catch (error) {
      console.warn("Anonymous insight query unavailable.", safeError(error));
      if (cached) {
        return json(200, { ...cached, stale: true }, "public, max-age=60, stale-while-revalidate=3600");
      }
      return json(200, {
        available: false,
        source: "health_check_lab_users",
        scope_label: "Health Check Lab利用者の匿名集計",
        rows: [],
        reason: "aggregate_temporarily_unavailable"
      }, "public, max-age=60");
    }
  };
}

const lambdaHandler = createHandler();

export default withLambda(lambdaHandler);
export { createHandler, enforcePrivacy, fetchInsights, isFresh };
