const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const cache = new Map();

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function trimText(value) {
  return String(value || "").slice(0, 3000);
}

function cacheKey(input) {
  return JSON.stringify(input).slice(0, 3400);
}

function parseOutput(data) {
  const text = data.output_text || data.output?.[0]?.content?.[0]?.text;
  if (!text) throw new Error("OpenAI response was empty");
  return JSON.parse(text);
}

async function callOpenAI(payload) {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        {
          role: "system",
          content:
            "You analyze Japanese health videos and social media posts. Do not diagnose. Do not decide whether a claim is medically true or false. Do not guarantee treatment effects. Evaluate how safely the content can be used as a reference. Return only valid Japanese JSON."
        },
        {
          role: "user",
          content:
            "次の健康動画・SNS投稿を分析してください。医学的真偽を断定せず、安心して参考にできる度合いとして整理してください。\n\n" +
            JSON.stringify(payload)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "health_content_reference_check",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              trust_score: { type: "integer", minimum: 0, maximum: 100 },
              label: { type: "string" },
              claim_summary: { type: "string" },
              claim_category: { type: "string" },
              evidence_level: { type: "string" },
              good_points: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
              cautions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
              dangerous_expressions: { type: "array", items: { type: "string" }, maxItems: 6 },
              missing_information: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
              what_to_check_next: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
              when_to_see_doctor: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 }
            },
            required: [
              "trust_score",
              "label",
              "claim_summary",
              "claim_category",
              "evidence_level",
              "good_points",
              "cautions",
              "dangerous_expressions",
              "missing_information",
              "what_to_check_next",
              "when_to_see_doctor"
            ]
          },
          strict: true
        }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "OpenAI API error");
  }

  return parseOutput(await response.json());
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POSTのみ対応しています。" });
  if (!process.env.OPENAI_API_KEY) {
    return json(500, { error: "OpenAI APIキーがNetlifyに設定されていません。" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const fields = {
      url: trimText(body.url),
      video_content: trimText(body.video_content),
      subtitles: trimText(body.subtitles),
      post_text: trimText(body.post_text || body.text),
      caption: trimText(body.caption)
    };
    const combined = trimText(
      [
        fields.video_content && `動画内容:\n${fields.video_content}`,
        fields.subtitles && `字幕:\n${fields.subtitles}`,
        fields.post_text && `投稿文:\n${fields.post_text}`,
        fields.caption && `キャプション:\n${fields.caption}`
      ]
        .filter(Boolean)
        .join("\n\n")
    );

    if (combined.length < 20) {
      return json(400, { error: "入力内容が短いためAI判定は行いません。20文字以上入力してください。" });
    }

    const input = { url: fields.url, content_for_analysis: combined };
    const key = cacheKey(input);
    if (cache.has(key)) return json(200, { cached: true, analysis: cache.get(key) });

    const analysis = await callOpenAI(input);
    cache.set(key, analysis);
    return json(200, { cached: false, analysis });
  } catch (error) {
    return json(500, {
      error: "AI判定中にエラーが発生しました。通常のチェック機能はそのまま利用できます。"
    });
  }
};
