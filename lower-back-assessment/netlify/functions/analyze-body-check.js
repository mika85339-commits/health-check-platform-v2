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
            "You support a Japanese body movement self-check platform. Do not diagnose. Do not infer disease names. Do not calculate scores. Never say a muscle is the cause. Explain the rule-based result in patient-friendly Japanese and phrase muscles as '関係している可能性があります'. Return only valid Japanese JSON."
        },
        {
          role: "user",
          content:
            "次の体の動作セルフチェック結果を、診断ではなくセルフチェックの補足説明として整理してください。\n\n" +
            JSON.stringify(payload)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "body_check_explanation",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              result_summary: { type: "string" },
              burden_pattern: { type: "string" },
              muscle_reasons: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    muscle: { type: "string" },
                    reason: { type: "string" }
                  },
                  required: ["muscle", "reason"]
                },
                minItems: 1,
                maxItems: 4
              },
              selfcare_direction: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
              avoid_actions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
              when_to_see_doctor: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
              share_text: { type: "string" },
              medical_disclaimer: { type: "string" }
            },
            required: [
              "result_summary",
              "burden_pattern",
              "muscle_reasons",
              "selfcare_direction",
              "avoid_actions",
              "when_to_see_doctor",
              "share_text",
              "medical_disclaimer"
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
    const text = trimText(body.text || body.summary || JSON.stringify(body.result || body));
    if (text.trim().length < 20) {
      return json(400, { error: "入力内容が短いためAI判定は行いません。20文字以上入力してください。" });
    }

    const input = { content_for_analysis: text };
    const key = cacheKey(input);
    if (cache.has(key)) return json(200, { cached: true, analysis: cache.get(key) });

    const analysis = await callOpenAI(input);
    cache.set(key, analysis);
    return json(200, { cached: false, analysis });
  } catch (error) {
    return json(500, {
      error: "AI判定中にエラーが発生しました。通常のセルフチェック結果はそのまま利用できます。"
    });
  }
};
