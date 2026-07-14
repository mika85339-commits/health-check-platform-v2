const ALLOWED_EVENTS = new Set([
  "diagnosis_started",
  "step_viewed",
  "option_selected",
  "diagnosis_completed",
  "ai_explanation_clicked",
  "diagnosis_abandoned"
]);

const DEFAULT_TABLE = "muscle_diagnosis_events";

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

function safeString(value, max = 120) {
  return String(value || "").slice(0, max);
}

function safeJson(value, fallback) {
  if (value == null) return fallback;
  const text = JSON.stringify(value).slice(0, 4000);
  return JSON.parse(text);
}

function sanitizeEvent(input) {
  const eventName = safeString(input.eventName, 60);
  if (!ALLOWED_EVENTS.has(eventName)) {
    throw new Error(`Unsupported eventName: ${eventName}`);
  }

  return {
    anonymous_session_id: safeString(input.anonymousSessionId, 80),
    event_name: eventName,
    event_timestamp: input.timestamp || new Date().toISOString(),
    current_step: Number.isFinite(Number(input.currentStep)) ? Number(input.currentStep) : null,
    selected_region: safeString(input.selectedRegion, 80),
    selected_details: safeJson(input.selectedDetails || [], []),
    movements: safeJson(input.movements || [], []),
    timing: safeJson(input.timing || [], []),
    pain_type: safeJson(input.painType || {}, {}),
    results: safeJson(input.results || {}, {}),
    top_muscle: safeString(input.topMuscle, 120),
    used_ai_explanation: Boolean(input.usedAiExplanation),
    diagnosis_version: safeString(input.diagnosisVersion, 80),
    diagnosis_run_id: safeString(input.diagnosisRunId, 80),
    created_at: new Date().toISOString()
  };
}

async function saveToSupabase(record) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const table = process.env.MUSCLE_DIAGNOSIS_EVENTS_TABLE || DEFAULT_TABLE;

  if (!supabaseUrl || !serviceKey) {
    console.log("Analytics event accepted without persistent storage.", {
      event_name: record.event_name,
      current_step: record.current_step,
      selected_region: record.selected_region,
      diagnosis_version: record.diagnosis_version
    });
    return { stored: false, storage: "server_log" };
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(record)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Supabase insert failed.");
  }

  return { stored: true, storage: "supabase" };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

  try {
    const body = JSON.parse(event.body || "{}");
    const record = sanitizeEvent(body);
    const result = await saveToSupabase(record);
    return json(202, { ok: true, ...result });
  } catch (error) {
    console.error("Diagnosis analytics event failed.", error.message);
    return json(202, { ok: false, stored: false });
  }
};
