const assert = require("assert");
const platform = require("../body-platform");
const diagnosisFunction = require("../netlify/functions/save-diagnosis-record");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

const storage = memoryStorage();
const result = {
  diagnosisVersion: "bodycheck-test",
  savedAt: "2026-09-22T00:00:00.000Z",
  regionId: "knee",
  regionLabel: "膝",
  postureDamage: 62,
  topMuscles: [{ name: "大腿四頭筋" }, { name: "中臀筋" }],
  answers: { side: "right", timing: "middle", situations: ["stairs_up"] }
};
const first = platform.normalizeRecord(result, {
  diagnosisId: "diagnosis-1",
  anonymousDeviceId: "device-1",
  anonymousSessionId: "session-1",
  referralSource: "organic-search",
  repeatVisit: false
});

assert.equal(first.bodyPartGroup, "下肢");
assert.equal(first.joint, "knee");
assert.equal(first.leftRight, "right");
assert.deepEqual(first.candidateMuscles, ["大腿四頭筋", "中臀筋"]);
platform.upsertRecord(storage, "records", first);
platform.upsertRecord(storage, "records", { ...first, symptomScore: 58 });
assert.equal(platform.readRecords(storage, "records").length, 1, "same diagnosis must be upserted");

const second = platform.normalizeRecord({ ...result, savedAt: "2026-09-29T00:00:00.000Z", postureDamage: 50 }, {
  diagnosisId: "diagnosis-2",
  anonymousDeviceId: "device-1",
  anonymousSessionId: "session-2",
  repeatVisit: true
});
const comparison = platform.compareRecords(second, first);
assert.equal(comparison.delta, -12);
assert.equal(comparison.direction, "lower");
assert.deepEqual(comparison.sharedMuscles, ["大腿四頭筋", "中臀筋"]);

const context = platform.sponsorContext({ ...second, region: "chubu" });
assert.deepEqual(context, {
  body_part: "knee",
  joint: "knee",
  region: "chubu",
  placement: "post_result_after_care",
  disclosure_label: "PR"
});
assert.equal(Object.isFrozen(context), true);

const clean = diagnosisFunction.sanitizeRecord(second);
assert.equal(clean.diagnosis_id, "diagnosis-2");
assert.equal(clean.symptom_score, 50);
assert.equal(Object.prototype.hasOwnProperty.call(clean, "name"), false);
assert.equal(Object.prototype.hasOwnProperty.call(clean, "email"), false);
assert.equal(diagnosisFunction.legacyRecord(clean).area, "下肢");

console.log("Body platform checks passed.");
