const EVENT_TABLES = Object.freeze({
  sponsor_banner_impression: "sponsor_impressions",
  sponsor_banner_click: "sponsor_clicks"
});
const CANONICAL_BODY_PARTS = Object.freeze([
  "neck", "shoulder", "elbow", "wrist", "back", "lowback", "hip",
  "buttock", "thigh", "knee", "lowerleg", "ankle", "sole"
]);
const BODY_PART_ALIASES = Object.freeze({
  scapula: "shoulder",
  "lower-back": "lowback",
  lower_back: "lowback",
  lumbar: "lowback",
  glute: "buttock",
  glutes: "buttock",
  calf: "lowerleg",
  shin: "lowerleg",
  foot: "sole"
});

function safeString(value, max = 120, fallback = "") {
  const text = String(value == null ? "" : value).trim().slice(0, max);
  return text || fallback;
}

function normalizeBodyPart(value) {
  const raw = safeString(value, 40).toLowerCase();
  const normalized = BODY_PART_ALIASES[raw] || raw;
  return CANONICAL_BODY_PARTS.includes(normalized) ? normalized : "unknown";
}

function normalizeRegionCode(countryCode, subdivisionCode) {
  const country = safeString(countryCode, 8).toUpperCase();
  const subdivision = safeString(subdivisionCode, 16).toUpperCase();
  if (!subdivision) return "unknown";
  if (subdivision.startsWith(`${country}-`)) return subdivision;
  if (country === "JP" && /^\d{1,2}$/.test(subdivision)) return `JP-${subdivision.padStart(2, "0")}`;
  return subdivision;
}

function serverGeo(context = {}) {
  const geo = context.geo || {};
  const countryCode = safeString(geo.country?.code, 8, "unknown").toUpperCase();
  return Object.freeze({
    country_code: countryCode,
    region_code: normalizeRegionCode(countryCode, geo.subdivision?.code),
    region_name: safeString(geo.subdivision?.name, 80, "unknown")
  });
}

function sanitizeSponsorEvent(input = {}, context = {}) {
  const eventType = safeString(input.event_type, 60);
  if (!EVENT_TABLES[eventType]) throw new Error("unsupported_sponsor_event");
  const sponsorKey = safeString(input.sponsor_id, 80);
  const creativeId = safeString(input.creative_id, 100);
  const placementId = safeString(input.placement_id, 80);
  const eventId = safeString(input.event_id, 240);
  if (!sponsorKey || !creativeId || !placementId || !eventId) throw new Error("missing_sponsor_event_identity");
  const occurredAt = new Date(input.occurred_at || Date.now());
  if (Number.isNaN(occurredAt.getTime())) throw new Error("invalid_sponsor_event_time");
  return Object.freeze({
    event_type: eventType,
    event_id: eventId,
    sponsor_key: sponsorKey,
    creative_id: creativeId,
    placement_id: placementId,
    body_part: normalizeBodyPart(input.body_part),
    ...serverGeo(context),
    occurred_at: occurredAt.toISOString()
  });
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

async function resolveSponsorUuid(sponsorKey, env = process.env, fetchImpl) {
  const query = `sponsors?select=sponsor_id&sponsor_key=eq.${encodeURIComponent(sponsorKey)}&limit=1`;
  const response = await supabaseRequest(query, { method: "GET" }, env, fetchImpl);
  if (!response.configured) return { configured: false, sponsorId: "" };
  if (!response.ok) throw new Error("sponsor_lookup_failed");
  const rows = JSON.parse(response.text || "[]");
  const sponsorId = safeString(rows[0]?.sponsor_id, 80);
  if (!sponsorId) throw new Error("sponsor_not_configured");
  return { configured: true, sponsorId };
}

async function saveSponsorEvent(eventRecord, env = process.env, fetchImpl = (...args) => fetch(...args)) {
  const sponsor = await resolveSponsorUuid(eventRecord.sponsor_key, env, fetchImpl);
  if (!sponsor.configured) return { stored: false, storage: "not_configured" };
  const table = EVENT_TABLES[eventRecord.event_type];
  const row = {
    event_id: eventRecord.event_id,
    sponsor_id: sponsor.sponsorId,
    creative_id: eventRecord.creative_id,
    placement_id: eventRecord.placement_id,
    placement: eventRecord.placement_id,
    body_part: eventRecord.body_part,
    country_code: eventRecord.country_code,
    region_code: eventRecord.region_code,
    region_name: eventRecord.region_name,
    region: eventRecord.region_name,
    occurred_at: eventRecord.occurred_at
  };
  const response = await supabaseRequest(`${table}?on_conflict=event_id`, {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(row)
  }, env, fetchImpl);
  if (!response.ok) throw new Error("sponsor_event_insert_failed");
  return { stored: true, storage: table };
}

function json(body, status = 202) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function createHandler({ env = process.env, fetchImpl = (...args) => fetch(...args) } = {}) {
  return async function handler(request, context = {}) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    if (request.method !== "POST") return json({ error: "POST only" }, 405);
    try {
      const eventRecord = sanitizeSponsorEvent(await request.json(), context);
      const result = await saveSponsorEvent(eventRecord, env, fetchImpl);
      return json({ ok: true, ...result });
    } catch (error) {
      console.error("Sponsor event was not stored.", { reason: safeString(error?.message, 100, "unknown") });
      return json({ ok: false, stored: false });
    }
  };
}

const handler = createHandler();

export default handler;
export {
  BODY_PART_ALIASES,
  CANONICAL_BODY_PARTS,
  EVENT_TABLES,
  createHandler,
  normalizeBodyPart,
  normalizeRegionCode,
  resolveSponsorUuid,
  sanitizeSponsorEvent,
  saveSponsorEvent,
  serverGeo,
  supabaseRequest
};
