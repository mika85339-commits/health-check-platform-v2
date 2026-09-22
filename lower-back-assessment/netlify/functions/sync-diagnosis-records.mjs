import crypto from "node:crypto";
import { withLambda } from "@netlify/aws-lambda-compat";
import { getStore } from "@netlify/blobs";
import {
  FALLBACK_STORE,
  invalidateInsightsCache,
  saveRecord
} from "./save-diagnosis-record.mjs";

const MAX_BATCH_SIZE = 100;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}

function safeEqual(actual, expected) {
  const left = Buffer.from(String(actual || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function bearerToken(event) {
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function safeError(error) {
  return {
    name: typeof error?.name === "string" ? error.name : "Error",
    message: typeof error?.message === "string" ? error.message : "Unknown error",
    code: error?.code === undefined ? "" : String(error.code)
  };
}

function createHandler({
  fetchImpl = (...args) => fetch(...args),
  getStoreImpl = getStore,
  env = process.env
} = {}) {
  return async function handler(event) {
    if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
    if (!env.DIAGNOSIS_SYNC_SECRET) return json(503, { error: "sync_not_configured" });
    if (!safeEqual(bearerToken(event), env.DIAGNOSIS_SYNC_SECRET)) return json(401, { error: "unauthorized" });
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json(503, { error: "supabase_not_configured" });

    const store = getStoreImpl(FALLBACK_STORE);
    let listed;
    try {
      listed = await store.list({ prefix: "diagnosis-" });
    } catch (error) {
      console.error("Anonymous diagnosis sync list failed.", safeError(error));
      return json(503, { error: "fallback_list_unavailable" });
    }

    const batch = listed.blobs.slice(0, MAX_BATCH_SIZE);
    let synced = 0;
    const failed = [];
    for (const blob of batch) {
      try {
        const record = await store.get(blob.key, { type: "json", consistency: "strong" });
        if (!record) throw new Error("fallback_record_missing");
        await saveRecord(record, env, fetchImpl);
        await store.delete(blob.key);
        synced += 1;
      } catch (error) {
        failed.push(blob.key);
        console.error("Anonymous diagnosis sync item failed.", { key: blob.key, ...safeError(error) });
      }
    }

    if (synced) await invalidateInsightsCache(getStoreImpl);
    return json(failed.length ? 207 : 200, {
      ok: failed.length === 0,
      synced,
      failed: failed.length,
      has_more: listed.blobs.length > batch.length
    });
  };
}

const lambdaHandler = createHandler();

export default withLambda(lambdaHandler);
export { MAX_BATCH_SIZE, bearerToken, createHandler, safeEqual };
