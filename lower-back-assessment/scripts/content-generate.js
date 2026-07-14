const path = require("path");
const {
  ARTICLE_INDEX_PATH,
  TOPICS_PATH,
  articlePath,
  readJson,
  today,
  validateContent,
  writeJson
} = require("./content-utils");
const { SITE_ENTITY } = require("./site-entity");
const { normalizeTopic } = require("./topic-catalog");

const root = path.resolve(__dirname, "..");
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || true];
  })
);

function articleType(topic) {
  if (String(topic.category).includes("SNS")) return "health_explanation";
  if (/low-back|shoulder|sciatica|neck|headache|autonomic/.test(topic.slug)) return "visit_choice";
  if (/acupuncture|moxibustion|therapy|massage/.test(topic.slug)) return "visit_choice";
  return "health_explanation";
}

function tagsFor(topic) {
  const text = `${topic.title} ${topic.slug}`;
  const symptomTags = [];
  const bodyPartTags = [];
  if (/腰|back|hernia/.test(text)) { symptomTags.push("腰痛"); bodyPartTags.push("腰"); }
  if (/肩|shoulder/.test(text)) { symptomTags.push("肩こり"); bodyPartTags.push("肩"); }
  if (/首|neck/.test(text)) { symptomTags.push("首の痛み"); bodyPartTags.push("首"); }
  if (/膝|knee/.test(text)) { symptomTags.push("膝"); bodyPartTags.push("膝"); }
  if (/自律神経|autonomic/.test(text)) symptomTags.push("自律神経");
  if (/鍼|灸|acupuncture|moxibustion/.test(text)) symptomTags.push("鍼灸");
  return {
    symptomTags: [...new Set(symptomTags)],
    bodyPartTags: [...new Set(bodyPartTags)],
    intentTags: articleType(topic) === "visit_choice" ? ["受診先選び"] : ["健康情報を知る"],
    urgencyTags: ["一般情報"]
  };
}

function specialtyTagsForCategory(category) {
  const base = {
    "ストレッチ": ["運動器", "筋肉評価"],
    "姿勢・骨盤矯正": ["運動器", "動作分析"],
    "筋膜・トリガーポイント": ["慢性痛", "筋肉評価"],
    "筋トレ・運動": ["運動器", "動作分析"],
    "痛み・神経": ["慢性痛", "運動器"],
    "鍼灸・治療": ["鍼灸", "慢性痛"],
    "SNS健康情報": ["健康情報検証"]
  };
  return base[category] || ["健康情報検証"];
}

function clinicGuideFor(tags) {
  const relevant = tags.symptomTags.some((tag) => ["腰痛", "肩こり", "首の痛み", "膝", "自律神経", "鍼灸"].includes(tag));
  if (!relevant) return "";
  return "名古屋で同様の症状について鍼灸を検討している方は、ハリプラス鍼灸院でもご相談いただけます。ただし、強いしびれ、筋力低下、発熱、外傷後の症状などがある場合は、先に医療機関での評価をご検討ください。";
}

function baseArticle(topic, source = "template") {
  const tags = tagsFor(topic);
  const type = articleType(topic);
  const title = topic.title;
  return {
    title,
    slug: topic.slug,
    category: topic.category,
    tags: [topic.category, ...tags.symptomTags, ...tags.bodyPartTags],
    articleType: type,
    verdict: "⚠️ 一部正しい",
    description: `${title}について、現在分かっていることと注意点を整理します。`,
    readerQuestion: `${title}という疑問について、どこまで参考にできるかを知りたい。`,
    conclusion: "現時点では、体の状態や目的によって考え方が変わります。ひとつの情報だけで判断せず、根拠、限界、注意すべき症状を合わせて確認することが大切です。",
    snsClaim: `${title}という内容は、SNSや健康情報で見かけることがあります。`,
    whyItSpread: "短い言葉で説明しやすく、体験談として共有されやすいため広まりやすいテーマです。",
    currentEvidence: "研究や公的情報で分かっている範囲を確認し、効果や原因を断定しすぎないことが重要です。参考文献を確認できるまでは公開前確認が必要です。",
    medicalExplanation: "痛みやこりは、筋肉、関節、神経、生活習慣、睡眠、ストレスなど複数の要素が関係することがあります。",
    knownEvidence: "運動やセルフケアが役立つ可能性はありますが、症状や背景によって結果は異なります。",
    unknowns: "個人差が大きく、どの方法が必ず合うかは記事だけでは判断できません。",
    limitations: "この記事は一般情報であり、診断や治療効果を保証するものではありません。",
    commonMisunderstandings: "個人の体験談をすべての人に当てはまる結論として扱わないように注意が必要です。",
    practicalView: "痛みが強い場合や症状が長引く場合は、セルフケアだけで判断せず専門家に相談してください。",
    selfCare: ["無理のない範囲で体を動かす", "痛みが増える動作は一時的に控える", "睡眠や休息を確保する"],
    doctorVisitSigns: ["強いしびれ", "筋力低下", "発熱", "外傷後の症状", "急激な悪化", "排尿排便の異常"],
    acupunctureConsideration: "慢性的な筋肉のこわばりや動作時のつらさがあり、緊急性の高い症状がない場合は、鍼灸が選択肢の一つになり得ます。",
    clinicGuide: clinicGuideFor(tags),
    acupuncturistView: "鍼灸師としては、症状の場所だけでなく、動作、生活習慣、周辺の筋肉の負担も合わせて見ることが大切だと考えます。",
    faq: [
      {
        question: "この記事だけで判断してよいですか？",
        answer: "いいえ。医療診断ではなく、健康情報を整理するための参考情報として確認してください。"
      },
      {
        question: "痛みが強い場合もセルフケアでよいですか？",
        answer: "強い痛み、しびれ、麻痺、発熱、外傷後の症状などがある場合は医療機関へ相談してください。"
      }
    ],
    summary: "健康情報は、結論だけでなく根拠、限界、注意点を合わせて確認することが大切です。",
    references: [],
    authorName: SITE_ENTITY.supervisorName,
    authorUrl: SITE_ENTITY.clinicProfilePath,
    reviewedBy: SITE_ENTITY.supervisorName,
    reviewerUrl: SITE_ENTITY.clinicProfilePath,
    clinicName: SITE_ENTITY.clinicName,
    clinicUrl: SITE_ENTITY.clinicProfilePath,
    specialtyTags: specialtyTagsForCategory(topic.category),
    symptomTags: tags.symptomTags,
    bodyPartTags: tags.bodyPartTags,
    intentTags: tags.intentTags,
    urgencyTags: tags.urgencyTags,
    regionTags: [],
    datePublished: null,
    dateModified: today(),
    citation: [],
    relatedClinicPage: SITE_ENTITY.clinicProfilePath,
    relatedRegionPages: [],
    qualityWarnings: source === "template" ? ["OPENAI_API_KEYが未設定のためテンプレート下書きです。本文と参考文献を確認してください。"] : [],
    medicalDisclaimer: "この記事は医療診断ではありません。強い痛み、しびれ、麻痺、発熱などがある場合は医療機関へ相談してください。",
    reelTitle: `鍼灸師が考える\n「${title.replace(/？$/, "のか？")}」`,
    reelScript: "このテーマはSNSでもよく見かけます。ただ、体の状態によって考え方は変わります。大切なのは、ひとつの情報だけで決めつけず、根拠や注意点も一緒に見ることです。詳しくはHealth Check Labの記事で整理しています。",
    instagramCaption: "健康情報は、短く分かりやすい一方で、条件や注意点が省かれやすいことがあります。この記事では根拠と注意点を整理します。\n\n※医療診断ではありません。",
    youtubeDescription: "健康情報について、参考にできる度合いを整理します。Health Check Labの記事では、根拠・注意点・誤解されやすいポイントを確認できます。\n\n※医療診断ではありません。",
    generationStatus: "draft",
    generatedAt: new Date().toISOString(),
    createdAt: today(),
    updatedAt: today(),
    publishedAt: null,
    status: "draft",
    noindex: true
  };
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("OpenAI response did not include JSON.");
    return JSON.parse(match[0]);
  }
}

function buildPrompt(topic) {
  return [
    "Health Check Labの記事下書きをJSONのみで作成してください。",
    "医療診断、病名推定、治療効果の断定は禁止です。",
    "存在を確認できない論文や参考文献は作らないでください。参考文献が確認できない場合はreferencesを空配列にし、qualityWarningsに警告を入れてください。",
    "記事は宣伝だけにせず、読者の疑問に答えてください。",
    "ハリプラス鍼灸院の案内は関連する場合だけclinicGuideへ自然に入れてください。",
    "禁止表現: 必ず治る, 根本治療できる, 完全に改善する, 絶対に効果がある, 薬より優れている, どんな人にも効く",
    `タイトル: ${topic.title}`,
    `カテゴリ: ${topic.category}`,
    "必須フィールド: description, readerQuestion, conclusion, snsClaim, whyItSpread, currentEvidence, medicalExplanation, knownEvidence, unknowns, limitations, commonMisunderstandings, practicalView, selfCare, doctorVisitSigns, acupunctureConsideration, clinicGuide, acupuncturistView, faq, summary, references, qualityWarnings, reelTitle, reelScript, instagramCaption, youtubeDescription"
  ].join("\n");
}

async function generateWithOpenAI(topic) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: buildPrompt(topic),
      text: { format: { type: "json_object" } }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "OpenAI API request failed.");
  const text = data.output_text || data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text || "";
  return extractJson(text);
}

async function main() {
  const dryRun = Boolean(args["dry-run"]);
  const content = validateContent(root);
  if (content.errors.length) {
    content.errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  const topics = readJson(root, TOPICS_PATH, []);
  const slugs = readJson(root, ARTICLE_INDEX_PATH, []);
  const selectedIndex = topics.findIndex((topic) => topic.status === "unused" && !slugs.includes(topic.slug));
  if (selectedIndex === -1) {
    console.log("No unused topic remains.");
    return;
  }
  const topic = normalizeTopic(topics[selectedIndex]);
  if (dryRun) {
    console.log(`Next topic: ${topic.title} (${topic.slug})`);
    return;
  }

  const source = apiKey ? "openai" : "template";
  const base = baseArticle(topic, source);
  let aiDraft = {};
  if (apiKey) {
    try {
      aiDraft = await generateWithOpenAI(topic);
    } catch (error) {
      base.qualityWarnings.push(`AI生成に失敗したためテンプレート下書きです: ${error.message}`);
    }
  }

  const article = {
    ...base,
    ...aiDraft,
    title: topic.title,
    slug: topic.slug,
    category: topic.category,
    status: "draft",
    generationStatus: "draft",
    generatedAt: new Date().toISOString(),
    updatedAt: today(),
    dateModified: today(),
    publishedAt: null,
    datePublished: null,
    noindex: true
  };

  writeJson(root, ARTICLE_INDEX_PATH, [...slugs, topic.slug]);
  writeJson(root, articlePath(topic.slug), article);
  topics[selectedIndex] = { ...topics[selectedIndex], status: "used", generatedAt: article.generatedAt };
  writeJson(root, TOPICS_PATH, topics);
  writeJson(root, "content-notification.json", {
    event: "generated",
    generatedAt: article.generatedAt,
    title: article.title,
    slug: article.slug,
    category: article.category,
    status: article.status,
    warnings: article.qualityWarnings || [],
    previewCommand: `npm run content:preview -- --slug=${article.slug}`,
    approval: `content/truth-check/articles/${article.slug}.json の status を published に変更して npm run content:publish -- --slug=${article.slug}`
  });
  console.log(`Generated draft article: ${article.title}`);
  console.log(`Path: ${articlePath(topic.slug)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
