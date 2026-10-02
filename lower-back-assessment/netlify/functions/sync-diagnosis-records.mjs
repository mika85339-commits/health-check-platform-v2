import crypto from "node:crypto";
import { withLambda } from "@netlify/aws-lambda-compat";
import { getStore } from "@netlify/blobs";
import PrecisionPersistence from "../../precision-persistence.js";
import {
  FALLBACK_STORE,
  blobKey,
  invalidateInsightsCache,
  saveRecord
} from "./save-diagnosis-record.mjs";

const MAX_BATCH_SIZE = 100;
const MAX_TRANSIENT_ATTEMPTS = 30;
const MAX_RUN_MS = 20000;
const BLOB_TIMEOUT_MS = 2500;
const FETCH_TIMEOUT_MS = 3000;
const RESPONSE_RESERVE_MS = 500;
const STATUS_PAGE_SIZE = 20;
const CURSOR_KEY = "sync-cursor-v1";

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

function validatePendingRecord(record, key) {
  if (!record || typeof record !== "object" || Array.isArray(record) ||
      typeof record.diagnosis_id !== "string" || !record.diagnosis_id ||
      typeof record.anonymous_device_id !== "string" || !record.anonymous_device_id ||
      record.schema_version !== 1) throw new Error("invalid_pending_record");
  const originalKey = key.startsWith("quarantine-") ? `diagnosis-${key.slice("quarantine-".length)}` : key;
  const prefix = blobKey(record.diagnosis_id);
  if (originalKey !== prefix && !originalKey.startsWith(`${prefix}-`)) {
    throw new Error("pending_key_mismatch");
  }
  if (record.precision_data != null) {
    if (record.symptom_score !== null) throw new Error("invalid_pending_record");
    PrecisionPersistence.validatePrecisionData(record.precision_data, record.body_part, record.diagnosis_version);
  } else if (PrecisionPersistence.isPrecisionVersion(record.diagnosis_version) ||
      !Number.isInteger(record.symptom_score) || record.symptom_score < 0 || record.symptom_score > 100) {
    throw new Error("invalid_pending_record");
  }
}

function failureClass(error, status) {
  if (["invalid_pending_record", "pending_key_mismatch"].includes(error?.message) ||
      String(error?.message || "").startsWith("invalid_precision_data")) return "validation";
  if (["precision_schema_unavailable", "body_platform_migration_required"].includes(error?.message) ||
      status === 404) return "schema";
  if (["precision_persistence_disabled", "supabase_not_configured"].includes(error?.message) ||
      status === 401 || status === 403) return "configuration";
  if (status >= 400 && status < 500 && ![408, 429].includes(status)) return "validation";
  return "transient";
}

function orderedBatch(blobs, cursor, limit) {
  const ordered = [...blobs].sort((a, b) => b.key.localeCompare(a.key));
  const start = ordered.findIndex(({ key }) => key < cursor);
  const from = start < 0 ? 0 : start;
  return [...ordered.slice(from), ...ordered.slice(0, from)].slice(0, limit);
}

function quarantineReason(category) {
  return {
    validation: "validation_failure",
    schema: "schema_mismatch",
    transient: "transient_retry_exhausted"
  }[category] || "unexpected_sync_failure";
}

async function quarantineRecord(store, blob, entry, category, now, retryCount, runBlob) {
  const key = `quarantine-${blob.key.slice("diagnosis-".length)}`;
  const metadata = {
    state: "quarantined",
    diagnosisId: typeof entry.data?.diagnosis_id === "string" ? entry.data.diagnosis_id : null,
    diagnosisVersion: typeof entry.data?.diagnosis_version === "string" ? entry.data.diagnosis_version : null,
    retryCount,
    lastFailureAt: now.toISOString(),
    lastFailureReasonCode: quarantineReason(category),
    lastFailureClass: category,
    sourceBlobKey: blob.key
  };
  await runBlob((signal) => store.set(key, JSON.stringify(entry.data), {
    onlyIfNew: true,
    metadata,
    signal
  }));
  await runBlob((signal) => store.delete(blob.key, { signal }));
}

async function deferRecord(store, blob, entry, now, runBlob) {
  const attempts = Number.isInteger(entry.metadata?.syncAttempts) ? entry.metadata.syncAttempts : 0;
  if (attempts + 1 >= MAX_TRANSIENT_ATTEMPTS) {
    await quarantineRecord(store, blob, entry, "transient", now, attempts + 1, runBlob);
    return "quarantined";
  }
  if (!entry.etag) throw new Error("fallback_etag_missing");
  const result = await runBlob((signal) => store.set(blob.key, JSON.stringify(entry.data), {
    onlyIfMatch: entry.etag,
    metadata: { ...entry.metadata, syncAttempts: attempts + 1, lastAttemptAt: now.toISOString(),
      lastFailureReasonCode: "transient_io_failure", lastFailureClass: "transient" },
    signal
  }));
  return result?.modified === false ? "concurrent_change" : "deferred";
}

async function readPendingEntry(store, key, runBlob) {
  try {
    return await runBlob((signal) =>
      store.getWithMetadata(key, { type: "json", consistency: "strong", signal }));
  } catch (error) {
    if (["sync_blob_timeout", "sync_deadline_reached"].includes(error?.message)) throw error;
    const raw = await runBlob((signal) =>
      store.getWithMetadata(key, { type: "text", consistency: "strong", signal }));
    if (!raw) return null;
    try { return { ...raw, data: JSON.parse(raw.data) }; }
    catch { return { ...raw, data: raw.data }; }
  }
}

function createHandler({
  fetchImpl = (...args) => fetch(...args),
  blobFetchImpl = (...args) => fetch(...args),
  getStoreImpl = getStore,
  env = process.env,
  now = () => new Date(),
  runBudgetMs = MAX_RUN_MS,
  blobTimeoutMs = BLOB_TIMEOUT_MS,
  dbTimeoutMs = FETCH_TIMEOUT_MS,
  responseReserveMs = RESPONSE_RESERVE_MS
} = {}) {
  return async function handler(event) {
    const startedAt = Number.isFinite(event.syncStartedAt) ?
      Math.min(event.syncStartedAt, Date.now()) : Date.now();
    const deadline = startedAt + runBudgetMs;
    if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
    if (!env.DIAGNOSIS_SYNC_SECRET) return json(503, { error: "sync_not_configured" });
    if (!safeEqual(bearerToken(event), env.DIAGNOSIS_SYNC_SECRET)) return json(401, { error: "unauthorized" });
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json(503, { error: "supabase_not_configured" });

    const replayQuarantine = event.queryStringParameters?.replay === "quarantine";
    const statusMode = event.queryStringParameters?.mode === "status";
    let request = {};
    if (event.body && Buffer.byteLength(event.body, "utf8") > 1024) {
      return json(400, { error: "invalid_request" });
    }
    if (event.body) {
      try { request = JSON.parse(event.body); }
      catch { return json(400, { error: "invalid_request" }); }
      if (!request || typeof request !== "object" || Array.isArray(request)) {
        return json(400, { error: "invalid_request" });
      }
    }
    const targetId = request.diagnosisId;
    if (targetId !== undefined && (!replayQuarantine || typeof targetId !== "string" ||
        targetId.length < 1 || targetId.length > 200)) {
      return json(400, { error: "invalid_diagnosis_id" });
    }
    const limit = request.limit === undefined ? (statusMode ? STATUS_PAGE_SIZE : MAX_BATCH_SIZE) : request.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH_SIZE) {
      return json(400, { error: "invalid_limit" });
    }
    const offset = request.offset === undefined ? 0 : request.offset;
    if (!Number.isSafeInteger(offset) || offset < 0 || (!statusMode && offset !== 0)) {
      return json(400, { error: "invalid_offset" });
    }
    const prefix = replayQuarantine ? "quarantine-" : "diagnosis-";
    let activeSignal;
    // The installed Blobs SDK accepts a custom fetch but no signal on Store methods.
    // Returning 408 on abort/5xx prevents its internal unbounded retry sleeps.
    const boundedBlobFetch = async (url, options = {}) => {
      if (!activeSignal || activeSignal.aborted) return new Response(null, { status: 408 });
      try {
        const signal = options.signal ?
          AbortSignal.any([activeSignal, options.signal]) : activeSignal;
        const response = await blobFetchImpl(url, { ...options, signal });
        return response.status === 429 || response.status >= 500 ?
          new Response(null, { status: 408 }) : response;
      } catch {
        return new Response(null, { status: 408 });
      }
    };
    const store = getStoreImpl(FALLBACK_STORE, { fetch: boundedBlobFetch });
    const runBlob = async (operation) => {
      const remaining = deadline - Date.now() - responseReserveMs;
      if (remaining <= 0) throw new Error("sync_deadline_reached");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(blobTimeoutMs, remaining));
      activeSignal = controller.signal;
      try { return await operation(controller.signal); }
      catch (error) {
        if (controller.signal.aborted) throw new Error("sync_blob_timeout");
        throw error;
      }
      finally {
        clearTimeout(timer);
        activeSignal = undefined;
      }
    };
    if (statusMode) {
      try {
        const listed = await runBlob((signal) => store.list({ prefix: "quarantine-", signal }));
        const selected = listed.blobs.sort((a, b) => a.key.localeCompare(b.key))
          .slice(offset, offset + limit);
        const items = [];
        for (const blob of selected) {
          if (deadline - Date.now() < blobTimeoutMs + responseReserveMs) break;
          const entry = await readPendingEntry(store, blob.key, runBlob);
          const metadata = entry?.metadata || {};
          items.push({
            diagnosisId: metadata.diagnosisId ?? entry?.data?.diagnosis_id ?? null,
            state: "quarantined",
            reasonCode: metadata.lastFailureReasonCode ?? metadata.reason ?? "unknown",
            retryCount: metadata.retryCount ?? metadata.syncAttempts ?? null,
            lastFailureAt: metadata.lastFailureAt ?? metadata.quarantinedAt ?? null,
            sourceBlobKey: metadata.sourceBlobKey ?? blob.key
          });
        }
        const nextOffset = offset + items.length;
        return json(200, { quarantinedCount: listed.blobs.length, items,
          nextOffset: nextOffset < listed.blobs.length ? nextOffset : null });
      } catch {
        return json(503, { error: "quarantine_status_unavailable" });
      }
    }
    let listed;
    try {
      listed = await runBlob((signal) => store.list({ prefix, signal }));
    } catch {
      console.error("Anonymous diagnosis sync list failed.", { category: "blob_read" });
      return json(503, { error: "fallback_list_unavailable" });
    }

    let cursor = "";
    if (!replayQuarantine && listed.blobs.length) {
      try {
        cursor = await runBlob((signal) =>
          store.get(CURSOR_KEY, { type: "text", consistency: "strong", signal })) || "";
      } catch {
        return json(503, { error: "sync_cursor_unavailable" });
      }
    }
    const eligible = targetId === undefined ? listed.blobs : listed.blobs.filter(({ key }) =>
      key === `quarantine-${blobKey(targetId).slice("diagnosis-".length)}` ||
      key.startsWith(`quarantine-${blobKey(targetId).slice("diagnosis-".length)}-`));
    if (targetId !== undefined && eligible.length === 0) {
      return json(404, { error: "quarantined_record_not_found" });
    }
    const batch = orderedBatch(eligible, cursor, limit);
    const counts = { synced: 0, quarantined: 0, deferred: 0, read_failed: 0, failed: 0, unresolved: 0 };
    let lastKey = "";
    let stoppedEarly = false;
    let processed = 0;
    for (const blob of batch) {
      if (deadline - Date.now() < blobTimeoutMs * 3 + dbTimeoutMs + responseReserveMs) {
        stoppedEarly = true;
        break;
      }
      processed += 1;
      lastKey = blob.key;
      let entry;
      try {
        entry = await readPendingEntry(store, blob.key, runBlob);
      } catch {
        counts.read_failed += 1;
        counts.unresolved += 1;
        console.error("Anonymous diagnosis sync item failed.", { category: "blob_read" });
        continue;
      }
      if (!entry) continue;
      let status = 0;
      let saved = false;
      try {
        validatePendingRecord(entry.data, blob.key);
        await saveRecord(entry.data, env, async (...args) => {
          const remaining = deadline - Date.now() - responseReserveMs;
          if (remaining <= 0) throw new Error("sync_deadline_reached");
          const response = await fetchImpl(args[0], {
            ...args[1], signal: AbortSignal.timeout(Math.min(dbTimeoutMs, remaining))
          });
          status = response.status;
          return response;
        }, { replay: true });
        saved = true;
        if (deadline - Date.now() < blobTimeoutMs * 2 + responseReserveMs) {
          throw new Error("sync_deadline_reached");
        }
        await runBlob((signal) => store.delete(blob.key, { signal }));
        if (deadline - Date.now() < blobTimeoutMs + responseReserveMs) {
          throw new Error("sync_deadline_reached");
        }
        const remaining = await runBlob((signal) =>
          store.getMetadata(blob.key, { consistency: "strong", signal }));
        if (remaining !== null) throw new Error("sync_delete_unconfirmed");
        counts.synced += 1;
      } catch (error) {
        if (saved) {
          counts.unresolved += 1;
          if (error?.message === "sync_deadline_reached") counts.deferred += 1;
          else counts.failed += 1;
          console.error("Anonymous diagnosis sync item failed.", { category: "blob_delete_unconfirmed" });
          stoppedEarly = true;
          break;
        }
        if (error?.message === "sync_deadline_reached") {
          counts.deferred += 1;
          counts.unresolved += 1;
          stoppedEarly = true;
          break;
        }
        const category = failureClass(error, status);
        try {
          if (!replayQuarantine && ["validation", "schema"].includes(category)) {
            await quarantineRecord(store, blob, entry, category, now(),
              Number.isInteger(entry.metadata?.syncAttempts) ? entry.metadata.syncAttempts : 0, runBlob);
            counts.quarantined += 1;
          } else if (!replayQuarantine && category === "transient") {
            const outcome = await deferRecord(store, blob, entry, now(), runBlob);
            if (outcome === "quarantined") counts.quarantined += 1;
            else { counts.deferred += 1; counts.unresolved += 1; }
          } else {
            counts.failed += 1;
            counts.unresolved += 1;
          }
        } catch {
          counts.failed += 1;
          counts.unresolved += 1;
          console.error("Anonymous diagnosis sync recovery failed.", { category: "blob_write" });
        }
        console.error("Anonymous diagnosis sync item failed.", { category });
        if (["configuration", "transient"].includes(category)) { stoppedEarly = true; break; }
      }
    }
    counts.unresolved += eligible.length - processed;

    if (!replayQuarantine && lastKey) {
      try { await runBlob((signal) => store.set(CURSOR_KEY, lastKey, { signal })); }
      catch { counts.failed += 1; console.error("Anonymous diagnosis sync cursor failed."); }
    }
    if (counts.synced) {
      await invalidateInsightsCache((name) => {
        const cacheStore = getStoreImpl(name, { fetch: boundedBlobFetch });
        return { delete: (key) => runBlob((signal) => cacheStore.delete(key, { signal })) };
      });
    }
    // Blobs list is eventually consistent; these counts are observations, not delete confirmation.
    let pendingAfter;
    let quarantineAfter;
    try {
      pendingAfter = !replayQuarantine && listed.blobs.length === 0 ? 0 :
        (await runBlob((signal) => store.list({ prefix: "diagnosis-", signal }))).blobs.length;
    } catch {
      pendingAfter = null;
    }
    try {
      quarantineAfter = (await runBlob((signal) => store.list({ prefix: "quarantine-", signal }))).blobs.length;
    } catch {
      quarantineAfter = null;
    }
    const summary = {
      ok: counts.failed === 0 && counts.quarantined === 0 && counts.unresolved === 0 &&
        !stoppedEarly,
      ...counts,
      pending_before: replayQuarantine ? null : listed.blobs.length,
      pending_after: pendingAfter ?? null,
      pending_observed: pendingAfter ?? null,
      quarantine_after: quarantineAfter ?? null,
      has_more: counts.unresolved > 0 || stoppedEarly,
      last_sync: now().toISOString()
    };
    console.log("Anonymous diagnosis sync summary.", summary);
    return json(summary.ok ? 200 : 207, summary);
  };
}

const lambdaHandler = createHandler();

export default withLambda(lambdaHandler);
export { MAX_BATCH_SIZE, MAX_TRANSIENT_ATTEMPTS, bearerToken, createHandler, safeEqual, validatePendingRecord };
