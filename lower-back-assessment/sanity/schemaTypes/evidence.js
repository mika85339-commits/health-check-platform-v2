import { defineArrayMember, defineField, defineType } from "sanity";

const studyTypes = [
  ["systematic-review", "システマティックレビュー"],
  ["meta-analysis", "メタアナリシス"],
  ["guideline", "診療ガイドライン"],
  ["randomized-controlled-trial", "ランダム化比較試験"],
  ["cohort", "コホート研究"],
  ["case-control", "症例対照研究"],
  ["cross-sectional", "横断研究"],
  ["mechanistic", "作用機序研究"],
  ["other", "その他"]
].map(([value, title]) => ({ title, value }));

const certaintyLevels = [
  ["high", "高"],
  ["moderate", "中"],
  ["low", "低"],
  ["very-low", "非常に低い"],
  ["not-assessed", "未評価"]
].map(([value, title]) => ({ title, value }));

export const evidence = defineType({
  name: "evidence",
  title: "医学研究エビデンス",
  type: "document",
  fields: [
    defineField({ name: "title", title: "研究・資料名", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "condition", title: "対象疾患・状態", type: "array", of: [defineArrayMember({ type: "string" })], validation: (rule) => rule.min(1).required() }),
    defineField({ name: "intervention", title: "介入", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "comparator", title: "比較対照", type: "string" }),
    defineField({ name: "population", title: "対象集団", type: "text", rows: 3, validation: (rule) => rule.required() }),
    defineField({ name: "studyType", title: "研究デザイン", type: "string", options: { list: studyTypes, layout: "dropdown" }, validation: (rule) => rule.required() }),
    defineField({ name: "sampleSize", title: "サンプルサイズ", type: "number", validation: (rule) => rule.integer().positive() }),
    defineField({
      name: "outcomes",
      title: "評価項目",
      type: "array",
      of: [
        defineArrayMember({
          name: "outcome",
          title: "評価項目",
          type: "object",
          fields: [
            defineField({ name: "name", title: "名称", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "result", title: "結果", type: "text", rows: 3 }),
            defineField({ name: "timepoint", title: "評価時点", type: "string" })
          ],
          preview: { select: { title: "name", subtitle: "timepoint" } }
        })
      ]
    }),
    defineField({ name: "effectSummary", title: "効果の要約", type: "text", rows: 5, validation: (rule) => rule.required() }),
    defineField({ name: "certainty", title: "確実性", type: "string", options: { list: certaintyLevels, layout: "radio" }, validation: (rule) => rule.required() }),
    defineField({ name: "limitations", title: "研究の限界", type: "text", rows: 5, validation: (rule) => rule.required() }),
    defineField({ name: "pubmedId", title: "PubMed ID", type: "string", validation: (rule) => rule.regex(/^\d+$/, { name: "PMID", invert: false }).warning("数字のみを入力してください") }),
    defineField({ name: "doi", title: "DOI", type: "string", validation: (rule) => rule.regex(/^10\.\d{4,9}\/\S+$/i, { name: "DOI", invert: false }).warning("10. から始まるDOI形式を確認してください") }),
    defineField({ name: "sourceUrl", title: "一次資料URL", type: "url", validation: (rule) => rule.uri({ scheme: ["https"] }).required() }),
    defineField({ name: "publicationYear", title: "出版年", type: "number", validation: (rule) => rule.integer().min(1900).max(new Date().getFullYear()) }),
    defineField({ name: "reviewedAt", title: "最終確認日", type: "date", validation: (rule) => rule.required() }),
    defineField({ name: "reviewer", title: "確認者", type: "reference", to: [{ type: "author" }], validation: (rule) => rule.required() }),
    defineField({ name: "tags", title: "タグ", type: "array", of: [defineArrayMember({ type: "reference", to: [{ type: "tag" }] })], validation: (rule) => rule.unique() })
  ],
  preview: {
    select: { title: "title", studyType: "studyType", year: "publicationYear" },
    prepare({ title, studyType, year }) {
      return { title, subtitle: [studyType, year].filter(Boolean).join(" / ") };
    }
  }
});
