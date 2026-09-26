const assert = require("assert");
const platform = require("../body-platform");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

const storage = memoryStorage();
const sessionStorage = memoryStorage();
const deviceId = platform.anonymousDeviceId(storage);
assert.equal(platform.anonymousDeviceId(storage), deviceId, "device ID remains stable inside its 90-day window");
const sessionId = platform.anonymousSessionId(sessionStorage);
assert.equal(platform.anonymousSessionId(sessionStorage), sessionId, "session ID remains stable only in the supplied session storage");
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
assert.equal(platform.bodyGroup("elbow"), "上肢");
assert.equal(platform.bodyGroup("wrist"), "上肢");
assert.equal(platform.bodyGroup("lowerleg"), "下肢");
assert.equal(platform.bodyGroup("sole"), "下肢");
assert.equal(platform.jointFor("elbow"), "elbow");
assert.equal(platform.jointFor("wrist"), "wrist");
assert.equal(platform.jointFor("lowerleg"), "ankle");
assert.equal(platform.jointFor("sole"), "foot");
assert.equal(platform.bodyGroup("calf"), "下肢", "Existing anonymous calf records must stay classifiable.");
assert.equal(platform.jointFor("foot"), "foot", "Existing anonymous foot records must stay classifiable.");
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
assert.strictEqual(platform.compareRecords, undefined, "The retired reference-score comparison API must not return.");
assert.strictEqual(platform.comparableHistory, undefined, "The retired score-comparison history API must not return.");

const context = platform.sponsorContext({ ...second, region: "chubu" });
assert.deepEqual(context, {
  body_part: "knee",
  joint: "knee",
  region: "chubu",
  placement: "post_result_after_care",
  disclosure_label: "PR"
});
assert.equal(Object.isFrozen(context), true);

console.log("Body platform checks passed.");
