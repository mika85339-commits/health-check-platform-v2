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

const root = path.resolve(__dirname, "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || true];
  })
);

const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const apiKey = process.env.OPENAI_API_KEY;
const topicSlug = args.slug || args.topic || process.env.CONTENT_TOPIC_SLUG;
const templateOnly = Boolean(args.template);

function usage() {
  console.log("Usage:");
  console.log("  npm run content:generate-social -- --slug=stretch-fascia-adhesion");
  console.log("  npm run content:generate-social -- --slug=stretch-fascia-adhesion --template");
}

function pickTopic(topics) {
  if (topicSlug) return topics.find((topic) => topic.slug === topicSlug);
  return topics.find((topic) => topic.status === "unused");
}

function buildNaturalReelTitle(title) {
  const cleaned = String(title || "")
    .replace(/ストレッチで/, "")
    .replace(/本当に必要？$/, "本当に必要なのか？")
    .replace(/良い？$/, "良いのか？")
    .replace(/効果がある？$/, "効果はあるのか？")
    .replace(/改善する？$/, "改善につながるのか？")
    .replace(/なる？$/, "なるのか？")
    .replace(/べき？$/, "べきなのか？")
    .replace(/？$/, "のか？");
  return `鍼灸師が考える\n「${cleaned}」`;
}

function specialtyTagsForCategory(value) {
  const base = {
    "ストレッチ": ["運動器", "筋肉評価"],
    "姿勢・骨盤矯正": ["運動器", "動作分析"],
    "筋膜・トリガーポイント": ["慢性痛", "筋肉評価"],
    "筋トレ・運動": ["運動器", "動作分析"],
    "痛み・神経": ["慢性痛", "運動器"],
    "鍼灸・治療": ["鍼灸", "慢性痛"],
    "SNS健康情報": ["健康情報検証"]
  };
  return base[value] || [];
}

function baseArticle(topic) {
  return {
    title: topic.title,
    slug: topic.slug,
    category: topic.category,
    tags: [topic.category],
    verdict: "⚠️ 一部正しい",
    description: "",
    conclusion: "公開前に本文を確認してください。",
    snsClaim: `${topic.title}という主張がSNSで見られることがあります。`,
    whyItSpread: "短い言葉で説明しやすく、体感談として広まりやすいテーマです。",
    currentEvidence: "現時点の研究や公的情報を確認し、根拠が弱い場合は弱いと明記してください。確認できない文献は作らないでください。",
    commonMisunderstandings: "個人の体験談をすべての人に当てはまる結論として扱わないようにします。",
    practicalView: "体の状態や目的によって考え方が変わるため、一般情報として整理します。",
    acupuncturistView: "鍼灸師としては、症状や生活背景を合わせて見ることが大切だと考えます。",
    faq: [
      {
        question: "この情報だけで判断してよいですか？",
        answer: "いいえ。医療診断ではなく、健康情報を整理するための目安として確認してください。"
      }
    ],
    summary: "公開前に内容、表現、参考情報を人間が確認してください。",
    references: [],
    authorName: SITE_ENTITY.supervisorName,
    authorUrl: SITE_ENTITY.clinicProfilePath,
    reviewedBy: SITE_ENTITY.supervisorName,
    reviewerUrl: SITE_ENTITY.clinicProfilePath,
    clinicName: SITE_ENTITY.clinicName,
    clinicUrl: SITE_ENTITY.clinicProfilePath,
    specialtyTags: specialtyTagsForCategory(topic.category),
    datePublished: null,
    dateModified: today(),
    citation: [],
    relatedClinicPage: SITE_ENTITY.clinicProfilePath,
    reelTitle: buildNaturalReelTitle(topic.title),
    reelScript: "このテーマは、SNSでもよく見かけます。ただ、体の状態や目的によって考え方は変わります。大切なのは、ひとつの情報だけで決めつけず、根拠やリスクも一緒に見ることです。詳しくはHealth Check Labの記事で整理します。",
    instagramCaption: "SNSで見かける健康情報は、短く分かりやすい一方で、条件や注意点が省かれやすいことがあります。この記事では、根拠と注意点を整理します。\n\n※医療診断ではありません。強い症状がある場合は医療機関へ相談してください。",
    youtubeDescription: "SNSで見かける健康情報について、参考にできる度合いを整理します。Health Check Labの記事では、根拠・注意点・誤解されやすいポイントを確認できます。\n\n※医療診断ではありません。",
    generationStatus: "draft",
    generatedAt: new Date().toISOString(),
    createdAt: today(),
    updatedAt: today(),
    publishedAt: null,
    status: "draft"
  };
}

function mergeArticle(base, draft, existing = {}) {
  const merged = {
    ...base,
    ...existing,
    ...draft
  };
  return {
    ...merged,
    reelTitle: merged.reelTitle || "",
    reelScript: merged.reelScript || "",
    instagramCaption: merged.instagramCaption || "",
    youtubeDescription: merged.youtubeDescription || "",
    generationStatus: "draft",
    generatedAt: new Date().toISOString(),
    updatedAt: today(),
    status: existing.status || "draft",
    publishedAt: existing.publishedAt || null
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

function buildPrompt(topic, existing) {
  return [
    "あなたはHealth Check Labの記事・SNS素材の下書き作成を補助します。",
    "医療診断、治療効果の断定、病名推定はしません。",
    "確認できない論文や参考文献を作らないでください。",
    "根拠が弱い場合は、根拠が弱いと明記してください。",
    "公開前に人間が確認するdraftとして作成してください。",
    "ハリプラス鍼灸院への強い相談誘導はしないでください。",
    "出力はJSONのみです。",
    "",
    `テーマ: ${topic.title}`,
    `カテゴリ: ${topic.category}`,
    "",
    "必要フィールド:",
    "title, slug, category, verdict, description, conclusion, snsClaim, whyItSpread, currentEvidence, commonMisunderstandings, practicalView, acupuncturistView, faq, summary, references, reelTitle, reelScript, instagramCaption, youtubeDescription",
    "",
    "reelTitleは「鍼灸師が考える\\n「自然な疑問文」」形式。",
    "reelScriptは30秒前後で自然に話せる文章。",
    "instagramCaptionとyoutubeDescriptionは過剰な宣伝や誇大表現を避ける。",
    "",
    `既存記事JSON: ${JSON.stringify(existing || {})}`
  ].join("\n");
}

async function callOpenAI(topic, existing) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Use --template for a non-AI draft.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: buildPrompt(topic, existing),
      text: { format: { type: "json_object" } }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI API request failed.");
  }

  const text =
    data.output_text ||
    data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text ||
    "";
  return extractJson(text);
}

async function main() {
  const content = validateContent(root);
  if (content.errors.length) {
    console.error("Content validation must pass before generation:");
    content.errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  const topics = readJson(root, TOPICS_PATH, []);
  const topic = pickTopic(topics);
  if (!topic) {
    usage();
    console.error(topicSlug ? `Topic not found: ${topicSlug}` : "No unused topic found.");
    process.exit(1);
  }

  const slugs = readJson(root, ARTICLE_INDEX_PATH, []);
  const existing = readJson(root, articlePath(topic.slug), null);
  const base = baseArticle(topic);
  const draft = templateOnly ? {} : await callOpenAI(topic, existing);
  const article = mergeArticle(base, {
    ...draft,
    title: topic.title,
    slug: topic.slug,
    category: topic.category,
    generationStatus: "draft",
    status: existing?.status || "draft"
  }, existing || {});

  if (!slugs.includes(topic.slug)) {
    writeJson(root, ARTICLE_INDEX_PATH, [...slugs, topic.slug]);
  }
  writeJson(root, articlePath(topic.slug), article);

  console.log(`Generated article and social draft: ${articlePath(topic.slug)}`);
  console.log("generationStatus: draft");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
