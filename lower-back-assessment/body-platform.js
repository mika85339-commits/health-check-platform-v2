(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.HealthCheckBodyPlatform = api;
})(typeof window !== "undefined" ? window : null, function () {
  const DEVICE_KEY = "health_check_lab_anonymous_device";
  const SESSION_KEY = "health_check_lab_analytics_session";
  const RECORD_LIMIT = 300;
  const DEVICE_ID_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

  const BODY_GROUPS = {
    neck: "首肩", shoulder: "首肩", scapula: "首肩", back: "首肩",
    elbow: "上肢", wrist: "上肢",
    lowback: "腰臀部", buttock: "腰臀部", hip: "腰臀部",
    thigh: "下肢", knee: "下肢", lowerleg: "下肢", ankle: "下肢", sole: "下肢",
    calf: "下肢", foot: "下肢"
  };

  const JOINTS = {
    neck: "cervical", shoulder: "shoulder", scapula: "scapulothoracic", back: "thoracic",
    elbow: "elbow", wrist: "wrist",
    lowback: "lumbar", buttock: "hip", hip: "hip", thigh: "hip", knee: "knee",
    lowerleg: "ankle", ankle: "ankle", sole: "foot",
    calf: "ankle", foot: "foot"
  };

  function createId(prefix = "id") {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function readJson(storage, key, fallback) {
    try {
      const value = JSON.parse(storage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function persistentId(storage, key, prefix) {
    try {
      const current = storage.getItem(key);
      if (current) return current;
      const next = createId(prefix);
      storage.setItem(key, next);
      return next;
    } catch {
      return createId(prefix);
    }
  }

  function anonymousDeviceId(storage) {
    try {
      const now = Date.now();
      const stored = storage.getItem(DEVICE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const createdAt = Number(parsed?.createdAt || 0);
          if (parsed?.id && createdAt && now - createdAt < DEVICE_ID_MAX_AGE_MS) return parsed.id;
        } catch {
          // Migrate the former long-lived string ID into the rotating format.
          storage.setItem(DEVICE_KEY, JSON.stringify({ id: stored, createdAt: now }));
          return stored;
        }
      }
      const id = createId("device");
      storage.setItem(DEVICE_KEY, JSON.stringify({ id, createdAt: now }));
      return id;
    } catch {
      return createId("device");
    }
  }

  function anonymousSessionId(storage) {
    return persistentId(storage, SESSION_KEY, "hcl");
  }

  function bodyGroup(bodyPart) {
    return BODY_GROUPS[bodyPart] || "未分類";
  }

  function jointFor(bodyPart) {
    return JOINTS[bodyPart] || "other";
  }

  function safeProfile(profile = {}) {
    const allowedAge = new Set(["", "under20", "20s", "30s", "40s", "50s", "60s", "70plus"]);
    const allowedSex = new Set(["", "female", "male", "other", "no_answer"]);
    const allowedRegion = new Set(["", "hokkaido", "tohoku", "kanto", "chubu", "kinki", "chugoku", "shikoku", "kyushu_okinawa", "no_answer"]);
    const allowedImpact = new Set(["", "none", "mild", "moderate", "strong"]);
    const allowedDuration = new Set(["", "under_week", "one_to_four_weeks", "one_to_three_months", "over_three_months"]);
    return {
      ageBand: allowedAge.has(profile.ageBand) ? profile.ageBand : "",
      sex: allowedSex.has(profile.sex) ? profile.sex : "",
      region: allowedRegion.has(profile.region) ? profile.region : "",
      lifeImpact: allowedImpact.has(profile.lifeImpact) ? profile.lifeImpact : "",
      symptomDuration: allowedDuration.has(profile.symptomDuration) ? profile.symptomDuration : ""
    };
  }

  function referralSource(sessionStorageLike) {
    const attribution = readJson(sessionStorageLike, "health_check_lab_journey_attribution", {});
    return String(attribution.session_source || "direct").slice(0, 60);
  }

  function normalizeRecord(result, options = {}) {
    const profile = safeProfile(options.profile);
    const answers = result.answers || {};
    const bodyPart = result.regionId || answers.primaryPart || "unknown";
    const candidateMuscles = (result.topMuscles || []).map((item) => item.name).filter(Boolean).slice(0, 5);
    return {
      ...result,
      diagnosisId: result.diagnosisId || options.diagnosisId || createId("diagnosis"),
      anonymousDeviceId: options.anonymousDeviceId || "",
      anonymousSessionId: options.anonymousSessionId || "",
      diagnosisDate: result.savedAt || new Date().toISOString(),
      bodyPart,
      bodyPartGroup: bodyGroup(bodyPart),
      joint: jointFor(bodyPart),
      leftRight: answers.side || "unknown",
      symptomScore: Math.max(0, Math.min(100, Number(result.postureDamage || result.totalScore || 0))),
      symptomDuration: profile.symptomDuration || "unknown",
      symptomTiming: answers.timing || result.duration || "unknown",
      movements: Array.isArray(answers.situations) ? answers.situations.slice(0, 6) : [],
      candidateMuscles,
      ageBand: profile.ageBand || "unknown",
      sex: profile.sex || "no_answer",
      region: profile.region || "no_answer",
      lifeImpact: profile.lifeImpact || "unknown",
      referralSource: options.referralSource || "direct",
      repeatVisit: Boolean(options.repeatVisit),
      schemaVersion: 1
    };
  }

  function readRecords(storage, key) {
    const records = readJson(storage, key, []);
    return Array.isArray(records) ? records : [];
  }

  function upsertRecord(storage, key, record, limit = RECORD_LIMIT) {
    const records = readRecords(storage, key);
    const index = records.findIndex((item) => item.diagnosisId && item.diagnosisId === record.diagnosisId);
    if (index >= 0) records[index] = record;
    else records.push(record);
    const trimmed = records.slice(-Math.max(1, limit));
    storage.setItem(key, JSON.stringify(trimmed));
    return trimmed;
  }

  function recommendedDates(date) {
    const base = new Date(date || Date.now());
    const add = (days) => {
      const next = new Date(base);
      next.setDate(next.getDate() + days);
      return next.toISOString();
    };
    return { sevenDays: add(7), fourteenDays: add(14) };
  }

  function sponsorContext(record) {
    return Object.freeze({
      body_part: record?.bodyPart || record?.regionId || "unknown",
      joint: record?.joint || jointFor(record?.bodyPart || record?.regionId),
      region: record?.region || "no_answer",
      placement: "post_result_after_care",
      disclosure_label: "PR"
    });
  }

  return {
    DEVICE_KEY,
    SESSION_KEY,
    DEVICE_ID_MAX_AGE_MS,
    createId,
    bodyGroup,
    jointFor,
    safeProfile,
    referralSource,
    anonymousDeviceId,
    anonymousSessionId,
    normalizeRecord,
    readRecords,
    upsertRecord,
    recommendedDates,
    sponsorContext
  };
});
