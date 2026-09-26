const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "ec-home-ui.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "ec-home.css"), "utf8");
const commonStyles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const siteMenuSource = fs.readFileSync(path.join(root, "site-menu.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const homeScreenHtml = fs.readFileSync(path.join(root, "home-screen", "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const faqHtml = fs.readFileSync(path.join(root, "faq", "index.html"), "utf8");
const clinicHtml = fs.readFileSync(path.join(root, "clinic-profile", "index.html"), "utf8");
const siteGenerator = fs.readFileSync(path.join(root, "scripts", "generate-site-assets.js"), "utf8");
const documentStub = {
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
const windowStub = {
  addEventListener() {},
  setTimeout() {},
  matchMedia() { return { matches: false }; }
};
const context = {
  console,
  document: documentStub,
  window: windowStub,
  location: { pathname: "/", search: "" },
  history: { pushState() {} },
  PopStateEvent: function PopStateEvent() {},
  URLSearchParams,
  encodeURIComponent,
  fetch: async () => ({ ok: false, json: async () => [] })
};
vm.runInNewContext(source, context, { filename: "ec-home-ui.js" });

const api = windowStub.HealthCheckHomeExperience;
assert(api, "The home experience test API must be available.");

const menuWindowStub = { location: { pathname: "/", hash: "" }, addEventListener() {} };
vm.runInNewContext(siteMenuSource, {
  window: menuWindowStub,
  document: { body: null, querySelector() { return null; }, getElementById() { return null; } }
}, { filename: "site-menu.js" });
const menuApi = menuWindowStub.HealthCheckSiteMenu;
assert(menuApi, "The shared menu API must be available without mounting a header.");
assert.strictEqual(menuApi.resolveSection("/", ""), "home");
assert.strictEqual(menuApi.resolveSection("/", "#body-selector"), "check");
assert.strictEqual(menuApi.resolveSection("/body-check", ""), "check");
assert.strictEqual(menuApi.resolveSection("/body-check/neck/", ""), "check");
assert.strictEqual(menuApi.resolveSection("/health-library/example/", ""), "articles");
assert.strictEqual(menuApi.resolveSection("/faq", "#faq-records"), "records");
assert.strictEqual(menuApi.resolveSection("/home-screen/", ""), "home-screen");

assert.deepStrictEqual(
  Array.from(api.homeSelectorParts, ({ partId }) => partId),
  ["neck", "shoulder", "elbow", "wrist", "back", "lowback", "hip", "buttock", "thigh", "knee", "lowerleg", "ankle", "sole"],
  "The visual selector must expose every supported diagnosis location."
);

assert.deepStrictEqual(
  Object.keys(api.homeSelectorParts.find((part) => part.partId === "lowback").views),
  ["back"],
  "The lower-back label must only appear on the rear view."
);

const selectorHtml = api.renderHomeBodySelector();
const homeHtml = api.homeMarkup();
const homeText = homeHtml.replace(/<[^>]+>/g, "");
assert.strictEqual((homeHtml.match(/data-home-body-selector/g) || []).length, 1, "The home page must contain one body selector.");
assert(homeText.includes("動きから、気になる筋肉をセルフチェック"));
assert(homeHtml.includes("Health Check Labの身体セルフチェック"));
assert(homeHtml.includes('aria-label="セルフチェックの流れ"'));
assert(homeHtml.includes("場所を選ぶ"));
assert(homeHtml.includes("動きに答える"));
assert(homeHtml.includes("筋肉を確認"));
assert(homeHtml.includes('class="home-selector-emphasis">気になる筋肉</span>'));
assert(homeHtml.includes('<br class="home-selector-title-break" />セルフチェック'));
assert(homeHtml.includes("人体図をタップ"));
assert(homeHtml.includes("人体で分かりやすく表示"));
assert(homeHtml.includes("身体の悩みについて読む"));
assert(indexHtml.includes('document.documentElement.classList.add("home-light","home-render-pending")'), "The home route must use the current light theme before the first paint.");
assert(indexHtml.indexOf('/ec-home-ui.js?v=initial-render-1') < indexHtml.indexOf('/app.js?v=initial-render-1'), "The current home renderer must load before the route controller.");
assert(styles.includes("html.home-render-pending #app"), "The previous home shell must stay hidden until the current renderer is ready.");
assert(source.includes('document.documentElement.classList.remove("home-render-pending")'), "The current home renderer must reveal the page after mounting.");
assert(!appSource.includes('<section class="home-script-fallback">'), "The route controller must not paint the retired home fallback before the current home experience.");
assert(!homeHtml.includes("部位ごとの説明"), "The retired guide-entry heading must not return.");
assert(!homeHtml.includes("身体の場所から詳しく見る"), "The retired guide-entry block must not return.");
assert(!indexHtml.includes('class="home-guide-entry"'), "The initial home HTML must not flash the retired guide-entry block.");
assert(!styles.includes(".home-guide-entry"), "Unused guide-entry styling must be removed with the block.");
assert(selectorHtml.includes("部位をタップしてチェック開始"));
assert(!homeHtml.includes("原因筋チェック"), "The retired competing start label must not return.");
assert(!homeHtml.includes("2つの入口"), "The retired two-entry section must not return.");
assert(!selectorHtml.includes("/body-check/lower-back/"), "The search landing slug must not be used as the diagnosis part id.");

["neck", "shoulder", "lowback", "hip", "knee"].forEach((partId) => {
  const expected = `/body-check?part=${partId}&from=home-body-selector`;
  assert(selectorHtml.includes(expected), `Missing direct diagnosis link for ${partId}.`);
  assert.strictEqual(api.homeDiagnosisHref(partId), expected);
});

const detailedPartIds = Array.from(api.homeDetailedParts, ([partId]) => partId);
assert.deepStrictEqual(detailedPartIds, ["neck", "shoulder", "elbow", "wrist", "back", "lowback", "hip", "buttock", "thigh", "knee", "lowerleg", "ankle", "sole"]);
detailedPartIds.forEach((partId) => {
  const expectedViews = Object.keys(api.homeSelectorParts.find((part) => part.partId === partId).views).length;
  assert.strictEqual((selectorHtml.match(new RegExp(`data-home-part-choice="${partId}"`, "g")) || []).length, expectedViews, `The body diagram must expose ${partId} on every configured view.`);
});
assert(!selectorHtml.includes("home-body-selector-fallback"), "The normal interface must not repeat the body diagram as a text-chip panel.");
assert(!selectorHtml.includes("home-body-initial-choice"), "The normal interface must start from the body diagram itself.");
assert(!selectorHtml.includes('id="homeBodyStart"'), "A second start button must not appear below the body diagram.");
assert(!selectorHtml.includes("home-body-selector-start"), "The selector must navigate directly from each body label.");
assert.strictEqual(
  api.homeDiagnosisHref("shoulder", ["shoulder", "neck"]),
  "/body-check?part=shoulder&from=home-body-selector",
  "The home selector must start one body location at a time."
);
assert(!source.includes('let selectedPart = ""'), "The home selector must not require a second confirmation step.");
assert(!source.includes('choice.addEventListener("click"'), "Body labels must retain their native direct-link navigation.");
assert(source.includes('`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`'), "Animated diagnosis links must retain the selected body-part query instead of reopening the retired picker.");
const bodyLocationLinks = selectorHtml.match(/<a class="home-body-selector-label"[^>]+>/g) || [];
assert(bodyLocationLinks.length > 0, "The body diagram must expose direct location links.");
assert(bodyLocationLinks.every((link) => !link.includes("aria-pressed") && !link.includes('role="button"')), "Body-location links must not masquerade as toggle buttons.");
const bodyMarkerLinks = selectorHtml.match(/<a class="home-body-selector-marker-hit"[^>]+>/g) || [];
assert(bodyMarkerLinks.length > 0, "Anatomical markers must also provide a generous pointer target.");
assert(bodyMarkerLinks.every((link) => link.includes('href="/body-check?part=')), "Every marker target must start the matching body check directly.");
assert(!source.includes("selectedParts = new Set"), "The retired multi-location home selection must not return.");
assert(!selectorHtml.includes("最大3か所"), "The home selector must not suggest multi-location selection.");
assert(!selectorHtml.includes('data-home-part-choice="scapula"'), "The shoulder-blade region must not appear as a separate choice.");
assert(!selectorHtml.includes("肩甲骨"), "The shoulder-blade label must not remain in the body selector.");
assert(!/\.home-body-selector-label::after\s*\{[^}]*content:\s*["']\+["']/s.test(styles), "Unselected body labels must not use a plus symbol.");
assert(selectorHtml.includes('<span class="home-body-selector-label-text"><span>すね・</span><span>ふくらはぎ</span></span>'), "The lower-leg label must use a deliberate Japanese line break.");
assert(styles.includes("width: min(100%, 640px);"), "The selector must provide enough width for a readable body diagram.");
assert(styles.includes("height: 580px;"), "The desktop body diagram must remain large enough to inspect.");
assert(styles.includes("height: min(510px, calc((100vw - 64px) * 1.5));"), "The mobile body diagram must use the available width without overflowing narrow screens.");
assert(styles.includes("min-height: 52px;"), "Mobile body labels must remain larger than the 44px tap-target minimum.");
assert(styles.includes('.home-body-selector-view[data-home-body-view-panel="back"] .home-body-selector-label {\n  width: 96px;\n  min-height: 52px;'), "Rear-view labels must remain compact without sacrificing their tap target.");
assert(styles.includes("right: 72%;") && styles.includes("left: 72%;"), "Mobile labels must retain their outer border inside the selector canvas.");
assert(styles.includes('.home-body-selector-view .home-body-selector-label[data-home-part-choice="lowerleg"] {\n    width: 84px;'), "The lower-leg label must wrap compactly without covering the body.");
assert(styles.includes('.home-body-selector-label[data-home-part-choice="wrist"] {\n    width: 80px;'), "The wrist label must leave enough room for its short guide on narrow screens.");
assert(styles.includes('.home-body-selector-marker-hit {') && styles.includes("width: 44px;\n  height: 44px;"), "Anatomical markers must expose a 44px pointer target.");
assert(styles.includes("width: 12px;\n  height: 12px;"), "Body markers must remain easy to see.");
assert(styles.includes('[data-home-body-view-panel="back"] .home-body-selector-image'), "The rear body image must have its own visibility treatment.");
assert(styles.includes("brightness(0.94) contrast(1.16)"), "The rear body image must retain readable contour contrast.");
assert(styles.includes("@keyframes homeBodyReveal"), "The body diagram must have a short reveal animation.");
assert(styles.includes("@keyframes homeGuideDraw"), "Guide lines must support a short draw-in animation.");
assert(styles.includes("prefers-reduced-motion: reduce"), "The home reveal must respect reduced-motion preferences.");
assert(styles.includes("grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.72fr);"), "The desktop introduction must keep its copy and process easy to scan.");
assert(styles.includes("background: linear-gradient(transparent 64%, #cfe8d6 64%);"), "The key phrase must retain its restrained visual emphasis.");
assert(styles.includes(".home-selector-title-break {\n    display: none;\n  }"), "The desktop title break must not strand Japanese particles on narrow screens.");
assert(
  styles.includes(".home-light .brand-mark {\n  border-radius: 14px;\n  background: #17633a;\n  color: #ffffff;\n  box-shadow: none;\n}"),
  "The home and body-check headers must share the same square white-letter logo."
);
assert(
  styles.includes(".site-footer .footer-links {\n  display: grid;\n  justify-items: start;\n  gap: 7px;\n  margin-top: 0;\n}"),
  "Footer utility links must be stacked vertically."
);

const expectedMarkers = {
  neckFront: [[50, 16.4]],
  shoulderFront: [[36.5, 21.4], [63.5, 21.4]],
  elbowFront: [[31.5, 33], [68.5, 33]],
  wristFront: [[28.5, 42], [71.5, 42]],
  hipFront: [[42.5, 47.7], [57.5, 47.7]],
  kneeFront: [[42.5, 65.7], [57.5, 65.7]],
  neckBack: [[50, 13.5]],
  shoulderBack: [[34, 19.7], [66, 19.7]],
  backBack: [[50, 30.5]],
  lowbackBack: [[50, 37.6]],
  buttockBack: [[43.5, 46.2], [56.5, 46.2]],
  lowerlegBack: [[42, 77], [58, 77]],
  soleBack: [[41.5, 93], [58.5, 93]]
};
const markerFor = (partId, view) => api.homeSelectorParts.find((part) => part.partId === partId).views[view].markers;
assert.strictEqual(JSON.stringify(markerFor("neck", "front")), JSON.stringify(expectedMarkers.neckFront));
assert.strictEqual(JSON.stringify(markerFor("shoulder", "front")), JSON.stringify(expectedMarkers.shoulderFront));
assert.strictEqual(JSON.stringify(markerFor("elbow", "front")), JSON.stringify(expectedMarkers.elbowFront));
assert.strictEqual(JSON.stringify(markerFor("wrist", "front")), JSON.stringify(expectedMarkers.wristFront));
assert.strictEqual(JSON.stringify(markerFor("hip", "front")), JSON.stringify(expectedMarkers.hipFront));
assert.strictEqual(JSON.stringify(markerFor("knee", "front")), JSON.stringify(expectedMarkers.kneeFront));
assert.strictEqual(JSON.stringify(markerFor("neck", "back")), JSON.stringify(expectedMarkers.neckBack));
assert.strictEqual(JSON.stringify(markerFor("shoulder", "back")), JSON.stringify(expectedMarkers.shoulderBack));
assert.strictEqual(JSON.stringify(markerFor("back", "back")), JSON.stringify(expectedMarkers.backBack));
assert.strictEqual(JSON.stringify(markerFor("lowback", "back")), JSON.stringify(expectedMarkers.lowbackBack));
assert.strictEqual(JSON.stringify(markerFor("buttock", "back")), JSON.stringify(expectedMarkers.buttockBack));
assert.strictEqual(JSON.stringify(markerFor("lowerleg", "back")), JSON.stringify(expectedMarkers.lowerlegBack));
assert.strictEqual(JSON.stringify(markerFor("sole", "back")), JSON.stringify(expectedMarkers.soleBack));
assert.strictEqual(api.homeSelectorParts.find((part) => part.partId === "back").views.back.labelY, 28.8, "The rear back label must remain separated from the neck label.");
assert.strictEqual(api.homeSelectorParts.find((part) => part.partId === "buttock").views.back.labelY, 50.5, "The rear buttock label must remain separated from the back label.");
assert.strictEqual(api.homeSelectorParts.find((part) => part.partId === "sole").views.back.labelY, 93.2, "The rear sole label must remain inside the mobile canvas.");
assert(styles.includes('.home-body-selector-label[data-home-part-choice="lowerleg"]'), "The long lower-leg label must wrap within the mobile canvas.");
assert.strictEqual(api.homeSelectorParts.find((part) => part.partId === "neck").views.front.line[0], 74.5, "Right-side guides must begin at the label edge.");
assert.strictEqual(api.homeSelectorParts.find((part) => part.partId === "shoulder").views.front.line[0], 25.5, "Left-side guides must begin at the label edge.");
assert.strictEqual(JSON.stringify(api.homeSelectorParts.find((part) => part.partId === "wrist").views.front.line), JSON.stringify([26, 37.5, 28.5, 42]), "The wrist guide must remain visibly connected to its marker.");

const frontHtml = selectorHtml.split('data-home-body-view-panel="front"')[1].split('data-home-body-view-panel="back"')[0];
const backHtml = selectorHtml.split('data-home-body-view-panel="back"')[1];
assert(!frontHtml.includes("part=lowback"), "The front view must not expose the lower-back marker.");
assert(backHtml.includes("part=lowback"), "The rear view must expose the lower-back marker.");
["elbow", "wrist", "thigh", "knee", "ankle"].forEach((partId) => {
  assert(!backHtml.includes(`part=${partId}`), `The rear view must not duplicate the ${partId} label from the front view.`);
});
["neck", "shoulder", "back", "lowback", "buttock", "lowerleg", "sole"].forEach((partId) => {
  assert(backHtml.includes(`part=${partId}`), `The rear view must keep the useful ${partId} location.`);
});
assert(!frontHtml.includes("part=sole"), "The front view must not duplicate the sole label from the rear view.");

const sampleArticles = [
  { title: "腰痛と日常生活", slug: "low-back", publishedAt: "2026-09-20", categories: [{ title: "慢性痛" }], tags: [], seo: {} },
  { title: "肩こりを整理する", slug: "shoulder", publishedAt: "2026-09-21", categories: [{ title: "肩" }], tags: [], seo: {} },
  { title: "肩こりを整理する", slug: "shoulder-old", publishedAt: "2026-09-01", categories: [{ title: "肩" }], tags: [], seo: {} },
  { title: "頭痛を整理する", slug: "headache", publishedAt: "2026-09-23", categories: [{ title: "慢性痛" }], tags: [{ title: "腰痛" }], seo: {} },
  { title: "別の健康記事", slug: "other", publishedAt: "2026-09-22", categories: [{ title: "健康情報" }], tags: [], seo: {} },
  { title: "朝起きると腰が痛いとき", slug: "morning-low-back", publishedAt: "2026-09-24", categories: [{ title: "慢性痛" }], tags: [{ title: "腰痛" }], seo: {} },
  { title: "横向きで寝ると肩が痛いとき", slug: "side-sleep-shoulder", publishedAt: "2026-09-24", categories: [{ title: "肩" }], tags: [], seo: {} },
  { title: "非公開の肩記事", slug: "hidden-shoulder", publishedAt: "2026-09-25", categories: [{ title: "肩" }], tags: [], seo: { noIndex: true } }
];
assert.deepStrictEqual(
  Array.from(api.selectHomeArticles(sampleArticles, ["腰痛", "腰"]), (article) => article.slug),
  ["low-back", "morning-low-back"],
  "A related tag alone must not place an unrelated article in a body-area group."
);
assert.deepStrictEqual(
  Array.from(api.selectHomeArticles(sampleArticles, ["肩こり", "肩"]), (article) => article.slug),
  ["shoulder", "side-sleep-shoulder"],
  "Duplicate article titles must not be repeated while unique relevant articles remain available."
);
assert.strictEqual(
  api.selectLatestHomeArticle(sampleArticles, ["腰痛", "腰"]).slug,
  "morning-low-back",
  "The lower-back feature must show the newest directly relevant published article."
);
assert.strictEqual(
  api.selectLatestHomeArticle(sampleArticles, ["肩こり", "肩"]).slug,
  "side-sleep-shoulder",
  "The neck-and-shoulder feature must show the newest directly relevant published article."
);
assert.deepStrictEqual(
  Array.from(api.homeArticleCategories(sampleArticles), ({ title, count }) => [title, count]),
  [["肩", 3], ["慢性痛", 3], ["健康情報", 1]],
  "Category controls must come from the currently published article data."
);
assert.deepStrictEqual(
  Array.from(api.selectHomeCategoryArticles(sampleArticles, "肩"), (article) => article.slug),
  ["side-sleep-shoulder", "shoulder"],
  "Category results must be newest-first, omit noindex articles, and avoid duplicate titles."
);

const articleExperienceHtml = api.renderHomeArticleExperience(sampleArticles);
assert.strictEqual((articleExperienceHtml.match(/class="home-article-card"/g) || []).length, 2, "The home page must show one featured article for each priority area.");
assert(articleExperienceHtml.includes("朝起きると腰が痛いとき"));
assert(articleExperienceHtml.includes("横向きで寝ると肩が痛いとき"));
assert(articleExperienceHtml.includes("カテゴリーから選ぶ"));
assert(articleExperienceHtml.includes('data-home-article-category="慢性痛"'));
assert(articleExperienceHtml.includes('data-home-article-category="肩"'));
assert(articleExperienceHtml.includes('data-home-article-category="all" aria-pressed="true"'));
assert.strictEqual((articleExperienceHtml.match(/class="home-category-article"/g) || []).length, 4, "The initial category list must stay compact.");

const previewedArticles = api.mergeHomeArticlePreviews(sampleArticles, {
  shoulder: { title: "肩こりは姿勢だけが原因？", description: "動きと生活場面から整理します。" }
});
assert.strictEqual(previewedArticles[1].title, "肩こりは姿勢だけが原因？");
assert.strictEqual(previewedArticles[1].summary, "動きと生活場面から整理します。");
assert.strictEqual(previewedArticles[0], sampleArticles[0], "Articles without a local preview must remain untouched.");
assert(homeHtml.includes("腰と首・肩の最新記事を1本ずつ紹介しています。"));
assert(!homeHtml.includes("すべての記事を見る"), "The retired link above the featured articles must not return.");
assert(styles.includes(".home-featured-articles"));
assert(styles.includes(".home-category-controls"));
assert(styles.includes('grid-template-columns: repeat(3, minmax(0, 1fr));'), "Mobile category controls must wrap into stable, tap-friendly columns.");
assert(styles.includes("min-height: 44px;"), "Category controls must retain a comfortable tap target.");

const indexMenu = indexHtml.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)?.[0] || "";
assert(indexMenu.includes('href="/#body-selector" data-nav-section="check">セルフチェック</a>'));
assert(indexMenu.includes('href="/health-library" data-link data-nav-section="articles">健康記事</a>'));
assert(indexMenu.includes('href="/faq#faq-records" data-nav-section="records">記録・比較について</a>'));
assert(indexMenu.includes('href="/home-screen/" data-nav-section="home-screen">ホーム画面に追加</a>'));
assert(!indexMenu.includes("症状をチェック") && !indexMenu.includes("健康記事を読む"), "The header menu must use the current concise labels.");
assert(!indexMenu.includes("/about") && !indexMenu.includes("/community") && !indexMenu.includes("/health-check"), "Retired routes must not return to the primary menu.");
assert(indexHtml.includes('<span class="home-screen-help-label"><span>ホーム画面に</span><span>追加</span></span>'));
assert(!indexHtml.includes("home-screen-help-label-compact"), "The ambiguous compact add label must be removed.");
assert(indexHtml.includes('<script src="/site-menu.js?v=mobile-nav-1" defer></script>'));
assert(siteMenuSource.includes('event.key === "Escape"'), "The compact menu must close with Escape.");
assert(siteMenuSource.includes('window.addEventListener("popstate"'), "The compact menu must stay in sync with browser history.");
assert(siteMenuSource.includes('!header.contains(event.target)'), "The compact menu must close when the user taps outside it.");
assert(commonStyles.includes("width: min(286px, calc(100vw - 24px));"), "The mobile menu must remain a compact panel.");
assert(commonStyles.includes("min-height: 46px;"), "Menu destinations must retain a comfortable tap target.");
assert(homeScreenHtml.includes("Health Check Labを<br />ホーム画面に追加"));
assert(homeScreenHtml.includes('id="deviceGuideStatus" hidden'));
assert(homeScreenHtml.includes('document.body.dataset.deviceGuide = device;'), "The guide must prioritize instructions for the detected mobile platform.");
assert(indexHtml.includes("<noscript>"), "Text diagnosis links must remain available without JavaScript.");
assert(indexHtml.includes('href="/faq">よくある質問</a>'));
assert(indexHtml.includes('href="/clinic-profile">運営・監修について</a>'));
assert(!indexHtml.includes('class="footer-clinic"'), "The footer link group must not have a redundant heading.");
assert(!faqHtml.includes("location.replace"), "The FAQ must render as a complete page without the legacy SPA redirect.");
assert(faqHtml.includes('<body class="home-light info-page-body">'));
assert(faqHtml.includes('<h1>よくある質問</h1>'));
assert(faqHtml.includes("表示された筋肉が原因という意味ですか？"));
assert(faqHtml.includes("首、肩、肘、手首、背中、腰、股関節、お尻、太もも、膝、すね・ふくらはぎ、足首、足裏"), "The FAQ must describe the same 13 body parts as the live selector.");
assert(faqHtml.includes("記録と匿名データについて"));
assert(faqHtml.includes("健康記事と運営について"));
assert(appSource.includes('const infoPage = path === "/faq";'), "SPA fallback navigation must retain the light FAQ theme.");
assert(appSource.includes("表示された筋肉が原因という意味ですか？"), "SPA fallback FAQ content must match the static page topic.");
assert(appSource.includes("首、肩、肘、手首、背中、腰、股関節、お尻、太もも、膝、すね・ふくらはぎ、足首、足裏"), "The SPA FAQ fallback must describe the same 13 body parts.");
assert(clinicHtml.includes('<title>運営・監修について | Health Check Lab</title>'));
assert(clinicHtml.includes('<body class="home-light info-page-body">'));
assert(clinicHtml.includes("情報を届けるときに大切にしていること"));
assert(!clinicHtml.includes("body-network-hero"), "The clinic profile source must not return to the legacy dark hero.");
assert(siteGenerator.includes('class="home-light info-page-body"'), "The generated clinic profile must use the current light theme.");
assert(siteGenerator.includes("情報を届けるときに大切にしていること"));
assert(styles.includes(".info-page-shell"));
assert(styles.includes(".info-faq-list summary"));
assert(styles.includes(".info-action-band"));

console.log("Home experience regression checks passed.");
