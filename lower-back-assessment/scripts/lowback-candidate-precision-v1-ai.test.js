"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const persistence = require("../precision-persistence.js");

const root = path.resolve(__dirname, "..");
const precisionSource = fs.readFileSync(path.join(root, "lowback-candidate-precision-v1.js"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8").replace(
  "return { init, localRecords, getPartMeta };",
  "return { init, localRecords, getPartMeta, __setState(values) { Object.assign(state, values); }, __calculate: calculate, __aiText: aiHandoffText, __result: renderResult };"
);
const design = JSON.parse(fs.readFileSync(path.join(root, "docs", "audits",
  "lower-back-precision-v1-final-policy-design-2026-09-30.json"), "utf8"));

function create(search, hostname = "127.0.0.1") {
  const node = { innerHTML: "" };
  const storage = { getItem() { return null; }, setItem() {} };
  const location = { hostname, origin: `http://${hostname}:14429`, search };
  const window = { location, localStorage: storage, setTimeout() {}, scrollTo() {},
    HealthCheckPrecisionPersistence: persistence };
  const context = { window, location, localStorage: storage, sessionStorage: storage,
    document: { dispatchEvent() {} }, CustomEvent: function CustomEvent() {}, URLSearchParams, URL, Date, Math, Intl, console };
  vm.runInNewContext(precisionSource, context, { filename: "lowback-candidate-precision-v1.js" });
  vm.runInNewContext(uiSource, context, { filename: "body-check-ui.js" });
  const instance = window.createBodyCheck({ $: (selector) => selector === "#bodyCheckRoot" ? node : null,
    $$: () => [], STORAGE_KEY: "test-lowback", copyText() {} });
  instance.init();
  return { instance, node, precision: window.HealthCheckLowbackPrecisionV1 };
}

const local = create("?part=lowback&lowback_logic=precision-v1");
const nameById = new Map(local.precision.MASTER.map((item) => [item.id, item.name]));
const internalTerms = /\b(?:Pareto|frontier|axis cap|dominates|evidence vector|cross_group_[a-z_]+|bend_forward|extend_back|side_bend_right|side_bend_left|rotate_right|rotate_left|movement_unclear|location_unclear)\b/i;
const legacyQuestions = /朝起きる|スマートフォン|デスクワーク|症状の感じ方|症状が出るタイミング|症状の広がり/;
const selectedCases = new Map();

for (const [index, entry] of design.cases.entries()) {
  const input = entry.input;
  local.instance.__setState({ painLocation: input.location, side: input.side,
    situations: [...input.movements], symptoms: [], spread: "local" });
  const result = local.instance.__calculate();
  const fixed = local.precision.rank(input);
  const copy = local.instance.__aiText(result);
  assert.equal(result.candidateStatus, fixed.status, `case ${index} status`);
  assert.equal(result.candidateStatusReason, fixed.statusReason, `case ${index} reason`);
  assert.match(copy, /部位：腰/);
  assert.match(copy, /Main（選んだ位置と動きが重なる候補）/);
  assert.match(copy, /Additional（動きから追加で考えられる候補・順位なし）/);
  assert.match(copy, /比較して残る候補/);
  assert.match(copy, /候補筋の追加・削除・入れ替え、独自の順位付け/);
  assert.match(copy, /Main\/Additionalや結果状態の変更は禁止です/);
  assert.match(copy, /存在しない点数や確率を作らず/);
  assert.match(copy, /1\. 筋肉の説明：.*\n2\. 負担がかかったり傷めたりした場合に起こることがある症状：.*\n3\. 今回の回答との関係：/);
  assert.doesNotMatch(copy, /ストレッチ|セルフケア|何秒伸ばす/);
  assert.doesNotMatch(copy, /■安全確認|しびれ：|力が入りにくい：|脚への広がり：|注意案内：|安全回答/);
  assert.doesNotMatch(copy, internalTerms, `case ${index} internal terms`);
  assert.doesNotMatch(copy, legacyQuestions, `case ${index} legacy questions`);
  const expectedNames = new Set(fixed.display.all.map((id) => nameById.get(id)));
  for (const name of nameById.values()) {
    assert.equal(copy.includes(name), expectedNames.has(name), `case ${index} candidate ${name}`);
  }
  for (const [id, label] of Object.entries({ bend_forward: "前に曲げる", extend_back: "後ろに反る",
    side_bend_right: "右へ横に倒す", side_bend_left: "左へ横に倒す",
    rotate_right: "上半身を右へひねる", rotate_left: "上半身を左へひねる",
    movement_unclear: "特定の動きが分からない" })) {
    if (input.movements.includes(id)) assert(copy.includes(`- ${label}`), `case ${index} movement ${id}`);
  }
  if (!selectedCases.has(fixed.statusReason)) selectedCases.set(fixed.statusReason, copy);
}

for (const reason of ["ranked_unique_main", "main_tie", "cross_group_equal",
  "cross_group_incomparable", "cross_group_additional_dominates", "no_main_evidence",
  "location_unclear", "movement_unclear", "stretch_only_reference"]) {
  assert(selectedCases.has(reason), `${reason} covered`);
}
assert.match(selectedCases.get("main_tie"), /順位を分けていません/);
assert.match(selectedCases.get("cross_group_equal"), /医学的な確率が等しいという意味ではありません/);
assert.match(selectedCases.get("cross_group_incomparable"), /異なる動きの手がかり/);
assert.match(selectedCases.get("cross_group_additional_dominates"), /単独の最上位にしないでください/);
assert.match(selectedCases.get("movement_unclear"), /位置だけで筋肉を推測しないでください/);
assert.match(selectedCases.get("stretch_only_reference"), /原因筋を示す結果ではありません/);

for (const benchmark of design.benchmark) {
  const { location, side, movements } = benchmark.input;
  local.instance.__setState({ painLocation: location, side, situations: [...movements],
    symptoms: [], spread: "local" });
  const result = local.instance.__calculate();
  const fixed = local.precision.rank(benchmark.input);
  assert.equal(result.candidateStatus, benchmark.byLocation.L1.status, benchmark.id);
  assert.equal(result.candidateStatusReason, benchmark.byLocation.L1.reason, benchmark.id);
  for (const id of fixed.display.all) assert(local.instance.__aiText(result).includes(nameById.get(id)), benchmark.id);
}

local.instance.__setState({ painLocation: "lowback_center", side: "right", situations: ["extend_back"],
  symptoms: ["numbness", "weakness"], spread: "limb" });
const unanswered = local.instance.__calculate();
const unansweredText = local.instance.__aiText(unanswered);
assert.deepEqual(unanswered.precisionData.safety, { numbness: null, weakness: null, limbSpread: null });
assert.doesNotMatch(unansweredText, /■安全確認|しびれ：|力が入りにくい：|脚への広がり：|注意案内：|安全回答/);
assert.match(local.instance.__result(), /id="saveBodyBtn"/);

const legacy = create("?part=lowback&lowback_logic=legacy");
assert(!legacy.node.innerHTML.includes("腰の中央"));
legacy.instance.__setState({ painLocation: "lowback_center", side: "right", situations: ["extend_back"],
  symptoms: ["heavy"], timing: "start", spread: "local" });
const legacyResult = legacy.instance.__calculate();
assert.match(legacy.instance.__aiText(legacyResult), /症状の感じ方/);
assert.doesNotMatch(legacy.instance.__aiText(legacyResult), /比較して残る候補/);
const production = create("?part=lowback", "health-check-platform-v2.netlify.app");
assert(production.node.innerHTML.includes("腰の中央"));

console.log("Lowback precision-v1 AI handoff: 672 cases, 20 benchmarks, status copy, unanswered safety and legacy gating passed.");
