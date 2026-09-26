const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.resolve(__dirname, "..");
const bodyCheckSource = fs.readFileSync(path.join(rootDir, "body-check-ui.js"), "utf8");
const appSource = fs.readFileSync(path.join(rootDir, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
const bodyCheckBootstrap = fs.readFileSync(path.join(rootDir, "body-check", "index.html"), "utf8");
const entityLinksSource = fs.readFileSync(path.join(rootDir, "entity-links.js"), "utf8");
const styles = fs.readFileSync(path.join(rootDir, "styles.css"), "utf8");
const diagnosisEntrySources = [
  appSource,
  fs.readFileSync(path.join(rootDir, "ec-home-ui.js"), "utf8"),
  fs.readFileSync(path.join(rootDir, "sanity-health-library.js"), "utf8"),
  fs.readFileSync(path.join(rootDir, "sanity-health-library-media.js"), "utf8"),
  fs.readFileSync(path.join(rootDir, "scripts", "body-guide-assets.js"), "utf8")
];

function renderInitial(search, hostname = "127.0.0.1") {
  const root = { innerHTML: "" };
  const localStorageStub = {
    getItem() { return null; },
    setItem() {}
  };
  const windowStub = {
    location: { hostname, origin: hostname === "127.0.0.1" ? "http://127.0.0.1:14227" : `https://${hostname}`, search },
    HealthCheckBodyPlatform: null,
    localStorage: localStorageStub,
    setTimeout() {},
    scrollTo() {}
  };
  const sandbox = {
    console,
    window: windowStub,
    location: windowStub.location,
    document: { dispatchEvent() {} },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    URL,
    URLSearchParams,
    encodeURIComponent,
    Date,
    Math,
    Intl,
    localStorage: localStorageStub
  };
  vm.runInNewContext(bodyCheckSource, sandbox, { filename: "body-check-ui.js" });
  const instance = windowStub.createBodyCheck({
    $: (selector) => selector === "#bodyCheckRoot" ? root : null,
    $$: () => [],
    STORAGE_KEY: "test-body-check",
    copyText() {}
  });
  instance.init();
  return { html: root.innerHTML, partMeta: instance.getPartMeta() };
}

const neckRender = renderInitial("?part=neck&from=home-body-selector");
const neckHtml = neckRender.html;
assert(neckHtml.includes("首のセルフチェック"), "The selected body part must appear in the page title.");
assert(neckHtml.includes("首を選択済みです。この内容に合わせて質問します。"));
assert(!neckHtml.includes("body-part-grid"), "A supplied body part must not repeat the full picker before the first question.");
assert(neckHtml.includes("気になる動き・場面はどれですか？"), "A supplied body part must open its first unanswered question with unambiguous wording.");
assert(neckHtml.includes("当てはまるものを1〜3つ選んでください。"), "The first question must state how many answers can be selected.");
assert(neckHtml.includes("質問 1 / 3"), "Preset checks must describe the three questions separately from the result step.");
assert(neckHtml.includes("0 / 3 選択"), "The selection count must be visible before the choices.");
assert(neckHtml.indexOf("0 / 3 選択") < neckHtml.indexOf("diagnosis-option-grid answer-grid"), "Selection feedback must appear before the option list.");
assert(!neckHtml.includes("ほかの場所も追加する"), "Additional locations must be chosen before the question flow starts.");
assert(!neckHtml.includes(">Ne<"), "Decorative English part codes must not be rendered.");
assert(neckHtml.includes("--step-count:4"), "A preset single-part check must render only its four unanswered steps.");
["動き・場面", "感じ方", "症状の特徴", "結果"].forEach((label) => {
  assert(neckHtml.includes(`<strong>${label}</strong>`), `Missing Japanese progress label: ${label}`);
});
assert(!neckHtml.includes("<strong>部位</strong>"), "The completed body-part choice must not remain in preset progress.");
assert(!neckHtml.includes("BODY TRACE"));
assert(!neckHtml.includes("TRACE NODE"));
assert(!neckHtml.includes("LOCATION"));
assert(!neckHtml.includes("CONDITION"));
assert(!neckHtml.includes("SIGNAL"));

const localShoulderResult = renderInitial("?part=shoulder&preview_result=1&sponsor_region=JP-23").html;
assert(localShoulderResult.includes("肩の筋肉候補"), "The local-only result URL must open the shoulder result without repeated answers.");
assert(localShoulderResult.includes("result-muscle-image"), "The local-only result URL must render the muscle image area.");
const productionPreviewSource = bodyCheckSource.slice(
  bodyCheckSource.indexOf("function applyLocalResultPreview()"),
  bodyCheckSource.indexOf("function emit(", bodyCheckSource.indexOf("function applyLocalResultPreview()"))
);
assert(productionPreviewSource.includes("!isLocalPreview()"), "The direct result fixture must remain disabled outside local preview hosts.");
const productionPreview = renderInitial("?part=shoulder&preview_result=1", "health-check-platform-v2.netlify.app").html;
assert(productionPreview.includes("気になる動き・場面はどれですか？"), "Production hosts must ignore the local result fixture query.");
assert(!productionPreview.includes("肩のセルフチェック結果"), "Production hosts must never open the local result fixture.");

const publicQuestionExamples = {
  neck: "下を向く時",
  shoulder: "腕を横から上げる時",
  elbow: "肘を曲げる時",
  wrist: "手首を手のひら側へ曲げる時",
  back: "深呼吸する時",
  lowback: "立ち上がる時",
  buttock: "片脚で立つ時",
  hip: "靴下を履く時",
  thigh: "膝を伸ばす時",
  knee: "階段を下りる時",
  lowerleg: "つま先を上げる時",
  ankle: "朝の一歩目",
  sole: "歩き始め"
};
Object.entries(publicQuestionExamples).forEach(([part, expectedChoice]) => {
  const html = renderInitial(`?part=${part}&from=home-body-selector`).html;
  assert(html.includes("気になる動き・場面はどれですか？"), `${part} must open with the same clear movement question.`);
  assert(html.includes("当てはまるものを1〜3つ選んでください。"), `${part} must explain the multi-select limit.`);
  assert(html.includes(expectedChoice), `${part} must include a concrete, body-part-specific movement choice.`);
});

const multiPartHtml = renderInitial("?part=neck&from=home-body-selector&parts=neck%2Cshoulder").html;
assert(multiPartHtml.includes("首・肩のセルフチェック"), "Multiple initial locations must stay selected after navigation.");
assert(multiPartHtml.includes("今、最も気になる場所はどこですか？"), "Multiple locations must ask for the primary location before movement questions.");
assert(multiPartHtml.includes('value="neck" checked hidden'));
assert(multiPartHtml.includes('value="shoulder" checked hidden'));
assert(!multiPartHtml.includes("body-part-grid"), "The initial multi-selection must not be repeated inside the check flow.");
assert(multiPartHtml.includes("--step-count:5"), "A multi-location check must include the primary-location step.");

const directHtml = renderInitial("").html;
assert(directHtml.includes("症状のセルフチェック"), "Direct visits must keep the normal unselected flow.");
assert(!/body-part-card selected/.test(directHtml), "Direct visits must not invent a selected part.");
assert(directHtml.includes('id="bodyNextBtn" type="button" disabled'), "The direct flow must still require a part selection.");
assert(directHtml.includes("body-part-grid"), "Direct visits must retain the full detailed body-part picker.");
assert(directHtml.includes("--step-count:5"), "Direct visits must retain the five-step flow.");

const legacyScapulaHtml = renderInitial("?part=scapula&from=home-body-selector").html;
assert(legacyScapulaHtml.includes("肩のセルフチェック"), "Legacy shoulder-blade links must safely open the shoulder check.");
assert(!legacyScapulaHtml.includes("肩甲骨周囲"), "The retired shoulder-blade region must not remain visible.");
assert(renderInitial("?part=calf&from=home-body-selector").html.includes("すね・ふくらはぎのセルフチェック"), "Legacy calf links must open the new lower-leg check.");
assert(renderInitial("?part=foot&from=home-body-selector").html.includes("足裏のセルフチェック"), "Legacy foot links must open the new sole check.");

const partMeta = JSON.parse(JSON.stringify(neckRender.partMeta));
const expectedPartIds = ["neck", "shoulder", "elbow", "wrist", "back", "lowback", "hip", "buttock", "thigh", "knee", "lowerleg", "ankle", "sole"];
assert.deepStrictEqual(partMeta.map((item) => item.id), expectedPartIds);
const expectedParents = {
  neck: "neck",
  shoulder: "shoulder",
  elbow: "elbow",
  wrist: "wrist",
  back: "back",
  lowback: "lowback",
  hip: "hip",
  buttock: "buttock",
  thigh: "thigh",
  knee: "knee",
  lowerleg: "lowerleg",
  ankle: "ankle",
  sole: "sole"
};
partMeta.forEach((item) => {
  assert.strictEqual(item.parent, expectedParents[item.id], `Unexpected public parent for ${item.id}`);
  assert(["front", "back"].includes(item.view), `Missing body view for ${item.id}`);
  assert(item.questions.length > 0, `Missing question set for ${item.id}`);
  assert(item.questions.includes("movement_unclear"), `${item.id} must let people answer truthfully when no movement or scene is clear.`);
  assert(item.painLocations.length >= 4, `${item.id} needs concrete pain-location choices plus an unclear option.`);
  assert(item.painLocations.includes("location_unclear"), `${item.id} must not force a precise pain location.`);
});
assert(neckHtml.includes("特定の動き・場面は分からない"), "Every question flow must provide a non-forcing movement answer.");

assert(appSource.includes('document.body.classList.toggle("body-check-light", bodyCheck)'));
assert(appSource.includes('document.documentElement.classList.toggle("body-check-light", bodyCheck)'));
assert(indexHtml.includes('document.documentElement.classList.add("body-check-light")'), "Direct loads need the light class before first paint.");
assert(bodyCheckBootstrap.includes("background:#f7fbf8"), "The direct-route bootstrap must use the light surface.");
assert(!bodyCheckBootstrap.includes("#06171e"), "The retired dark bootstrap must not return.");
assert(bodyCheckBootstrap.includes("症状のセルフチェックを開く"));
assert(styles.includes("/* Body check: route-scoped light interface shared with the home experience. */"));
const scopedStyles = styles.split("/* Body check: route-scoped light interface shared with the home experience. */")[1];
assert(scopedStyles.includes("grid-template-columns: repeat(var(--step-count), minmax(0, 1fr));"));
assert(!scopedStyles.includes("overflow-x: auto"), "The light progress UI must not reintroduce an internal horizontal scroller.");
assert(!scopedStyles.includes("!important"), "The route theme must not depend on forced overrides.");

assert(bodyCheckSource.includes('aria-pressed="${selected}"'), "Question choices must expose their selected state.");
assert(bodyCheckSource.includes('class="selection-feedback" aria-live="polite"'), "Question choices need immediate selection feedback.");
assert(bodyCheckSource.includes('selected ? "選択中" : esc(kindLabel)'), "Selected choices must use an explicit selected-state label.");
assert(!neckHtml.includes("<span class=\"node-label\">選択肢</span>"), "Repeated generic choice labels must not obscure the answer text.");
assert(bodyCheckSource.includes("感じ方・動かしにくさ"));
assert(bodyCheckSource.includes("動いたり休んだりした後の変化"));
assert(bodyCheckSource.includes("感じ方や変化で、近いものはどれですか？"));
assert(bodyCheckSource.includes("動きとの関係がはっきりしなくても大丈夫です"));
assert(bodyCheckSource.includes("症状について、あと4つ教えてください"));
assert(bodyCheckSource.includes("気になる場所に一番近いのは？"));
assert(!bodyCheckSource.includes("どのあたりが気になりますか？"), "The detailed-location question must use a concrete instruction.");
assert(bodyCheckSource.includes("前・後ろ・横など、一番近い場所を選んでください。"));
assert(bodyCheckSource.includes("場所ははっきり分からない"), "People who cannot identify a precise location need a truthful answer option.");
assert(bodyCheckSource.includes("下の4問に1つずつ回答してください"));
assert(bodyCheckSource.includes("${index} / 4"), "The supplement groups must show the four-question count.");
assert(bodyCheckSource.includes("いつ気になりますか？"));
assert(bodyCheckSource.includes("ほぼずっと気になる"), "Chronic symptoms need an answer that does not depend on a particular movement.");
assert(bodyCheckSource.includes("日によって違う・よく分からない"), "People who cannot identify a precise timing need a truthful answer option.");
assert(bodyCheckSource.includes("どちら側が気になりますか？"));
assert(bodyCheckSource.includes("気になる感じはどこまでありますか？"));
assert(bodyCheckSource.includes("state.painLocation && state.timing && state.side && state.spread"), "A result must require the detailed location alongside the existing supplement answers.");
assert(bodyCheckSource.includes('if (step === "situations") return "感じ方へ";'));
assert(bodyCheckSource.includes('if (step === "symptoms") return "症状の特徴へ";'));
assert(!bodyCheckSource.includes("renderReturnVisit"), "A previous-record card must not interrupt the question flow.");
assert(!bodyCheckSource.includes('class="return-visit-note"'), "A previous-record card must not interrupt the question flow.");
assert(!styles.includes(".return-visit-note"), "Removed previous-record presentation styles must not remain unused.");
assert(!bodyCheckSource.includes("addBodyPartBtn"), "The retired mid-flow add-location control must not return.");
assert(bodyCheckSource.includes('class="result-quick-facts"'), "The result must summarize the selected part, side, and movement.");
assert(bodyCheckSource.includes("選んだ部位"));
assert(bodyCheckSource.includes("気になった動作"));
assert(!bodyCheckSource.includes("前回との変化"), "The result must not foreground previous-comparison UI.");
assert(!bodyCheckSource.includes('id="compareBodyBtn"'), "The result record panel must not include a previous-comparison control.");
assert(!bodyCheckSource.includes("/assets/body-guide/body-selector-${regionVisual.view}"), "The result must not repeat the normal body beside the muscle body.");
assert(bodyCheckSource.includes("/assets/body-guide/body-muscles-front-face-1536.png"), "The front result must use the muscle body with natural facial features.");
assert(bodyCheckSource.includes("/assets/body-guide/body-muscles-back-1536.png"), "The rear result must keep the rear muscle body.");
assert(fs.existsSync(path.join(rootDir, "assets", "body-guide", "body-muscles-front-1536.png")));
assert(fs.existsSync(path.join(rootDir, "assets", "body-guide", "body-muscles-front-face-1536.png")));
assert(fs.existsSync(path.join(rootDir, "assets", "body-guide", "body-muscles-back-1536.png")));
assert(bodyCheckSource.includes('data-muscle-candidate="${index}"'), "Candidate muscles must control the body highlight.");
assert(bodyCheckSource.includes('class="result-muscle-stage"'), "The muscle body must lead the result without opening a disclosure.");
assert(bodyCheckSource.includes('${esc(result.regionLabel)}のセルフチェック結果'), "The result heading must be short and immediately understandable.");
assert(!bodyCheckSource.includes("候補筋を、位置と回答から確認"), "The previous long result heading must not return.");
[
  "筋肉人体で確認",
  "選択中の候補筋",
  "だけで整理",
  "回答との重なりが多い順に表示しています。",
  "ハイライトは、筋肉のおおよその位置を示しています。",
  "個人情報・診断ID・参考スコアは含みません。",
  "まだこの端末の履歴には記録していません。ログインなしで利用できます。"
].forEach((copy) => assert(!bodyCheckSource.includes(copy), `Redundant result microcopy remains: ${copy}`));
assert(!bodyCheckSource.includes('class="result-muscle-rank"'), "The muscle image must not repeat the selected rank.");
assert(!bodyCheckSource.includes('class="muscle-visual-meta"'), "Candidate evidence must be shown once in the readable clue list.");
assert(!bodyCheckSource.includes('class="muscle-result-note"'), "The muscle image must not carry redundant explanatory copy.");
assert(bodyCheckSource.includes("result-muscle-explorer"), "The muscle body and selected-part ranking must be one result experience.");
assert(bodyCheckSource.includes('class="result-muscle-ranking"'), "The selected-part ranking must sit beside the muscle body.");
assert(bodyCheckSource.includes("muscle-result-hero"), "The result must use one focused muscle-body hero.");
assert(bodyCheckSource.includes('class="muscle-result-figure"'), "The muscle image must be the first item in the result hero.");
assert(bodyCheckSource.includes('id="resultHeroTitle"'), "The leading muscle result must provide the result H1.");
assert(!bodyCheckSource.includes("を表示中</p>"), "The selected candidate must be clear without a redundant status label.");
assert(bodyCheckSource.includes('class="muscle-clue-list"'), "The result must summarize candidate clues in a readable list.");
assert(bodyCheckSource.includes("候補にした理由"), "The candidate rationale needs a concise, user-facing heading.");
assert(!bodyCheckSource.includes('class="muscle-match-flow"'), "The cramped arrow flow must not return.");
assert(bodyCheckSource.includes('(max-width: 760px) calc(100vw - 32px), (max-width: 1100px) 520px, 600px'), "The muscle-body image must request an immersive display size.");
assert(bodyCheckSource.includes("notes.length ?"), "Candidate notes must only appear when an answer needs clarification.");
assert(!bodyCheckSource.includes("問題のある筋肉や痛みの原因を確定することはできず、医学的な確率を示すものでもありません。"), "The old verbose ranking caveat must not return.");
assert(!bodyCheckSource.includes('class="result-anatomy-pair"'), "The retired normal-body comparison must not return.");
assert(!bodyCheckSource.includes("今回の回答を見る"), "The retired answer disclosure must not return.");
assert(!bodyCheckSource.includes("記録用の参考スコア"), "The retired reference score must not return.");
assert(!bodyCheckSource.includes("負担スコア"), "History must not display a reference score.");
assert(!bodyCheckSource.includes("負担レベル："), "Copied summaries must not contain a reference score.");
assert(!styles.includes(".result-answer-grid"), "Removed answer-score styles must not remain unused.");
assert(!bodyCheckSource.includes("利用者の匿名傾向を見る"), "The anonymous trend card must not compete with the result actions.");
assert(!bodyCheckSource.includes("resultCommunityInsights"), "The result must not fetch aggregate trends for a removed card.");
assert(!bodyCheckSource.includes("getCommunityInsights"), "The result flow must not retain an unused aggregate-view dependency.");
assert(bodyCheckSource.includes("匿名傾向に任意で参加する"), "Optional anonymous demographics must remain available for aggregation.");
assert(appSource.includes("const CommunityInsights = (() =>"), "Anonymous aggregation rendering must remain available outside the result screen.");
assert(appSource.includes("CommunityInsights.refresh();"), "The existing community aggregate page must continue to load its data.");
[
  "次に確認する情報",
  "AIで詳しい解説を見る",
  "結果を共有する"
].forEach((copy) => assert(!bodyCheckSource.includes(copy), `Removed result section remains: ${copy}`));
assert(!bodyCheckSource.includes("resultRelatedArticles"), "The removed related-information section must not keep a background article fetch.");
assert(!bodyCheckSource.includes("function refreshRelatedArticles"), "The removed related-information section must not keep its selector logic.");
assert(!bodyCheckSource.includes("function bodyAiPayload"), "The removed AI explanation must not keep a payload builder.");
assert(!bodyCheckSource.includes('id="bodyAiBtn"'), "The removed AI explanation button must not remain.");
assert(!bodyCheckSource.includes('id="copyBodyShareBtn"'), "The removed share control must not remain.");
assert(!styles.includes(".diagnosis-related-grid"), "Removed result-related card styles must not remain unused.");
assert(bodyCheckSource.includes("筋肉の影響とストレッチをコピー"));
assert(bodyCheckSource.includes("硬さが続くと、何が起こる？") && bodyCheckSource.includes("候補筋の働きと、無理なく試せるストレッチをAIで整理できます。"), "The AI handoff must lead with the two concrete benefits.");
assert(bodyCheckSource.includes("追加質問はせず"), "The copied AI prompt must request an answer without another interview.");
assert(!bodyCheckSource.includes("AIが追加で最大3問。"), "The removed follow-up-question flow must not return.");
assert(!bodyCheckSource.includes("私が追加質問へ回答した後"), "The user must not be required to answer another question sequence.");
assert(bodyCheckSource.includes("候補筋が実際に硬くなっていることは、このセルフチェックだけでは確認できません。"), "The prompt must not claim that a candidate muscle is actually tight.");
assert(bodyCheckSource.includes("1. 候補筋が硬い・動きにくい場合に起こりうること"), "The first AI section must explain possible functional impact.");
assert(bodyCheckSource.includes("2. ストレッチアドバイス"), "The second AI section must provide stretching guidance.");
assert(bodyCheckSource.includes("今の回答に合うストレッチまたは軽い動きを最大2つ"), "The copied AI prompt must keep self-care suggestions focused.");
assert(bodyCheckSource.includes("ストレッチの提案を止めて医療機関への相談を優先してください"), "The copied AI prompt must stop self-care suggestions when warning signs are present.");
assert(bodyCheckSource.includes("aiAdviceProfile(result)"), "The copied AI prompt must apply body-part-specific safety and stretch guidance.");
assert(bodyCheckSource.includes('id="copyAiHandoffBtn"'));
assert(bodyCheckSource.includes('id="aiHandoffStatus" aria-live="polite" hidden'), "AI copy feedback must stay hidden until the user acts.");
assert(bodyCheckSource.includes("status.hidden = false"), "Copy feedback must become visible after an attempted copy.");
assert(bodyCheckSource.includes("Health Check Labは、身体の部位・動き・感じ方から、関連する可能性のある筋肉を整理する健康情報サービスです。"), "The copied handoff must identify Health Check Lab to the receiving AI.");
assert(bodyCheckSource.includes("結果ページ：${aiHandoffUrl(result)}"), "The copied handoff must include a return URL.");
assert(bodyCheckSource.includes('url.searchParams.set("utm_source", "ai_handoff")'), "The AI return URL must remain measurable without including a diagnosis identifier.");
assert(!bodyCheckSource.includes('url.searchParams.set("diagnosis_id"'), "The AI return URL must not expose a diagnosis identifier.");
assert(appSource.includes('toast(copied ? "コピーしました" : "コピーできませんでした")') && appSource.includes("return copied;"), "Copy actions must report success or failure to the result UI.");
assert(appSource.includes('document.execCommand("copy")'), "Copy actions need a fallback when the Clipboard API is unavailable.");
assert(bodyCheckSource.includes("今の自分を、あとで振り返る"), "The record card must state why keeping this result matters.");
assert(bodyCheckSource.includes("選んだ部位・気になった動き・候補筋を残しておくと、次のチェックで以前の自分と見比べられます。"), "The record card must explain the reflection value before asking the user to save.");
assert(bodyCheckSource.includes("今日の身体を記録する"), "The record CTA must describe the action in the user's terms.");
assert(!bodyCheckSource.includes("7日後の変化を比べる"), "The record card must not imply that it directly measures pain change.");
assert(bodyCheckSource.includes('class="record-value-flow"'), "The record card must show the path from today's record to a later comparison.");
assert(!bodyCheckSource.includes("今回をあとで見返す"), "The vague previous record heading must not return.");
assert(!bodyCheckSource.includes("次回のセルフチェックと比べられます。"), "The old generic record explanation must not return.");
assert(bodyCheckSource.includes("次の確認目安："));
assert(bodyCheckSource.includes('${currentSaved ? "" : "hidden"}'), "Unsaved record status must not occupy the result before an action.");
assert(bodyCheckSource.includes("回答を見直す"), "The result must preserve a route back to the answered questions.");
assert(bodyCheckSource.includes("state.selectedParts = [retryPart]"), "A repeat check must keep the result body part selected.");

const recordExperienceStart = bodyCheckSource.indexOf("function renderRecordExperience(result)");
const recordExperienceEnd = bodyCheckSource.indexOf("function renderPopulationInsight", recordExperienceStart);
const recordExperienceBlock = bodyCheckSource.slice(recordExperienceStart, recordExperienceEnd);
const recordFlowPosition = recordExperienceBlock.indexOf('class="record-value-flow"');
const recordCtaPosition = recordExperienceBlock.indexOf('id="saveBodyBtn"');
const recordHistoryPosition = recordExperienceBlock.indexOf('id="historyBodyBtn"');
assert(recordFlowPosition >= 0 && recordFlowPosition < recordCtaPosition, "The reason to record must appear before the record CTA.");
assert(recordCtaPosition >= 0 && recordCtaPosition < recordHistoryPosition, "The record CTA must appear before device history actions.");
assert(!recordExperienceBlock.includes("comparisonSummary"), "The record panel must not calculate an unused previous comparison.");
assert(!styles.includes('.body-record-panel .record-panel-head > div > p:not(.trace-label) {\n    display: none;'), "The value of recording must remain visible on mobile.");
const historyRecordStart = bodyCheckSource.indexOf("function historyRecordData(item)");
const historyRecordEnd = bodyCheckSource.indexOf("function renderRecordExperience(result)", historyRecordStart);
const historyRecordBlock = bodyCheckSource.slice(historyRecordStart, historyRecordEnd);
assert(historyRecordStart >= 0, "History must derive its visual from the existing saved record.");
assert(historyRecordBlock.includes('class="history-body-visual"'), "History must include a visual body thumbnail rather than text rows only.");
assert(historyRecordBlock.includes("renderMuscleHighlights(record.visual, record.side)"), "History must highlight the recorded candidate area on the body thumbnail.");
assert(historyRecordBlock.includes("気になった動き"), "History must retain the movement context beside the visual.");
assert(historyRecordBlock.includes('class="history-muscle-tags"'), "History must show candidate muscles in a scannable visual group.");
assert(recordExperienceBlock.includes("これまでの身体の記録"), "History must be presented as the user's body record.");

assert(!bodyCheckSource.includes("function renderResultOverview(result)"), "A separate state-summary card must not appear above the muscle body.");
const resultStart = bodyCheckSource.indexOf("function renderResult()");
const loadingStart = bodyCheckSource.indexOf("function renderLoading()", resultStart);
const resultBlock = bodyCheckSource.slice(resultStart, loadingStart);
const recordPosition = resultBlock.indexOf("renderRecordExperience(result)");
const detailPosition = resultBlock.indexOf("renderBodyDiscovery(result)");
const safetyPosition = resultBlock.indexOf('class="result-safety-note');
const aiHandoffPosition = resultBlock.indexOf("renderAiHandoff(result)");
assert(detailPosition >= 0 && detailPosition < safetyPosition && safetyPosition < aiHandoffPosition && aiHandoffPosition < recordPosition, "Result order must explain a selected caution directly after the muscle result, before AI copy and recording.");
assert.strictEqual((resultBlock.match(/class="result-safety-note/g) || []).length, 1, "The result safety note must remain available for danger responses.");
assert(!resultBlock.includes("結果の見方"), "The retired generic result guide must not return.");
assert(!resultBlock.includes("病名や痛みの原因を確定するものではありません。"), "The retired generic limitation must not return on every result.");
assert(!resultBlock.includes("気になる症状があります"), "The safety heading must identify the selected answer instead of using vague concern wording.");
assert(resultBlock.includes('${esc(result.dangerSigns.join("・"))}') && resultBlock.includes("を選んだため表示しています") && resultBlock.includes("セルフケアより医療機関への相談を優先してください"), "Danger responses must explain why the note appeared and retain concise medical-care guidance.");
assert(!appSource.includes("body-experience-note"), "The same generic limitation must not repeat below every check screen.");
assert(!entityLinksSource.includes("この結果は医療診断ではなく"), "The supervision card must not repeat the result limitation.");
assert(entityLinksSource.includes("<h3>運営・監修</h3>"), "The shared result footer should focus on who operates and supervises the service.");
assert(entityLinksSource.includes('class="inline-actions clinic-context-actions"'), "The result supervision links need a dedicated vertical action group.");
assert(styles.includes(".clinic-context-actions") && styles.includes("flex-direction: column;"), "The result supervision links must stack vertically.");
const discoveryStart = bodyCheckSource.indexOf("function renderBodyDiscovery(result)");
const explorerBindStart = bodyCheckSource.indexOf("function bindMuscleExplorer()", discoveryStart);
const discoveryBlock = bodyCheckSource.slice(discoveryStart, explorerBindStart);
const figurePosition = discoveryBlock.indexOf("renderMuscleFigure(result, 0)");
const rankingPosition = discoveryBlock.indexOf("renderCandidateRanking(result)");
const copyPosition = discoveryBlock.indexOf("renderMuscleCopy(result, 0)");
assert(figurePosition >= 0 && figurePosition < rankingPosition && rankingPosition < copyPosition, "The responsive reading order must be muscle body, selected-part ranking, then its explanation.");

const ruleBlock = bodyCheckSource.match(/const muscleRules = \[([\s\S]*?)\n  \];/);
const visualBlock = bodyCheckSource.match(/const muscleVisuals = \{([\s\S]*?)\n  \};/);
const situationBlock = bodyCheckSource.match(/const situationByPart = (\{[\s\S]*?\n  \});/);
const locationBlock = bodyCheckSource.match(/const painLocationByPart = (\{[\s\S]*?\n  \});/);
const aiDeepDiveBlock = bodyCheckSource.match(/const aiDeepDiveByPart = (\{[\s\S]*?\n  \});/);
const aiSymptomBlock = bodyCheckSource.match(/const aiSymptomGuidance = (\{[\s\S]*?\n  \});/);
const aiTimingBlock = bodyCheckSource.match(/const aiTimingGuidance = (\{[\s\S]*?\n  \});/);
const aiSpreadBlock = bodyCheckSource.match(/const aiSpreadGuidance = (\{[\s\S]*?\n  \});/);
const aiSideBlock = bodyCheckSource.match(/const aiSideGuidance = (\{[\s\S]*?\n  \});/);
const symptomOptionsBlock = bodyCheckSource.match(/const symptomOptions = (\[[\s\S]*?\n  \]);/);
const timingOptionsBlock = bodyCheckSource.match(/const timingOptions = (\[[\s\S]*?\n  \]);/);
const sideOptionsBlock = bodyCheckSource.match(/const sideOptions = (\[[^\n]+\]);/);
const spreadOptionsBlock = bodyCheckSource.match(/const spreadOptions = (\[[^\n]+\]);/);
assert(ruleBlock && visualBlock && situationBlock && locationBlock, "Question, detailed-location, muscle-rule, and display mappings must exist.");
assert(aiDeepDiveBlock && aiSymptomBlock && aiTimingBlock && aiSpreadBlock && aiSideBlock, "Every answer axis needs an AI deep-dive mapping.");
assert(symptomOptionsBlock && timingOptionsBlock && sideOptionsBlock && spreadOptionsBlock, "AI prompt coverage must be checked against the live answer options.");
const ruleNames = [...ruleBlock[1].matchAll(/name: "([^"]+)"/g)].map((match) => match[1]);
ruleNames.forEach((name) => {
  assert(visualBlock[1].includes(`"${name}":`), `Missing body highlight mapping for ${name}`);
});
[
  "頭板状筋・頸板状筋",
  "棘下筋・小円筋",
  "大胸筋",
  "上腕二頭筋",
  "前腕屈筋・回内筋群",
  "手首の屈筋群",
  "親指を開く・伸ばす筋群",
  "腹斜筋群",
  "小臀筋",
  "大腿筋膜張筋",
  "膝窩筋",
  "腓腹筋",
  "ヒラメ筋",
  "腓骨筋群",
  "短趾屈筋",
  "足底方形筋"
].forEach((name) => assert(ruleNames.includes(name), `Expanded candidate coverage is missing ${name}.`));

const parsedRules = vm.runInNewContext(`[${ruleBlock[1]}]`);
const parsedSituations = vm.runInNewContext(`(${situationBlock[1]})`);
const parsedLocations = vm.runInNewContext(`(${locationBlock[1]})`);
const parsedAiDeepDive = vm.runInNewContext(`(${aiDeepDiveBlock[1]})`);
const parsedAiSymptoms = vm.runInNewContext(`(${aiSymptomBlock[1]})`);
const parsedAiTiming = vm.runInNewContext(`(${aiTimingBlock[1]})`);
const parsedAiSpread = vm.runInNewContext(`(${aiSpreadBlock[1]})`);
const parsedAiSide = vm.runInNewContext(`(${aiSideBlock[1]})`);
const parsedSymptomOptions = vm.runInNewContext(symptomOptionsBlock[1]);
const parsedTimingOptions = vm.runInNewContext(timingOptionsBlock[1]);
const parsedSideOptions = vm.runInNewContext(sideOptionsBlock[1]);
const parsedSpreadOptions = vm.runInNewContext(spreadOptionsBlock[1]);
const optionIds = (options) => Array.from(options, ([id]) => id).sort();
assert.deepStrictEqual(Object.keys(parsedAiDeepDive).sort(), Object.keys(parsedSituations).sort(), "Every diagnosable body part needs its own AI follow-up and safety profile.");
assert.deepStrictEqual(Object.keys(parsedAiSymptoms).sort(), optionIds(parsedSymptomOptions), "Every symptom answer must change the AI deep-dive prompt.");
assert.deepStrictEqual(Object.keys(parsedAiTiming).sort(), optionIds(parsedTimingOptions), "Every timing answer must change the AI deep-dive prompt.");
assert.deepStrictEqual(Object.keys(parsedAiSpread).sort(), optionIds(parsedSpreadOptions), "Every spread answer must change the AI deep-dive prompt.");
assert.deepStrictEqual(Object.keys(parsedAiSide).sort(), optionIds(parsedSideOptions), "Every side answer must change the AI deep-dive prompt.");
Object.entries(parsedAiDeepDive).forEach(([partId, profile]) => {
  ["followUp", "comparison", "stretch", "safety"].forEach((field) => {
    assert(String(profile[field] || "").length >= 20, `${partId}.${field} needs useful, part-specific AI guidance.`);
  });
});
assert.strictEqual(new Set(Object.values(parsedAiDeepDive).map((profile) => profile.followUp)).size, Object.keys(parsedAiDeepDive).length, "Body-part prompts must not collapse into one generic follow-up.");
assert(bodyCheckSource.includes("situationOptionsForPart(result.regionId)"), "The copied prompt must carry the selected movement pattern into the AI handoff.");
assert(bodyCheckSource.includes("painLocationOptionsForPart(result.regionId)"), "The copied prompt must carry the selected detailed location into the AI handoff.");
assert(bodyCheckSource.includes('answers.spread === "limb"'), "Limb spread must switch the AI handoff to safety-first follow-up.");
assert(bodyCheckSource.includes("今回はストレッチを提案せず、医療機関への相談を優先すべき理由と目安を説明してください。"), "Neurologic answer patterns must replace stretch advice with a safety-first response.");
const supportsSituation = (rule, situationId) => [
  ...(rule.motions || []),
  ...(rule.contraction || []),
  ...(rule.stretch || []),
  ...(rule.bonus || [])
].includes(situationId);
Object.entries(parsedSituations).forEach(([partId, options]) => {
  const directRules = parsedRules.filter((rule) => rule.primary.includes(partId));
  assert(directRules.length >= 3, `${partId} needs at least three directly relevant muscle candidates.`);
  options.forEach(([situationId, question]) => {
    const supported = directRules.some((rule) => supportsSituation(rule, situationId));
    assert(supported, `${partId} question "${question}" must connect to evidence from a muscle assigned directly to that body part.`);
  });
});
const allSituationIds = new Set(Object.values(parsedSituations).flatMap((options) => options.map(([id]) => id)));
parsedRules.forEach((rule) => {
  const directEvidence = new Set([...(rule.motions || []), ...(rule.contraction || []), ...(rule.stretch || [])]);
  ["motions", "contraction", "stretch", "bonus"].forEach((field) => {
    (rule[field] || []).forEach((id) => assert(allSituationIds.has(id), `${rule.name}.${field} references a question that no longer exists: ${id}.`));
  });
  (rule.bonus || []).forEach((id) => assert(!directEvidence.has(id), `${rule.name} counts ${id} as both direct evidence and context.`));
});
Object.entries(parsedLocations).forEach(([partId, options]) => {
  const labels = options.map(([, locationLabel]) => locationLabel);
  assert.strictEqual(new Set(labels).size, labels.length, `${partId} detailed-location labels must be unique.`);
  const supportedMuscles = new Set(options.flatMap(([, , muscles]) => muscles || []));
  const directRules = parsedRules.filter((rule) => rule.primary.includes(partId));
  directRules.forEach((rule) => {
    assert(supportedMuscles.has(rule.name), `${partId} location choices must cover the direct candidate ${rule.name}.`);
  });
  options.forEach(([, locationLabel, muscles]) => {
    muscles.forEach((muscle) => {
      const rule = directRules.find((item) => item.name === muscle);
      assert(rule, `${partId} location "${locationLabel}" contains an unrelated candidate: ${muscle}.`);
      assert(rule.locationOnly || (options.length && parsedSituations[partId].some(([id]) => supportsSituation(rule, id))), `${partId} location "${locationLabel}" contains ${muscle}, but no current ${partId} question can support it.`);
    });
  });
});
const candidateNamesFor = (partId, locationId, situationId) => {
  const allowedNames = parsedLocations[partId].find(([id]) => id === locationId)?.[2] || [];
  const candidates = parsedRules.filter((rule) => rule.primary.includes(partId) && allowedNames.includes(rule.name));
  const matched = candidates.filter((rule) => supportsSituation(rule, situationId));
  return Array.from((matched.length ? matched : candidates).slice(0, 5), (rule) => rule.name);
};
let reviewedCombinationCount = 0;
Object.entries(parsedLocations).forEach(([partId, locations]) => {
  locations.forEach(([locationId, locationLabel, allowedNames]) => {
    parsedSituations[partId].forEach(([situationId, situationLabel]) => {
      reviewedCombinationCount += 1;
      const candidates = candidateNamesFor(partId, locationId, situationId);
      assert(candidates.length > 0 && candidates.length <= 5, `${partId} / ${locationLabel} / ${situationLabel} must return one to five candidates.`);
      candidates.forEach((muscle) => {
        const rule = parsedRules.find((item) => item.name === muscle);
        assert(allowedNames.includes(muscle), `${partId} / ${locationLabel} / ${situationLabel} returned a candidate outside the selected location: ${muscle}.`);
        assert(rule?.primary.includes(partId), `${partId} / ${locationLabel} / ${situationLabel} returned a muscle not assigned directly to that body part: ${muscle}.`);
      });
    });
  });
});
assert.strictEqual(reviewedCombinationCount, 402, "The exhaustive location-and-movement review must cover all 402 current combinations.");
let unclearLocationCombinationCount = 0;
Object.entries(parsedSituations).forEach(([partId, situations]) => {
  const directCandidates = parsedRules.filter((rule) => rule.primary.includes(partId));
  situations.forEach(([situationId, situationLabel]) => {
    unclearLocationCombinationCount += 1;
    const matched = directCandidates.filter((rule) => supportsSituation(rule, situationId));
    const candidates = (matched.length ? matched : directCandidates).slice(0, 5);
    assert(candidates.length > 0, `${partId} / unclear location / ${situationLabel} must still return a direct body-part candidate.`);
    candidates.forEach((rule) => assert(rule.primary.includes(partId), `${partId} / unclear location / ${situationLabel} returned an adjacent-only muscle: ${rule.name}.`));
  });
});
assert.strictEqual(unclearLocationCombinationCount, 105, "The unclear-location review must cover every current body-part movement question.");
const neckLocations = Object.fromEntries(parsedLocations.neck.map(([id, locationLabel, muscles]) => [id, { locationLabel, muscles }]));
assert(!neckLocations.neck_back.muscles.includes("斜角筋"), "The lateral/anterior scalenes must not be linked to the posterior neck.");
assert(neckLocations.neck_side.muscles.includes("斜角筋"), "The scalenes must remain available for the side-neck choice.");
assert(!neckLocations.neck_back.muscles.includes("胸鎖乳突筋"), "The sternocleidomastoid must not be linked to the posterior neck.");
const neckRules = Object.fromEntries(parsedRules.filter((rule) => rule.primary.includes("neck")).map((rule) => [rule.name, rule]));
assert(!neckRules["胸鎖乳突筋"].motions.includes("phone_long"), "Posture context must not be counted as direct SCM movement evidence.");
assert(!neckRules["斜角筋"].motions.includes("desk_work"), "Desk work must not be counted as direct scalene movement evidence.");
assert(neckRules["後頭下筋群"].stretch.includes("look_down"), "Looking down should be treated as a stretch clue for the posterior upper neck, not a contraction clue.");
assert(!neckRules["肩甲挙筋"].motions.includes("move_neck"), "Muscle rules must not depend on a question option that does not exist.");
const locationMuscles = (partId, locationId) => parsedLocations[partId].find(([id]) => id === locationId)?.[2] || [];
assert.deepStrictEqual(Array.from(locationMuscles("elbow", "elbow_inner")), ["前腕屈筋・回内筋群"], "Inner-elbow results must not mix in unrelated upper-arm candidates.");
assert.deepStrictEqual(Array.from(locationMuscles("wrist", "wrist_thumb")), ["親指を開く・伸ばす筋群", "手首の伸筋群"], "Thumb-side wrist results must stay within the reviewed radial-side candidates.");
assert.deepStrictEqual(Array.from(locationMuscles("hip", "hip_inner")), ["内転筋"], "Inner-hip results must not mix in the anterior-groin iliopsoas candidate.");
assert(!supportsSituation(parsedRules.find((rule) => rule.name === "腸腰筋"), "open_leg"), "Opening the leg must not be treated as direct iliopsoas evidence.");
assert.deepStrictEqual(candidateNamesFor("hip", "hip_front_groin", "open_leg"), ["縫工筋"], "Front-hip open-leg results must use the sartorius rather than the iliopsoas.");
assert.deepStrictEqual(candidateNamesFor("hip", "hip_outer", "open_leg"), ["中臀筋", "小臀筋", "大腿筋膜張筋"], "Outer-hip open-leg results must use the reviewed hip abductors.");
const middleTrapeziusRule = parsedRules.find((rule) => rule.name === "僧帽筋中部");
const lowerTrapeziusRule = parsedRules.find((rule) => rule.name === "僧帽筋下部");
const latissimusRule = parsedRules.find((rule) => rule.name === "広背筋");
[middleTrapeziusRule, lowerTrapeziusRule].forEach((rule) => {
  ["twist_body", "extend_back", "deep_breath"].forEach((movement) => assert(!(rule.motions || []).includes(movement), `${rule.name} must not be presented as a direct trunk-movement or breathing candidate.`));
});
assert(latissimusRule.locationOnly && !(latissimusRule.motions || []).length, "Latissimus dorsi must remain a location-only back candidate until the questionnaire asks about its upper-limb actions.");
assert(locationMuscles("knee", "knee_outer").includes("膝窩筋"), "The posterolateral popliteus must remain available for the outer-knee choice.");
const extrinsicLowerLegMuscles = ["腓腹筋", "ヒラメ筋", "腓骨筋群", "前脛骨筋", "後脛骨筋"];
const soleLocationMuscles = parsedLocations.sole.flatMap(([, , muscles]) => muscles);
extrinsicLowerLegMuscles.forEach((muscle) => {
  assert(!soleLocationMuscles.includes(muscle), `${muscle} must not be presented as if its muscle belly were located in the sole.`);
});
assert(locationMuscles("sole", "sole_inner").includes("短趾屈筋"), "The medial-arch choice must include a plantar intrinsic muscle located within the sole.");
assert(locationMuscles("sole", "sole_inner").includes("母趾外転筋"), "The medial-arch choice must include the medial plantar intrinsic muscle.");
assert(locationMuscles("sole", "sole_outer").includes("小趾外転筋"), "The outer-sole choice must include the lateral plantar intrinsic muscle.");
const directSoleRules = Array.from(parsedRules.filter((rule) => rule.primary.includes("sole")), (rule) => rule.name).sort();
assert.deepStrictEqual(directSoleRules, ["短趾屈筋", "母趾外転筋", "小趾外転筋", "短母趾屈筋", "足底方形筋", "短小趾屈筋", "母趾内転筋", "虫様筋・骨間筋群"].sort(), "Sole results must rank intrinsic plantar muscles instead of lower-leg muscle bellies.");
const posteriorTibialisRule = parsedRules.find((rule) => rule.name === "後脛骨筋");
assert(!posteriorTibialisRule.primary.includes("sole") && posteriorTibialisRule.related.includes("sole"), "Tibialis posterior may remain a related sole mover, but not a direct sole-location candidate.");
assert(locationMuscles("back", "back_upper").includes("僧帽筋上部") && !locationMuscles("back", "back_upper").includes("広背筋"), "Upper-back location candidates must match the upper-back body display.");
assert(locationMuscles("buttock", "buttock_lower").includes("ハムストリングス") && !locationMuscles("buttock", "buttock_lower").includes("梨状筋"), "Lower-buttock location candidates must use the proximal hamstrings instead of the deep upper-buttock piriformis.");
assert(!locationMuscles("lowback", "lowback_pelvis_top").includes("大臀筋"), "A lower-back answer must not highlight the gluteus maximus as if it occupied the lumbar area.");
assert(!ruleNames.includes("下腿三頭筋"), "The triceps surae group must not duplicate its soleus member in one candidate list.");
assert(!ruleNames.includes("菱形筋") && !ruleNames.includes("前鋸筋"), "Retired shoulder-blade-only candidates must not remain in the active diagnosis rules.");
const expectedLocationLabels = {
  neck: ["首の前", "首の横", "首の後ろ"],
  shoulder: ["肩の前", "肩の横", "肩の上", "肩の後ろ"],
  elbow: ["肘の前", "肘の内側", "肘の外側", "肘の後ろ"],
  wrist: ["手首の手のひら側", "手首の手の甲側", "手首の親指側", "手首の小指側"],
  back: ["背中の上", "背中の中央", "背中の横", "背中の下"],
  lowback: ["腰の中央", "腰の横", "腰の下（骨盤の上）"],
  hip: ["股関節の前（脚の付け根）", "股関節の横", "股関節の後ろ", "股関節の内側（内ももの付け根）"],
  buttock: ["お尻の上・外側", "お尻の中央", "お尻の下"],
  thigh: ["太ももの前", "太ももの後ろ", "太ももの内側", "太ももの外側"],
  knee: ["膝の前", "膝の内側", "膝の外側", "膝の後ろ"],
  lowerleg: ["すね側（前）", "ふくらはぎ側（後ろ）", "すね・ふくらはぎの内側", "すね・ふくらはぎの外側"],
  ankle: ["足首の前", "足首の内側", "足首の外側", "足首の後ろ"],
  sole: ["かかと側", "土踏まずの内側", "足裏の中央", "足裏の外側", "足指の付け根"]
};
Object.entries(expectedLocationLabels).forEach(([partId, expectedLabels]) => {
  assert.deepStrictEqual(Array.from(parsedLocations[partId], ([, locationLabel]) => locationLabel), expectedLabels, `${partId} location labels must retain the reviewed, landmark-based wording.`);
});
[
  "首の付け根",
  "首と肩の境目",
  "腕の付け根・肩の前側",
  "腕の付け根・肩の後ろ側",
  "脚の付け根・前側（そけい部）",
  "肩の奥の方",
  "腰の奥の方",
  "股関節の奥の方",
  "ふくらはぎの上部",
  "ふくらはぎの下部"
].forEach((ambiguousLabel) => assert(!Object.values(parsedLocations).flat().some(([, locationLabel]) => locationLabel === ambiguousLabel), `Ambiguous location label remains: ${ambiguousLabel}`));

assert(bodyCheckSource.includes("function candidateSupport(rule)"), "Candidate ranking must record which answer axes support each muscle.");
assert(bodyCheckSource.includes('relation: candidateRelation(support)'), "Candidate labels must describe answer support instead of rank-based certainty.");
assert(bodyCheckSource.includes("support.primaryMatch && allowedCandidateNames.has(rule.name)"), "The displayed ranking must contain only muscles explicitly allowed for the selected part and detailed location.");
assert(bodyCheckSource.includes("const candidateScores = new Map()"), "Candidate ordering must be separated from the legacy comparison score.");
assert(bodyCheckSource.includes("function candidateLocationSupport(rule)"), "Candidate ranking must compare the selected detailed location with candidate anatomy.");
assert(bodyCheckSource.includes("location.matched ? 8 : -4"), "Known locations must contribute to candidate ordering before the compatibility filter.");
assert(bodyCheckSource.includes("const allowedCandidateNames = new Set(locationKnown"), "A known detailed location must create an explicit anatomical allowlist.");
assert(!bodyCheckSource.includes("const candidatePool = locationMatchedEntries.length ? locationMatchedEntries : candidateEntries"), "Known locations must never broaden back to unrelated candidates.");
assert(bodyCheckSource.includes("rule.primary.includes(primary) && allowedCandidateNames.has(rule.name)"), "Fallback candidates must remain inside the same anatomical allowlist.");
assert(bodyCheckSource.includes("const answerMatchedEntries = candidateEntries.filter"), "Concrete movement answers must narrow candidates before ranking.");
assert(bodyCheckSource.includes("hasConcreteSituation && answerMatchedEntries.length ? answerMatchedEntries : candidateEntries"), "The result may use the anatomical allowlist only when no movement-matched candidate exists.");
assert(bodyCheckSource.includes("state.painLocation !== UNCLEAR_LOCATION"), "An unclear location must not change candidate ranking.");
assert(bodyCheckSource.includes('if (location.matched) axes.push("場所")'), "A location match must be visible in the explanation axes.");
assert(bodyCheckSource.includes("場所は順位に反映していません。"), "The result must explain how an unclear location is handled.");
assert(bodyCheckSource.includes("気になる詳しい場所"), "The selected detailed location must appear in the result and AI handoff.");
assert(bodyCheckSource.includes("painLocation: state.painLocation"), "The result record must retain the detailed location without changing the database schema.");
assert(bodyCheckSource.includes("RANKABLE_SYMPTOMS.has(id) && rule.symptoms.includes(id)"), "Neurologic cautions and change descriptors must not rank muscle candidates.");
assert(bodyCheckSource.includes("const matchedContexts = state.situations.filter"), "Daily scenes must be identified separately from direct movement evidence.");
assert(bodyCheckSource.includes("id !== UNCLEAR_SITUATION"), "The truthful no-clear-movement answer must not inflate the comparison score.");
assert(bodyCheckSource.includes('id === UNCLEAR_SITUATION ? [] : list.filter((item) => item !== UNCLEAR_SITUATION)'), "The unclear answer must be exclusive with concrete movements.");
assert(bodyCheckSource.includes('list.filter((item) => item !== "better_move" && item !== "better_rest")'), "No-change must be exclusive with improvement responses.");
assert(bodyCheckSource.includes('list.filter((item) => item !== "no_change")'), "Improvement responses must remove a contradictory no-change response.");
assert(bodyCheckSource.includes("動きが不明なため候補を広めに表示しています。"), "Unclear movement results must explain why their candidate range is broader.");
assert(bodyCheckSource.includes("※医療診断ではなく、回答内容を整理した参考情報です。"), "The AI handoff must retain a concise non-diagnostic limitation.");
assert(bodyCheckSource.includes("筋腹・腱・関節を区別する。その場所に筋肉本体がない場合は、筋肉があるようには説明しない"), "The AI handoff must not relocate a muscle belly to the user's symptom location.");
assert(bodyCheckSource.includes("上に列挙した候補筋以外を、新しい候補として追加しない"), "The AI handoff must stay within the same reviewed candidate list shown on the result page.");
assert(!entityLinksSource.includes("筋肉を推定した"), "The shared result footer must not reintroduce overconfident wording.");
assert(bodyCheckSource.includes('id="resultCandidatesTitle">${esc(result.regionLabel)}の筋肉候補</h2>'), "The candidate heading must identify the selected body part without extra ranking copy.");
assert(!bodyCheckSource.includes("医学的な確率を示すものではありません"), "The ranking must not repeat a separate medical disclaimer.");
assert(!bodyCheckSource.includes("stage.scrollIntoView"), "Selecting a ranking item must not pull the user away from the combined explorer.");
assert(bodyCheckSource.includes("const scrollPosition = window.scrollY") && bodyCheckSource.includes('window.scrollTo({ top: scrollPosition, behavior: "auto" })'), "Candidate switching must preserve the reading position.");
assert(bodyCheckSource.includes(".slice(0, 5)"), "The result must retain up to five reviewable muscle candidates.");
assert(bodyCheckSource.includes("const legacyTopScore") && bodyCheckSource.includes("!rule.expanded"), "Expanded candidates must not silently change the existing comparison score.");
assert(bodyCheckSource.includes("この症状は筋肉以外が関係することもあります。強い、急に出た、または悪化している場合は、セルフケアより医療機関への相談を優先してください。"), "Danger responses must retain clear medical-care guidance.");
assert(!bodyCheckSource.includes("function relationLabel(index)"), "Rank order must not be presented as medical likelihood.");
assert(bodyCheckSource.includes('id="bodyResetLink" href="/" data-link>最初からやり直す</a>'), "Starting over from a result must return to the current body-map selector.");
assert(!bodyCheckSource.includes('id="bodyResetBtn"'), "The retired in-check part picker must not be reopened from the result action.");
assert(appSource.includes('history.replaceState({}, "", "/");\n    route();'), "A body-check URL without a valid part must return to the body-map selector instead of rendering the retired picker.");
assert(appSource.includes('`${url.pathname}${url.search}${url.hash}`'), "SPA links must retain body-part and attribution query parameters.");
diagnosisEntrySources.forEach((source) => {
  assert(!/href="\/body-check"(?!\?)/.test(source), "Generic diagnosis links must open the current body-map selector instead of the retired part picker.");
});

const autoSaveStart = bodyCheckSource.indexOf("async function autoSave(result)");
const explicitSaveStart = bodyCheckSource.indexOf("async function saveAgain()", autoSaveStart);
const formatRecordStart = bodyCheckSource.indexOf("function formatRecordDate", explicitSaveStart);
assert(autoSaveStart >= 0 && explicitSaveStart > autoSaveStart && formatRecordStart > explicitSaveStart);
const autoSaveBlock = bodyCheckSource.slice(autoSaveStart, explicitSaveStart);
const explicitSaveBlock = bodyCheckSource.slice(explicitSaveStart, formatRecordStart);
assert(!autoSaveBlock.includes("saveLocal(result)"), "Opening a result must not silently add it to device history.");
assert(explicitSaveBlock.includes("saveLocal(result)"), "The explicit record action must persist the result on this device.");

assert(styles.includes("/* Body Check UX phase 1: clearer answers, results, recording, and return visits. */"));
assert(styles.includes(".diagnosis-choice-sections"));
assert(styles.includes(".supplement-group-heading"));
assert(styles.includes(".diagnosis-option-grid.answer-grid"));
assert(styles.includes("grid-template-columns: repeat(2, minmax(0, 1fr));"), "Mobile answer choices must use compact, tap-friendly columns.");
assert(styles.includes(".diagnosis-option:focus-visible:not(.selected)"), "Keyboard focus must remain visually distinct from a selected answer.");
assert(styles.includes(".answer-grid > label > span"), "Legacy answer styles must not resize labels or check marks inside the current question cards.");
assert(styles.includes(".muscle-candidate-list"));
assert(styles.includes(".result-candidate-list"));
assert(styles.includes(".result-muscle-ranking"));
assert(styles.includes(".result-muscle-explorer"));
assert(styles.includes(".muscle-clue-list"));
assert(!styles.includes(".muscle-match-flow"));
assert(styles.includes(".body-experience-shell:has(.result-panel)"), "Desktop results must have room for the enlarged muscle body without widening the questions.");
assert(styles.includes(".body-check-page:has(.result-panel)"), "The result route must control its top spacing independently from the question flow.");
assert(styles.includes("body.body-check-light .result-panel {\n  display: grid;\n  gap: clamp(0.85rem, 1.8vw, 1.2rem);\n  padding: 0;"), "The result must not be nested inside a second padded card.");
assert(!styles.includes("margin-inline: -0.85rem"), "The mobile result must not compensate for a retired outer-card padding with negative margins.");
assert(styles.includes(".result-detail-disclosure"));
assert(styles.includes(".result-muscle-highlight"));
assert(styles.includes(".result-muscle-stage"));
assert(styles.includes(".muscle-result-hero"));
assert(styles.includes(".muscle-result-figure"));
assert(!styles.includes(".result-anatomy-pair"));
assert(styles.includes(".ai-handoff-card"));
assert(styles.includes(".ai-handoff-intro"));
assert(styles.includes(".ai-handoff-steps"));
assert(styles.includes(".ai-handoff-action"));
assert(styles.includes("@media (prefers-reduced-motion: reduce)"));
assert(styles.includes("min-height: 64px"), "Muscle candidate controls must retain a comfortable touch target.");

["YOUR BODY TRACE", "TRACE COMPLETE", "MY BODY / LOCAL RECORD", "HEALTH CHECK LAB TRENDS", "NEXT SIGNALS"].forEach((label) => {
  assert(!bodyCheckSource.includes(label), `Decorative English label remains: ${label}`);
});

console.log("Body-check light theme regression checks passed.");
