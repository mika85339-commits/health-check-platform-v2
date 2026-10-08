"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Back = require("../back-candidate-precision-v1.js");
const Platform = require("../body-platform.js");
const Persistence = require("../precision-persistence.js");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const moduleScript = "/back-candidate-precision-v1.js?v=20261008-back-precision-v1-local";
const uiScript = "/body-check-ui.js?v=20261008-back-precision-v1-local";
assert.equal(html.split(moduleScript).length - 1, 1);
assert.equal(html.split(uiScript).length - 1, 1);
assert(html.indexOf(moduleScript) < html.indexOf(uiScript));
const uiSource = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8").replace(
  "return { init, localRecords, getPartMeta };",
  "return { init, localRecords, getPartMeta, __setState(values) { Object.assign(state, values); }, __calculate: calculate, __steps: currentSteps, __render: render, __ai: aiHandoffText, __normalize: normalizedRecord, __latest() { return state.latest; } };"
);

function createUi({ hostname = "health-check-platform-v2.netlify.app", search = "?part=back" } = {}) {
  const storage = { getItem() { return null; }, setItem() {} };
  const location = { hostname, origin: `http://${hostname}`, search };
  const window = { location, localStorage: storage, HealthCheckBodyPlatform: Platform,
    HealthCheckPrecisionPersistence: Persistence, HealthCheckBackPrecisionV1: Back,
    scrollTo() {} };
  vm.runInNewContext(uiSource, { window, location, localStorage: storage,
    sessionStorage: storage, document: { dispatchEvent() {} },
    CustomEvent: function CustomEvent() {}, URL, URLSearchParams, Date, Math, Intl },
  { filename: "body-check-ui.js" });
  const element = { innerHTML: "" };
  const instance = window.createBodyCheck({
    $: (selector) => selector === "#bodyCheckRoot" ? element : null,
    $$: () => [], STORAGE_KEY: "back-runtime-test", copyText() {}
  });
  instance.init();
  instance.__html = () => element.innerHTML;
  return instance;
}

function calculateUi(ui, input) {
  ui.__setState({ selectedParts: ["back"], primaryPart: "back",
    painLocation: input.location, side: "", situations: [...input.movements],
    symptoms: [], timing: "", spread: "" });
  assert.deepEqual([...ui.__steps()], ["precision_location", "situations", "result"]);
  return ui.__calculate();
}

const sorted = (values) => [...values].sort();
const fields = ["status", "reason", "main", "additional", "related", "reference", "frontier", "visible"];
const comparable = (result) => Object.fromEntries(fields.map((key) => [key, result[key]]));

// The locked relation table is evaluated independently of Back.rank.
const relation = {
  shoulder_retract: {
    back_scapular_medial: ["back_scapular_retractors", "Main"],
    back_upper: ["back_scapular_retractors", "Additional"],
    back_scapular_inferior: ["back_scapular_retractors", "Additional"],
    back_thoracic_midline: ["back_scapular_retractors", "Additional"]
  },
  extend_back: {
    back_thoracic_midline: ["back_thoracic_paraspinals", "Main"],
    back_scapular_medial: ["back_thoracic_paraspinals", "Additional"],
    back_scapular_inferior: ["back_thoracic_paraspinals", "Additional"],
    back_lower_ribs: ["back_thoracic_paraspinals", "Additional"]
  },
  arm_raise: {
    back_scapular_medial: ["back_lower_trapezius", "Additional"],
    back_scapular_inferior: ["back_lower_trapezius", "Additional"]
  },
  arm_pull_back: {
    back_scapular_inferior: ["back_latissimus_dorsi", "Additional"],
    back_lateral_ribs: ["back_latissimus_dorsi", "Additional"],
    back_lower_ribs: ["back_latissimus_dorsi", "Additional"]
  },
  twist_body: {
    back_thoracic_midline: ["back_thoracic_paraspinals", "Related"],
    back_scapular_inferior: ["back_thoracic_paraspinals", "Related"],
    back_lower_ribs: ["back_thoracic_paraspinals", "Related"]
  },
  bend_forward: {
    back_thoracic_midline: ["back_thoracic_paraspinals", "Reference"],
    back_lower_ribs: ["back_thoracic_paraspinals", "Reference"]
  },
  deep_breath: { back_lateral_ribs: ["back_intercostal_group", "Reference"] }
};
const fallback = {
  back_upper: ["back_upper_trapezius"],
  back_scapular_medial: ["back_scapular_retractors"],
  back_scapular_inferior: ["back_lower_trapezius", "back_latissimus_dorsi"],
  back_thoracic_midline: ["back_thoracic_paraspinals"],
  back_lateral_ribs: ["back_latissimus_dorsi"],
  back_lower_ribs: ["back_thoracic_paraspinals", "back_latissimus_dorsi"],
  location_unclear: []
};
const priority = { Related: 1, Reference: 2, Additional: 3, Main: 4 };

function expected(input) {
  const groups = new Map(fallback[input.location].map((id) => [id, "Related"]));
  for (const movement of input.movements) {
    const evidence = relation[movement]?.[input.location];
    if (evidence && (!groups.has(evidence[0]) || priority[evidence[1]] > priority[groups.get(evidence[0])])) {
      groups.set(...evidence);
    }
  }
  const group = (name) => sorted([...groups].filter(([, value]) => value === name).map(([id]) => id));
  const main = group("Main");
  const additional = group("Additional");
  const related = group("Related");
  const reference = group("Reference");
  const conflict = Boolean(main.length && additional.length);
  const neckBoundary = input.movements.includes("neck_move") &&
    ["back_upper", "back_scapular_medial"].includes(input.location);
  const status = main.length === 1 && !conflict && !neckBoundary ? "ranked"
    : main.length > 1 && !conflict && !neckBoundary ? "tied" : "insufficient";
  const reason = input.location === "location_unclear" ? "location_unclear"
    : input.movements.includes("movement_unclear") ? "movement_unclear"
      : neckBoundary ? "neck_boundary" : conflict ? "cross_group_guard"
        : status === "ranked" ? "main_evidence" : status === "tied" ? "main_tie"
          : "no_main_evidence";
  return { status, reason, main, additional, related, reference,
    frontier: status === "insufficient" ? [] : main,
    visible: sorted([...groups.keys()]), conflict };
}

function combinations(values, max) {
  const output = [];
  function visit(start, selected) {
    if (selected.length) output.push(selected);
    if (selected.length === max) return;
    for (let i = start; i < values.length; i++) visit(i + 1, [...selected, values[i]]);
  }
  visit(0, []);
  return output;
}

function permutations(values) {
  if (values.length < 2) return [values];
  return values.flatMap((value, at) => permutations(values.filter((_, index) => index !== at))
    .map((rest) => [value, ...rest]));
}

async function main() {
  const { sanitizeRecord } = await import("../netlify/functions/save-diagnosis-record.mjs");
  assert.equal(Back.VERSION, "back-precision-v1-local-hypothesis");
  assert.equal(Back.MASTER.length, 6);
  assert.equal(new Set(Back.MASTER.map(({ id }) => id)).size, 6);
  assert.equal(new Set(Back.MASTER.flatMap(({ constituentIds }) => constituentIds)).size, 8);
  assert.deepEqual(Back.MASTER.slice(0, 2).map(({ constituents }) => constituents),
    [["僧帽筋中部", "菱形筋群"], ["脊柱起立筋", "多裂筋"]]);
  assert.deepEqual([...createUi().__steps()], ["precision_location", "situations", "result"]);
  assert.deepEqual([...createUi({ hostname: "127.0.0.1", search: "?part=back" }).__steps()],
    ["precision_location", "situations", "result"]);
  assert.equal(createUi({ hostname: "127.0.0.1", search: "?part=back&back_logic=legacy" })
    .__steps()[0], "situations");
  const questions = createUi();
  for (const [index, labels] of [[0, ["背中のどのあたりが気になりますか？",
    ...Back.LOCATIONS.map(([, label]) => label), "分からない", "骨盤の上ではなく、肋骨がある範囲"]],
  [1, ["普段、どの動き・場面で気になりますか？", ...Back.MOVEMENTS.map(([, label]) => label),
    "その場で試す必要はありません"]]]) {
    questions.__setState({ stepIndex: index }); questions.__render();
    for (const label of labels) assert(questions.__html().includes(label), label);
    assert(!questions.__html().includes("安全確認") && !questions.__html().includes("広がり"));
  }
  const ui = createUi();
  const counts = { ranked: 0, tied: 0, insufficient: 0 };
  const buckets = { 0: 0, 1: 0, "2-3": 0, "4+": 0 };
  let conflict = 0;
  let maxVisible = 0;
  let maxBytes = 0;
  let cases = 0;
  const movementSets = [...combinations(Back.MOVEMENTS.map(([id]) => id), 3), ["movement_unclear"]];
  const masterOrders = permutations(Back.MASTER);
  assert.equal(movementSets.length, 93);
  assert.equal(masterOrders.length, 720);
  const names = Object.fromEntries(Back.MASTER.map(({ id, name }) => [id, name]));
  for (const location of [...Back.LOCATIONS.map(([id]) => id), "location_unclear"]) {
    for (const movements of movementSets) {
      const input = { location, movements };
      const want = expected(input);
      const ranked = Back.rank(input);
      assert.deepEqual(comparable(ranked), comparable(want), JSON.stringify(input));
      const result = calculateUi(ui, input);
      assert.equal(result.diagnosisVersion, "back_precision_v1");
      assert.equal(result.candidateStatus, want.status);
      assert.equal(result.candidateStatusReason, want.reason);
      assert.deepEqual(sorted(result.topMuscles.map(({ muscleId }) => muscleId)), want.visible);
      const dto = result.precisionData;
      assert.equal(dto.persistenceVersion, 2);
      assert.deepEqual(dto.answers, { location, side: "unknown", movements });
      assert.deepEqual(dto.result, { status: want.status, reason: want.reason,
        mainMuscleIds: want.main, additionalMuscleIds: want.additional,
        relatedMuscleIds: want.related, frontierMuscleIds: want.frontier,
        referenceMuscleIds: want.reference });
      assert.deepEqual(dto.safety, { numbness: null, weakness: null, limbSpread: null });
      maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(dto), "utf8"));
      const saved = sanitizeRecord(ui.__normalize(result));
      assert.equal(saved.diagnosis_version, "back_precision_v1");
      assert.equal(saved.symptom_score, null);
      assert.deepEqual(saved.precision_data, dto);
      const hydrated = Persistence.hydratePrecisionHistory({ diagnosis_id: "local-back-audit",
        diagnosis_version: "back_precision_v1", diagnosis_date: "2026-10-08",
        body_part: "back", precision_data: dto }, names);
      for (const [group, ids] of [["Main", want.main], ["Additional", want.additional],
        ["Related", want.related], ["Reference", want.reference]]) {
        assert.deepEqual(hydrated.topMuscles.filter((item) => item.displayGroup === group)
          .map((item) => item.muscleId), ids);
      }
      assert(hydrated.topMuscles.every(({ name }) => name !== "名称未登録の候補"));
      assert.equal(new Set(result.topMuscles.map(({ muscleId }) => muscleId)).size, result.topMuscles.length);
      assert.equal(ranked.sourceOrderUsedForTop1, false);
      assert.deepEqual(comparable(Back.rank(input, [...Back.MASTER].reverse())), comparable(ranked));
      for (const ordered of permutations(movements)) {
        assert.deepEqual(comparable(Back.rank({ location, movements: ordered })), comparable(ranked));
      }
      if (location === "location_unclear") assert.equal(ranked.visible.length, 0);
      if (!ranked.visible.length) assert.equal(location, "location_unclear");
      if (ranked.status === "ranked") {
        assert.equal(ranked.main.length, 1);
        for (const masterOrder of masterOrders) {
          assert.deepEqual(comparable(Back.rank(input, masterOrder)), comparable(ranked));
        }
      }
      counts[ranked.status]++;
      const bucket = ranked.visible.length < 2 ? String(ranked.visible.length)
        : ranked.visible.length < 4 ? "2-3" : "4+";
      buckets[bucket]++;
      conflict += Number(want.conflict);
      maxVisible = Math.max(maxVisible, ranked.visible.length);
      cases++;
    }
  }
  assert.equal(cases, 651);
  assert.deepEqual(counts, { ranked: 33, tied: 0, insufficient: 618 });
  assert.deepEqual(buckets, { 0: 93, 1: 234, "2-3": 311, "4+": 13 });
  assert.equal(conflict, 20);
  assert.equal(maxVisible, 4);
  assert(maxBytes <= Persistence.MAX_BYTES, `DTO ${maxBytes} bytes`);
  for (const [location, movements, status, main, additional, related, reference, reason] of [
    ["back_scapular_medial", ["shoulder_retract"], "ranked", ["back_scapular_retractors"], [], [], [], "main_evidence"],
    ["back_thoracic_midline", ["extend_back"], "ranked", ["back_thoracic_paraspinals"], [], [], [], "main_evidence"],
    ["back_scapular_medial", ["arm_raise"], "insufficient", [], ["back_lower_trapezius"], ["back_scapular_retractors"], [], "no_main_evidence"],
    ["back_upper", ["neck_move"], "insufficient", [], [], ["back_upper_trapezius"], [], "neck_boundary"],
    ["back_scapular_medial", ["shoulder_retract", "neck_move"], "insufficient", ["back_scapular_retractors"], [], [], [], "neck_boundary"],
    ["back_scapular_medial", ["shoulder_retract", "arm_raise"], "insufficient", ["back_scapular_retractors"], ["back_lower_trapezius"], [], [], "cross_group_guard"],
    ["back_thoracic_midline", ["twist_body"], "insufficient", [], [], ["back_thoracic_paraspinals"], [], "no_main_evidence"],
    ["back_lower_ribs", ["bend_forward"], "insufficient", [], [], ["back_latissimus_dorsi"], ["back_thoracic_paraspinals"], "no_main_evidence"],
    ["back_lower_ribs", ["extend_back"], "insufficient", [], ["back_thoracic_paraspinals"], ["back_latissimus_dorsi"], [], "no_main_evidence"],
    ["back_lateral_ribs", ["deep_breath"], "insufficient", [], [], ["back_latissimus_dorsi"], ["back_intercostal_group"], "no_main_evidence"],
    ["location_unclear", ["arm_raise"], "insufficient", [], [], [], [], "location_unclear"],
    ["back_scapular_medial", ["movement_unclear"], "insufficient", [], [], ["back_scapular_retractors"], [], "movement_unclear"]
  ]) {
    const result = Back.rank({ location, movements });
    assert.deepEqual([result.status, result.main, result.additional, result.related,
      result.reference, result.reason], [status, main, additional, related, reference, reason]);
  }
  const grouped = calculateUi(ui, { location: "back_scapular_medial", movements: ["shoulder_retract"] });
  const handoff = ui.__ai(grouped);
  assert(handoff.includes("肩甲骨を内側へ寄せる筋群"));
  assert(handoff.includes("僧帽筋中部・菱形筋群（個別には順位付けしない）"));
  assert(handoff.includes("複合表示単位を構成筋へ分解して順位付けせず"));
  assert(!handoff.includes("左右：") && !handoff.includes("ストレッチを"));
  assert(!handoff.includes("僧帽筋中部が原因") && !handoff.includes("菱形筋が原因"));
  for (const bad of [[], ["movement_unclear", "arm_raise"], ["arm_raise", "arm_raise"],
    ["bend_forward", "extend_back", "twist_body", "arm_raise"]]) {
    assert.throws(() => Back.rank({ location: "back_upper", movements: bad }));
  }
  console.log(JSON.stringify({ cases, counts, buckets, conflict, maxVisible,
    benchmarks: 12, sourceOrderChecks: 33 * masterOrders.length,
    sourceOrderMismatch: 0, movementOrderMismatch: 0,
    maxDtoBytes: maxBytes, legacyLocal: true, aiUnitPreserved: true }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { createUi, calculateUi, combinations };
