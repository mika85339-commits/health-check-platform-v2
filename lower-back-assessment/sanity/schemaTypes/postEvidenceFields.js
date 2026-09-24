import { defineArrayMember, defineField } from "sanity";

export const postEvidenceFields = [
  defineField({
    name: "diagnosisGuide",
    title: "記事からセルフチェックへの案内",
    description: "記事の内容に合う案内文と対象部位を設定します。未設定の記事は既存の汎用案内を表示します。",
    type: "object",
    fields: [
      defineField({ name: "heading", title: "見出し", type: "string" }),
      defineField({ name: "description", title: "説明", type: "text", rows: 3 }),
      defineField({ name: "label", title: "リンク文言", type: "string" }),
      defineField({
        name: "bodyPart",
        title: "対象部位",
        type: "string",
        options: {
          list: [
            { title: "首", value: "neck" },
            { title: "肩", value: "shoulder" },
            { title: "腰", value: "lower-back" },
            { title: "股関節", value: "hip" },
            { title: "膝", value: "knee" }
          ],
          layout: "radio"
        },
        validation: (rule) => rule.required()
      })
    ]
  }),
  defineField({
    name: "clinicalSummary",
    title: "医学情報の要約",
    type: "object",
    fields: [
      defineField({ name: "conclusion", title: "結論", type: "text", rows: 4 }),
      defineField({ name: "known", title: "現在分かっていること", type: "text", rows: 5 }),
      defineField({ name: "researchFindings", title: "研究結果", type: "text", rows: 5 }),
      defineField({ name: "limitations", title: "研究の限界", type: "text", rows: 5 })
    ]
  }),
  defineField({
    name: "evidenceClaims",
    title: "主張と根拠の対応",
    description: "記事上の主張と、根拠にした研究を追跡できるようにします。",
    type: "array",
    of: [
      defineArrayMember({
        name: "evidenceClaim",
        title: "主張と根拠",
        type: "object",
        fields: [
          defineField({ name: "claim", title: "サイト上の主張", type: "text", rows: 3, validation: (rule) => rule.required() }),
          defineField({ name: "interpretation", title: "研究からの解釈", type: "text", rows: 4, validation: (rule) => rule.required() }),
          defineField({ name: "limitations", title: "この主張の限界", type: "text", rows: 3, validation: (rule) => rule.required() }),
          defineField({
            name: "evidence",
            title: "参照エビデンス",
            type: "array",
            of: [defineArrayMember({ type: "reference", to: [{ type: "evidence" }] })],
            validation: (rule) => rule.min(1).required().unique()
          })
        ],
        preview: { select: { title: "claim", subtitle: "interpretation" } }
      })
    ]
  }),
  defineField({ name: "reviewedAt", title: "医学情報の最終確認日", type: "date" }),
  defineField({ name: "reviewer", title: "医学情報の確認者", type: "reference", to: [{ type: "author" }] })
];
