"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const design = require("../docs/audits/lowerleg-precision-v1-final-human-review-2026-10-06.json");
const Lowerleg = require("../lowerleg-candidate-precision-v1.js");
const Platform = require("../body-platform.js");
const Persistence = require("../precision-persistence.js");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const moduleScript = "/lowerleg-candidate-precision-v1.js?v=20261007-lowerleg-precision-v1";
const uiScript = index.match(/\/body-check-ui\.js\?v=[A-Za-z0-9._-]+/)?.[0];
assert(uiScript, "A versioned body-check UI script is required");
assert.equal(index.split(moduleScript).length - 1, 1);
assert.equal(index.split(uiScript).length - 1, 1);
assert(index.indexOf(moduleScript) < index.indexOf(uiScript));
assert(!index.includes("lowerleg-precision-v1-local"));

const uiSource = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8").replace(
  "return { init, localRecords, getPartMeta };",
  "return { init, localRecords, getPartMeta, __setState(values) { Object.assign(state, values); }, __calculate: calculate, __steps: currentSteps, __render: render, __ai: aiHandoffText, __normalize: normalizedRecord, __latest() { return state.latest; } };"
);

function createUi({ hostname = "127.0.0.1", search = "?part=lowerleg&lowerleg_logic=precision-v1" } = {}) {
  const storage = { getItem() { return null; }, setItem() {} };
  const location = { hostname, origin: `http://${hostname}:14532`, search };
  const window = { location, localStorage: storage, HealthCheckBodyPlatform: Platform,
    HealthCheckPrecisionPersistence: Persistence, HealthCheckLowerlegPrecisionV1: Lowerleg,
    scrollTo() {} };
  vm.runInNewContext(uiSource, { window, location, localStorage: storage,
    sessionStorage: storage, document: { dispatchEvent() {} },
    CustomEvent: function CustomEvent() {}, URL, URLSearchParams, Date, Math, Intl },
  { filename: "body-check-ui.js" });
  const element = { innerHTML: "" };
  const instance = window.createBodyCheck({
    $: (selector) => selector === "#bodyCheckRoot" ? element : null,
    $$: () => [], STORAGE_KEY: "lowerleg-runtime-test", copyText() {}
  });
  instance.init();
  instance.__html = () => element.innerHTML;
  return instance;
}

function calculateUi(instance, input) {
  instance.__setState({ selectedParts: ["lowerleg"], primaryPart: "lowerleg",
    painLocation: input.location, side: input.side, situations: [...input.movements],
    symptoms: [], timing: "", spread: "" });
  assert.deepEqual([...instance.__steps()], ["precision_location", "precision_side", "situations", "result"]);
  return instance.__calculate();
}

const sorted = (items) => [...items].sort();
const comparable = (ranked) => Object.fromEntries([
  "status", "reason", "main", "additional", "related", "reference", "frontier", "visible"
].map((key) => [key, ranked[key]]));
const permutations = (values) => values.length < 2 ? [values] : values.flatMap((value, index) =>
  permutations(values.filter((_, at) => at !== index)).map((rest) => [value, ...rest]));
const status = { ranked: 0, tied: 0, insufficient: 0 };
const checks = { rankedTrusted: 0, gastroUnique: 0, soleusUnique: 0,
  gastroSoleusTie: 0, naiveRelatedLoss: 0, projectedRelatedLoss: 0,
  weakOnlyMain: 0, weakOnlyAdditional: 0, weakOnlyRanked: 0, weakGuard: 0,
  mirror: 0, movementOrder: 0, definitionOrder: 0, sourceOrderTop1: 0,
  sameAxisDoubleCount: 0, displayLoss: 0 };
const names = new Map(Lowerleg.MASTER.map(({ id, name }) => [id, name]));
assert.equal(design.allCases.length, 840);
assert.deepEqual(Lowerleg.MASTER.map(({ id, name, location, movement }) =>
  ({ id, name, location, movement })),
design.roster.map(({ id, name, location, movement }) => ({ id, name, location, movement })));
assert.deepEqual(Lowerleg.MOVEMENTS.map(([id, text]) => [id, text]),
  Object.entries(design.movementLabels).filter(([id]) => id !== "inversionEversionNote"));

assert.deepEqual([...createUi({ search: "?part=lowerleg" }).__steps()],
  ["precision_location", "precision_side", "situations", "result"]);
assert.equal(createUi({ search: "?part=lowerleg&lowerleg_logic=legacy" }).__steps()[0], "situations");
assert.equal(createUi({ hostname: "health-check-platform-v2.netlify.app",
  search: "?part=lowerleg" }).__steps()[0], "precision_location");
const questionUi = createUi({ search: "?part=lowerleg" });
for (const [stepIndex, words] of [
  [0, ["詳しい場所", "すね側（前）", "ふくらはぎ側（後ろ）", "内側", "外側"]],
  [1, ["左右", "右側", "左側", "両側", "中央"]],
  [2, ["動作", ...Lowerleg.MOVEMENTS.map(([, text]) => text),
    "つま先の向きを変える動きではありません"]]
]) {
  questionUi.__setState({ stepIndex });
  questionUi.__render();
  const html = questionUi.__html();
  assert(html.includes("--step-count:4"));
  for (const word of words) assert(html.includes(word), word);
  assert(!html.includes("安全確認") && !html.includes("広がり"));
}

const ui = createUi({ hostname: "health-check-platform-v2.netlify.app", search: "?part=lowerleg" });
let saveMismatch = 0;
for (const { input, result: expected } of design.allCases) {
  const ranked = Lowerleg.rank(input);
  assert.deepEqual(comparable(ranked), expected, JSON.stringify(input));
  const result = calculateUi(ui, input);
  assert.equal(result.candidateStatus, expected.status);
  assert.equal(result.candidateStatusReason, expected.reason);
  assert.equal(result.diagnosisVersion, "lowerleg_precision_v1");
  assert.equal(result.precisionData.persistenceVersion, 1);
  assert.deepEqual(result.precisionData.safety,
    { numbness: null, weakness: null, limbSpread: null });
  assert.deepEqual(result.precisionData.result, {
    status: expected.status, reason: expected.reason,
    mainMuscleIds: expected.main, additionalMuscleIds: expected.additional,
    frontierMuscleIds: expected.frontier, referenceMuscleIds: expected.reference
  });
  for (const [group, ids] of Object.entries({ Main: expected.main,
    Additional: expected.additional, Related: expected.related, Reference: expected.reference })) {
    assert.deepEqual(sorted(result.topMuscles.filter((item) => item.displayGroup === group)
      .map((item) => item.muscleId)), ids, `${group} ${JSON.stringify(input)}`);
  }
  assert.deepEqual(sorted(result.topMuscles.map((item) => item.muscleId)), expected.visible);
  const displayBefore = JSON.stringify(result.topMuscles);
  const record = ui.__normalize(result);
  assert.equal(JSON.stringify(result.topMuscles), displayBefore);
  assert.equal(JSON.stringify(record.topMuscles), displayBefore);
  assert.equal(record.symptomScore, null);
  assert.deepEqual(record.precisionData, result.precisionData);
  const relatedNames = expected.related.map((id) => names.get(id));
  const naive = result.topMuscles.slice(0, 5).map((item) => item.name);
  if (relatedNames.some((name) => !naive.includes(name))) checks.naiveRelatedLoss += 1;
  if (relatedNames.some((name) => !record.candidateMuscles.includes(name))) checks.projectedRelatedLoss += 1;
  const projection = ["Related", "Main", "Additional", "Reference"].flatMap((group) =>
    result.topMuscles.filter((item) => item.displayGroup === group).map((item) => item.name)).slice(0, 5);
  if (JSON.stringify(record.candidateMuscles) !== JSON.stringify(projection)) saveMismatch += 1;

  status[ranked.status] += 1;
  if (ranked.status === "ranked") {
    const winner = ranked.evidence[ranked.frontier[0]];
    if (winner.location === "P" && winner.active.length &&
      ranked.pairRelations.every((pair) => pair.class === "MAIN_DOMINATES")) checks.rankedTrusted += 1;
    if (ranked.frontier[0] === "lowerleg_gastrocnemius") checks.gastroUnique += 1;
    if (ranked.frontier[0] === "lowerleg_soleus") checks.soleusUnique += 1;
    if (!winner.active.length) checks.weakOnlyRanked += 1;
  }
  if (ranked.status === "tied" && ranked.frontier.includes("lowerleg_gastrocnemius") &&
    ranked.frontier.includes("lowerleg_soleus")) checks.gastroSoleusTie += 1;
  for (const id of ranked.main) if (!ranked.evidence[id].active.length) checks.weakOnlyMain += 1;
  for (const id of ranked.additional) if (!ranked.evidence[id].active.length) checks.weakOnlyAdditional += 1;
  for (const pair of ranked.pairRelations) if (!ranked.evidence[pair.additional].active.length) checks.weakGuard += 1;
  if (new Set(result.topMuscles.map((item) => item.muscleId)).size !== expected.visible.length) checks.displayLoss += 1;
  const mirror = Lowerleg.rank({ ...input, side: input.side === "left" ? "right" : "left" });
  if (JSON.stringify(comparable(mirror)) !== JSON.stringify(comparable(ranked))) checks.mirror += 1;
  const reverse = Lowerleg.rank(input, [...Lowerleg.MASTER].reverse());
  if (JSON.stringify(comparable(reverse)) !== JSON.stringify(comparable(ranked))) checks.definitionOrder += 1;
  if (ranked.status === "ranked" && JSON.stringify(reverse.frontier) !== JSON.stringify(ranked.frontier)) checks.sourceOrderTop1 += 1;
  for (const movements of permutations(input.movements)) {
    const changed = Lowerleg.rank({ ...input, movements });
    if (JSON.stringify(comparable(changed)) !== JSON.stringify(comparable(ranked))) checks.movementOrder += 1;
  }
  for (const row of Object.values(ranked.evidence)) for (const axis of Object.keys(row.axis)) {
    const singles = input.movements.filter((id) => Lowerleg.MOVEMENT_AXIS[id] === axis)
      .map((id) => Lowerleg.rank({ ...input, movements: [id] }).evidence[row.id].axis[axis]);
    if (row.axis[axis] !== singles.some(Boolean)) checks.sameAxisDoubleCount += 1;
  }
}
assert.deepEqual(status, { ranked: 36, tied: 296, insufficient: 508 });
assert.equal(checks.rankedTrusted, 36);
assert.equal(checks.gastroUnique, 0);
assert.equal(checks.soleusUnique, 0);
assert.equal(checks.gastroSoleusTie, 152);
assert.equal(checks.naiveRelatedLoss, 204);
assert.equal(checks.projectedRelatedLoss, 0);
assert.equal(saveMismatch, 0);
for (const [key, value] of Object.entries(checks)) {
  if (!["rankedTrusted", "gastroSoleusTie", "naiveRelatedLoss"].includes(key)) assert.equal(value, 0, key);
}
assert.equal(design.benchmarks.length, 27);
for (const benchmark of design.benchmarks) {
  assert.deepEqual(comparable(Lowerleg.rank(benchmark.input)), benchmark.result, benchmark.id);
}
const aiCase = design.allCases.find((item) => item.result.related.length && item.result.reference.length);
const aiResult = calculateUi(ui, aiCase.input);
const ai = ui.__ai(aiResult);
for (const name of aiResult.topMuscles.map((item) => item.name)) assert(ai.includes(name), name);
assert(ai.includes("筋肉の説明") && ai.includes("症状") && ai.includes("今回の回答との関係"));
assert(ai.includes("追加・削除") && ai.includes("独自の順位変更"));
assert(!ai.includes("ストレッチ") && !ai.includes("しびれなし"));
ui.__setState({ stepIndex: 3 });
ui.__render();
const resultHtml = ui.__html();
assert(resultHtml.includes("参考として関連する筋肉"));
assert(resultHtml.includes("胸痛や息苦しさ"));
assert(resultHtml.includes("候補筋についてAIに聞く内容をコピー"));
for (const count of [1, 2, 3]) {
  const example = design.allCases.find((item) => item.result.related.length === count);
  calculateUi(ui, example.input);
  ui.__render();
  const html = ui.__html();
  for (const id of example.result.related) assert(html.includes(names.get(id)), `${count} Related: ${id}`);
  if (count < 3) assert(!html.includes(`参考として関連する筋肉（${count}筋）`));
  else {
    const summary = html.match(/<summary><span>参考として関連する筋肉（3筋）<\/span><small>([^<]+)<\/small><\/summary>/);
    assert(summary, "3 Related summary");
    for (const id of example.result.related.slice(0, 2)) assert(summary[1].includes(names.get(id)), id);
  }
}
console.log("Lowerleg runtime 840/840; status 36/296/508; ranked 36 trusted; gastro/soleus unique 0; benchmarks 27/27; invariants 0; Related naive loss 204, projected loss 0: PASS");

module.exports = { createUi, calculateUi };
