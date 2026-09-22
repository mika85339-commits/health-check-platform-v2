const DEFAULT_TABLE = "anonymous_diagnosis_records";
const LEGACY_TABLE = "community_insights";

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

function legacyRecord(record) {
  return {
    area: ["首肩", "腰臀部", "下肢"].includes(record.body_part_group) ? record.body_part_group : "首肩",
    result_type: `${record.body_part}の筋肉負担タイプ`,
    burden_score: record.symptom_score,
    main_tendency: record.candidate_muscles[0] || record.body_part,
    pain_score: record.symptom_score,
    mobility_score: 0,
    stiffness_score: 0,
    duration: record.symptom_timing,
    lifestyle_tags: [record.body_part, ...record.movements].slice(0, 8),
    created_at: record.diagnosis_date
  };
}

async function supabaseRequest(path, options, env = process.env) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey) return { configured: false, ok: false, status: 0, text: "" };
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
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

async function saveRecord(record, mode = "auto", env = process.env) {
  const table = env.ANONYMOUS_DIAGNOSIS_RECORDS_TABLE || DEFAULT_TABLE;
  const canonical = await supabaseRequest(`${table}?on_conflict=diagnosis_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(record)
  }, env);

  if (!canonical.configured) return { stored: false, storage: "server_log" };
  if (canonical.ok) return { stored: true, storage: "anonymous_diagnosis_records" };

  const schemaMissing = canonical.status === 404 || /42P01|does not exist|schema cache/i.test(canonical.text);
  if (!schemaMissing || mode !== "auto") throw new Error(schemaMissing ? "body_platform_migration_required" : "anonymous_record_insert_failed");

  const legacy = await supabaseRequest(LEGACY_TABLE, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(legacyRecord(record))
  }, env);
  if (!legacy.ok) throw new Error("legacy_community_insert_failed");
  return { stored: true, storage: "community_insights_legacy" };
}

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
  try {
    const body = JSON.parse(event.body || "{}");
    const record = sanitizeRecord(body.record || body);
    const result = await saveRecord(record, body.mode === "confirm" ? "confirm" : "auto");
    return json(202, { ok: true, ...result });
  } catch (error) {
    console.error("Anonymous diagnosis record failed.", {
      name: error.name,
      message: error.message,
      code: error.code || ""
    });
    return json(202, { ok: false, stored: false, error: "record_unavailable" });
  }
}

exports.handler = handler;
exports.sanitizeRecord = sanitizeRecord;
exports.legacyRecord = legacyRecord;
exports.saveRecord = saveRecord;
