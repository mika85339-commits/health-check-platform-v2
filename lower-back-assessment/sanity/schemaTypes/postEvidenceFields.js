import { defineArrayMember, defineField } from "sanity";

export const postEvidenceFields = [
  defineField({
    name: "articleGuide",
    title: "記事冒頭の案内",
    description: "読者の疑問、短い回答、要点整理を記事冒頭に表示します。未設定の記事には表示しません。",
    type: "object",
    fields: [
      defineField({ name: "readerQuestion", title: "読者の疑問", type: "string" }),
      defineField({ name: "answer", title: "短い回答", type: "text", rows: 4 }),
      defineField({
        name: "details",
        title: "補足説明",
        type: "array",
        of: [defineArrayMember({ type: "text", rows: 3 })]
      }),
      defineField({
        name: "keyPoints",
        title: "この記事でわかること",
        type: "array",
        of: [defineArrayMember({ type: "string" })]
      }),
      defineField({
        name: "visualGuide",
        title: "要点整理",
        type: "object",
        fields: [
          defineField({ name: "heading", title: "見出し", type: "string" }),
          defineField({ name: "lead", title: "説明", type: "text", rows: 2 }),
          defineField({
            name: "items",
            title: "確認項目",
            type: "array",
            of: [
              defineArrayMember({
                type: "object",
                fields: [
                  defineField({ name: "label", title: "ラベル", type: "string" }),
                  defineField({ name: "text", title: "説明", type: "text", rows: 2 })
                ],
                preview: { select: { title: "label", subtitle: "text" } }
              })
            ]
          }),
          defineField({ name: "note", title: "注意書き", type: "text", rows: 3 })
        ]
      })
    ]
  }),
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
