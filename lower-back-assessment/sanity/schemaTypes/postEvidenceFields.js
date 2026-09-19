import { defineArrayMember, defineField } from "sanity";

export const postEvidenceFields = [
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
